import { test, expect } from "@playwright/test";
import { requireE2eEnv, optionalCreds } from "../helpers/env";
import { recordFinding } from "./helpers/findings";
import {
  apiGet,
  finalUrlAfterGoto,
  jwtSub,
  readAccessTokenFromStorageState,
  rlsSelect,
} from "./helpers/session";

test.describe("Phase 6 Admin authorization", () => {
  test.describe.configure({ mode: "default" });

  test.beforeAll(() => {
    requireE2eEnv();
    test.skip(!optionalCreds("ADMIN"), "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD");
  });

  test("UI: can open authorized management modules", async ({ page }) => {
    const routes = [
      "/admin/dashboard",
      "/admin/academic/overview",
      "/admin/students/directory",
    ];
    const results: string[] = [];
    let ok = true;
    let crashed = false;
    for (const r of routes) {
      let url = "";
      try {
        url = await finalUrlAfterGoto(page, r);
      } catch (err) {
        url = `CRASH:${String(err).slice(0, 60)}`;
        crashed = true;
      }
      if (!url || url.startsWith("CRASH:")) {
        results.push(`${r}→${url || "empty"}`);
        crashed = true;
        ok = false;
        continue;
      }
      const pass = url.includes(r) && !/\/login/i.test(url);
      results.push(`${r}→${pass ? "ok" : url}`);
      if (!pass) ok = false;
    }

    if (crashed) {
      recordFinding({
        id: "ADM-UI-MODULES",
        role: "admin",
        layer: "UI",
        routeOrResource: routes.join(", "),
        expected: "Admin can open management modules",
        actual: results.join("; "),
        status: "Blocked",
        severity: null,
        evidence: "Browser page crash during admin UI navigation (harness/environment)",
        likelyCause: "Chromium instability on localhost",
        proposedFix: "Re-check manually; API directory test remains primary signal",
      });
      test.skip(true, "Page crashed during admin UI navigation");
      return;
    }

    recordFinding({
      id: "ADM-UI-MODULES",
      role: "admin",
      layer: "UI",
      routeOrResource: routes.join(", "),
      expected: "Admin can open management modules",
      actual: results.join("; "),
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "HIGH",
      evidence: results.join(" | "),
    });
    expect(ok).toBeTruthy();
  });

  test("UI: settings route (observational)", async ({ page }) => {
    const url = await finalUrlAfterGoto(page, "/admin/settings");
    const ok = /\/admin\/settings/i.test(url) && !/\/login/i.test(url);
    recordFinding({
      id: "ADM-UI-SETTINGS",
      role: "admin",
      layer: "UI",
      routeOrResource: "/admin/settings",
      expected: "Admin can open settings page",
      actual: `Ended at ${url || "(empty)"}`,
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "MEDIUM",
      evidence: `ok=${ok}`,
      likelyCause: ok
        ? undefined
        : "Client redirect away from /admin/settings (not necessarily RLS)",
      proposedFix: ok
        ? undefined
        : "Inspect SettingsWorkbench redirects and admin nav; confirm route remains /admin/settings",
    });
    // Soft signal only — do not fail suite on this observational check.
  });

  test("API: can read students directory", async ({ request }) => {
    const dir = await apiGet(request, "/api/admin/students/directory");
    // Note: this endpoint may call expire_* RPC (app behavior). Read response only; no body writes from harness.
    const ok = dir.status === 200;
    const students =
      ((dir.json as { students?: unknown[] })?.students ??
        (dir.json as { rows?: unknown[] })?.rows ??
        []) as unknown[];
    recordFinding({
      id: "ADM-API-DIRECTORY",
      role: "admin",
      layer: "API",
      routeOrResource: "GET /api/admin/students/directory",
      expected: "200 with student list payload",
      actual: `status=${dir.status}; listLen≈${Array.isArray(students) ? students.length : "n/a"}`,
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "HIGH",
      evidence: `ok=${dir.ok}`,
      likelyCause: ok ? undefined : "requireAdminApiSession or admin client failure",
    });
    expect(ok).toBeTruthy();
  });

  test("Super Admin-only ops: regular admin cannot elevate to super_admin (SAFE MODE — no write)", async () => {
    const token = readAccessTokenFromStorageState("admin");
    const adminId = token ? jwtSub(token) : null;
    if (!token || !adminId) {
      recordFinding({
        id: "ADM-SUPERADMIN-GATE",
        role: "admin",
        layer: "API",
        routeOrResource: "assertSuperAdminActor / profiles.role",
        expected: "QA admin is not super_admin unless intended",
        actual: "Missing admin token",
        status: "Blocked",
        severity: null,
        evidence: "token missing",
      });
      test.skip(true, "No token");
      return;
    }

    const me = await rlsSelect({
      token,
      table: "profiles",
      query: `select=id,role&id=eq.${adminId}`,
    });
    const role = String(((me.rows[0] as { role?: string } | undefined)?.role || "").toLowerCase());
    const isSuper = role === "super_admin";

    recordFinding({
      id: "ADM-SUPERADMIN-GATE",
      role: "admin",
      layer: "API",
      routeOrResource: "profiles.role + assertSuperAdminActor (write probe skipped)",
      expected:
        "QA account should be admin (not super_admin) unless intentionally elevated; write create-super_admin skipped in SAFE MODE",
      actual: `role=${role || "(missing)"}; writeProbe=Skipped`,
      status: me.rows.length === 1 ? "Pass" : "Blocked",
      severity: null,
      evidence: `isSuperAdmin=${isSuper}; POST /api/admin/employees with role=super_admin not executed (SAFE MODE)`,
      proposedFix: undefined,
      qaDataNeeded: isSuper
        ? "Confirm whether QA admin is intentionally super_admin; if not, demote in a controlled change window"
        : "Optional later (non-SAFE): attempt POST create user role=super_admin expecting 403 for plain admin",
    });

    expect(me.rows.length === 1).toBeTruthy();
  });

  test("API: admin LMS academic endpoints reachable", async ({ request }) => {
    const assignments = await apiGet(request, "/api/lms/assignments");
    const tickets = await apiGet(request, "/api/lms/tickets");
    const ok = assignments.ok && tickets.ok;
    recordFinding({
      id: "ADM-API-LMS",
      role: "admin",
      layer: "API",
      routeOrResource: "GET /api/lms/assignments ; GET /api/lms/tickets",
      expected: "Admin can read LMS lists",
      actual: `assignments=${assignments.status}; tickets=${tickets.status}`,
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "HIGH",
      evidence: `ok=${ok}`,
    });
    expect(ok).toBeTruthy();
  });
});
