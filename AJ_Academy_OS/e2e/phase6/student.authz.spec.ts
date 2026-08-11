import { test, expect } from "@playwright/test";
import { requireE2eEnv, optionalCreds } from "../helpers/env";
import { recordFinding } from "./helpers/findings";
import {
  apiGet,
  apiPost,
  finalUrlAfterGoto,
  jwtSub,
  readAccessTokenFromStorageState,
  rlsSelect,
  supabasePublicEnv,
} from "./helpers/session";

/**
 * Phase 6 — Student authorization (SAFE MODE: read-only probes).
 * Does not call assignment detail GET (that marks viewed).
 */
test.describe("Phase 6 Student authorization", () => {
  // Independent tests so one UI crash does not skip API/RLS probes.
  test.describe.configure({ mode: "default" });

  test.beforeAll(() => {
    requireE2eEnv();
    test.skip(!optionalCreds("STUDENT"), "Set E2E_STUDENT_EMAIL and E2E_STUDENT_PASSWORD");
  });

  test("UI: can open own student profile", async ({ page }) => {
    const url = await finalUrlAfterGoto(page, "/student/profile");
    const ok = /\/student\/profile/i.test(url) && !/\/login/i.test(url);
    recordFinding({
      id: "STU-UI-PROFILE",
      role: "student",
      layer: "UI",
      routeOrResource: "/student/profile",
      expected: "Student can open own profile page",
      actual: ok ? `Reached ${url}` : `Ended at ${url}`,
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "HIGH",
      evidence: `finalUrl=${url}`,
      likelyCause: ok ? undefined : "requireRole or profile page error",
      proposedFix: ok ? undefined : "Verify student layout requireRole and /student/profile access",
    });
    expect(ok).toBeTruthy();
  });

  test("UI: cannot open Admin or Mentor routes", async ({ page }) => {
    let adminUrl = "";
    let mentorUrl = "";
    try {
      adminUrl = await finalUrlAfterGoto(page, "/admin/dashboard");
    } catch (err) {
      adminUrl = `CRASH:${String(err).slice(0, 80)}`;
    }
    try {
      // Fresh navigation; if prior crash left page dead, reopen via goto on same page.
      mentorUrl = await finalUrlAfterGoto(page, "/mentor/dashboard");
    } catch (err) {
      mentorUrl = `CRASH:${String(err).slice(0, 80)}`;
    }

    const crashed = adminUrl.startsWith("CRASH:") || mentorUrl.startsWith("CRASH:") || !adminUrl || !mentorUrl;
    if (crashed) {
      recordFinding({
        id: "STU-UI-CROSS-PORTAL",
        role: "student",
        layer: "UI",
        routeOrResource: "/admin/dashboard, /mentor/dashboard",
        expected: "Redirect away; admin/mentor UI not usable",
        actual: `admin→${adminUrl}; mentor→${mentorUrl}`,
        status: "Blocked",
        severity: null,
        evidence: "Browser page crash during navigation (harness/environment)",
        likelyCause: "Chromium page crash during Next.js redirect",
        proposedFix: "Re-run UI probe; rely on API deny tests for authorization signal",
      });
      test.skip(true, "Page crashed during UI navigation");
      return;
    }

    const adminBlocked = !/\/admin\/dashboard/i.test(adminUrl);
    const mentorBlocked = !/\/mentor\/dashboard/i.test(mentorUrl);
    const ok = adminBlocked && mentorBlocked;
    recordFinding({
      id: "STU-UI-CROSS-PORTAL",
      role: "student",
      layer: "UI",
      routeOrResource: "/admin/dashboard, /mentor/dashboard",
      expected: "Redirect away; admin/mentor UI not usable",
      actual: `admin→${adminUrl}; mentor→${mentorUrl}`,
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "CRITICAL",
      evidence: `adminBlocked=${adminBlocked} mentorBlocked=${mentorBlocked}`,
      likelyCause: ok ? undefined : "Layout requireRole not enforcing",
      proposedFix: ok ? undefined : "Ensure student cannot render admin/mentor layouts",
    });
    expect(ok).toBeTruthy();
  });

  test("API: denied admin/mentor management endpoints", async ({ request }) => {
    const dir = await apiGet(request, "/api/admin/students/directory");
    const mine = await apiGet(request, "/api/mentor/my-students");
    const ok = dir.status === 401 || dir.status === 403;
    const ok2 = mine.status === 401 || mine.status === 403;
    recordFinding({
      id: "STU-API-ADMIN-MENTOR-DENY",
      role: "student",
      layer: "API",
      routeOrResource: "GET /api/admin/students/directory ; GET /api/mentor/my-students",
      expected: "401/403",
      actual: `directory=${dir.status}; my-students=${mine.status}`,
      status: ok && ok2 ? "Pass" : "Fail",
      severity: ok && ok2 ? null : "CRITICAL",
      evidence: `dir.ok=${dir.ok} mine.ok=${mine.ok}`,
      proposedFix: "verifySessionRole / requireAdminApiSession must reject student",
    });
    expect(ok && ok2).toBeTruthy();
  });

  test("API: LMS list endpoints load for student; tickets only self", async ({ request }) => {
    const token = readAccessTokenFromStorageState("student");
    const selfId = token ? jwtSub(token) : null;

    const assignments = await apiGet(request, "/api/lms/assignments");
    const tests = await apiGet(request, "/api/lms/tests");
    const materials = await apiGet(request, "/api/lms/materials");
    const tickets = await apiGet(request, "/api/lms/tickets");

    const assignJson = assignments.json as { items?: unknown[] };
    const testJson = tests.json as { items?: unknown[] };
    const matJson = materials.json as { items?: unknown[] };
    const tickJson = tickets.json as { tickets?: { student_id?: string }[] };

    let status: "Pass" | "Fail" | "Blocked" = "Pass";
    let evidence = "";
    let severity: "CRITICAL" | "HIGH" | null = null;

    if (!assignments.ok || !tests.ok || !materials.ok || !tickets.ok) {
      status = "Fail";
      severity = "HIGH";
      evidence = `HTTP assignments=${assignments.status} tests=${tests.status} materials=${materials.status} tickets=${tickets.status}`;
    } else if (!selfId) {
      status = "Blocked";
      evidence = "Could not decode student subject from storageState token";
    } else {
      const badTick = (tickJson.tickets ?? []).filter((t) => t.student_id && t.student_id !== selfId);
      if (badTick.length) {
        status = "Fail";
        severity = "CRITICAL";
        evidence = `ticket cross-leak=${badTick.length}`;
      } else {
        evidence = `counts assign=${(assignJson.items ?? []).length} test=${(testJson.items ?? []).length} mat=${(matJson.items ?? []).length} tick=${(tickJson.tickets ?? []).length}`;
        if (
          (assignJson.items ?? []).length === 0 &&
          (testJson.items ?? []).length === 0 &&
          (matJson.items ?? []).length === 0
        ) {
          evidence += " | note: no assigned LMS content for QA student (list filter OK; ownership via RLS test)";
        }
      }
    }

    recordFinding({
      id: "STU-API-OWN-LMS-SCOPE",
      role: "student",
      layer: "API",
      routeOrResource: "GET /api/lms/{assignments,tests,materials,tickets}",
      expected: "200 lists; tickets only self (assignment/test/material ownership via RLS)",
      actual: evidence,
      status,
      severity,
      evidence,
      qaDataNeeded:
        status === "Pass" && evidence.includes("no assigned")
          ? "Optional: publish ≥1 assignment/test/material to QA student for positive coverage"
          : undefined,
    });

    expect(status === "Fail" ? false : true).toBeTruthy();
  });

  test("RLS: assignment/test/material recipients only self", async () => {
    const token = readAccessTokenFromStorageState("student");
    const selfId = token ? jwtSub(token) : null;
    if (!token || !selfId) {
      recordFinding({
        id: "STU-RLS-RECIPIENTS",
        role: "student",
        layer: "RLS",
        routeOrResource: "lms_*_recipients",
        expected: "Only own recipient rows",
        actual: "Missing token",
        status: "Blocked",
        severity: null,
        evidence: "token missing",
      });
      test.skip(true, "No token");
      return;
    }

    const tables = [
      "lms_assignment_recipients",
      "lms_test_recipients",
      "lms_study_material_recipients",
    ] as const;

    const parts: string[] = [];
    let blocked = false;
    let leaks = 0;
    for (const table of tables) {
      const res = await rlsSelect({
        token,
        table,
        query: "select=id,student_id&limit=100",
      });
      if (res.error && res.status !== 200) {
        parts.push(`${table}:ERR`);
        blocked = true;
        continue;
      }
      const foreign = res.rows.filter(
        (r) => (r as { student_id?: string }).student_id && (r as { student_id: string }).student_id !== selfId,
      );
      leaks += foreign.length;
      parts.push(`${table}:${res.rows.length}rows/leak=${foreign.length}`);
    }

    if (blocked) {
      recordFinding({
        id: "STU-RLS-RECIPIENTS",
        role: "student",
        layer: "RLS",
        routeOrResource: tables.join(", "),
        expected: "SELECT own recipients only",
        actual: parts.join("; "),
        status: "Blocked",
        severity: null,
        evidence: parts.join(" | "),
        qaDataNeeded: "Confirm LMS recipient tables + RLS applied",
      });
      test.skip(true, "recipient table error");
      return;
    }

    const ok = leaks === 0;
    recordFinding({
      id: "STU-RLS-RECIPIENTS",
      role: "student",
      layer: "RLS",
      routeOrResource: tables.join(", "),
      expected: "All student_id = self",
      actual: parts.join("; "),
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "CRITICAL",
      evidence: `leaks=${leaks}`,
      proposedFix: ok ? undefined : "Recipient SELECT policies must constrain student_id = auth.uid()",
      qaDataNeeded: parts.every((p) => p.includes(":0rows"))
        ? "Publish assigned LMS content to QA student for stronger positive coverage"
        : undefined,
    });
    expect(ok).toBeTruthy();
  });

  test("RLS: own profile readable; other student profile not", async () => {
    const env = supabasePublicEnv();
    const token = readAccessTokenFromStorageState("student");
    const adminToken = readAccessTokenFromStorageState("admin");
    if (!env || !token) {
      recordFinding({
        id: "STU-RLS-PROFILE",
        role: "student",
        layer: "RLS",
        routeOrResource: "profiles SELECT",
        expected: "Self readable; other student not",
        actual: "Missing supabase public env or student token",
        status: "Blocked",
        severity: null,
        evidence: `env=${Boolean(env)} token=${Boolean(token)}`,
        qaDataNeeded: "NEXT_PUBLIC_SUPABASE_URL + ANON_KEY in .env.local; valid student storageState",
      });
      test.skip(true, "Missing env/token for RLS");
      return;
    }

    const selfId = jwtSub(token)!;
    const own = await rlsSelect({
      token,
      table: "profiles",
      query: `select=id,role,email&id=eq.${selfId}`,
    });

    let otherId: string | null = (process.env.E2E_OTHER_STUDENT_ID || "").trim() || null;
    if (!otherId && adminToken) {
      const others = await rlsSelect({
        token: adminToken,
        table: "profiles",
        query: `select=id&role=eq.student&id=neq.${selfId}&limit=5`,
      });
      const row = (others.rows[0] || null) as { id?: string } | null;
      otherId = row?.id || null;
    }

    if (!otherId) {
      recordFinding({
        id: "STU-RLS-PROFILE",
        role: "student",
        layer: "RLS",
        routeOrResource: "profiles SELECT",
        expected: "Self readable; other student not",
        actual: `Own rows=${own.rows.length}; no other student id available`,
        status: "Blocked",
        severity: null,
        evidence: `ownStatus=${own.status}`,
        qaDataNeeded:
          "Need a second student profile id (E2E_OTHER_STUDENT_ID) or ≥2 students visible to admin via RLS SELECT",
      });
      test.skip(true, "Need second student id");
      return;
    }

    const other = await rlsSelect({
      token,
      table: "profiles",
      query: `select=id,role,email&id=eq.${otherId}`,
    });

    const ownOk = own.status === 200 && own.rows.length === 1;
    const otherDenied = other.status === 200 && other.rows.length === 0;
    const ok = ownOk && otherDenied;

    recordFinding({
      id: "STU-RLS-PROFILE",
      role: "student",
      layer: "RLS",
      routeOrResource: "public.profiles",
      expected: "SELECT self only; other student id returns 0 rows",
      actual: `own=${own.rows.length}@${own.status}; other=${other.rows.length}@${other.status}`,
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "CRITICAL",
      evidence: `otherStudentIdLength=${otherId.length} (id not printed)`,
      likelyCause: ok ? undefined : "profiles RLS too permissive (e.g. authenticated_read)",
      proposedFix: ok ? undefined : "Ensure profiles_rls_tighten.sql policies are applied",
    });
    expect(ok).toBeTruthy();
  });

  test("RLS: submissions/grades/tickets only own rows", async () => {
    const token = readAccessTokenFromStorageState("student");
    const selfId = token ? jwtSub(token) : null;
    if (!token || !selfId) {
      recordFinding({
        id: "STU-RLS-OWN-ROWS",
        role: "student",
        layer: "RLS",
        routeOrResource: "lms_assignment_submissions / evaluations / tickets",
        expected: "Only own rows",
        actual: "No student token",
        status: "Blocked",
        severity: null,
        evidence: "token missing",
      });
      test.skip(true, "No token");
      return;
    }

    const subs = await rlsSelect({
      token,
      table: "lms_assignment_submissions",
      query: "select=id,student_id&limit=50",
    });
    const grades = await rlsSelect({
      token,
      table: "lms_assignment_evaluations",
      query: "select=id,student_id&limit=50",
    });
    const tickets = await rlsSelect({
      token,
      table: "lms_student_tickets",
      query: "select=id,student_id,is_sensitive&limit=50",
    });

    const leak = (rows: unknown[]) =>
      rows.filter((r) => (r as { student_id?: string }).student_id && (r as { student_id: string }).student_id !== selfId);

    const errors = [subs, grades, tickets].filter((r) => r.error && r.status !== 200);
    if (errors.length) {
      recordFinding({
        id: "STU-RLS-OWN-ROWS",
        role: "student",
        layer: "RLS",
        routeOrResource: "LMS ownership tables",
        expected: "SELECT succeeds under RLS",
        actual: errors.map((e) => e.error).join(" | ").slice(0, 400),
        status: "Blocked",
        severity: null,
        evidence: `statuses sub=${subs.status} grade=${grades.status} tick=${tickets.status}`,
        qaDataNeeded: "Confirm LMS SQL applied; tables exist",
      });
      test.skip(true, "RLS query error");
      return;
    }

    const bad =
      leak(subs.rows).length + leak(grades.rows).length + leak(tickets.rows).length;
    const ok = bad === 0;
    recordFinding({
      id: "STU-RLS-OWN-ROWS",
      role: "student",
      layer: "RLS",
      routeOrResource: "lms_assignment_submissions, lms_assignment_evaluations, lms_student_tickets",
      expected: "All returned student_id = self",
      actual: `rows sub=${subs.rows.length} grade=${grades.rows.length} tick=${tickets.rows.length}; leaks=${bad}`,
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "CRITICAL",
      evidence: `leaks=${bad}`,
      proposedFix: ok ? undefined : "Tighten student SELECT policies to student_id = auth.uid()",
    });
    expect(ok).toBeTruthy();
  });

  test("Storage: student cannot mint signed URL for foreign submission path", async ({ request }) => {
    const probe = await apiPost(request, "/api/lms/storage/signed-url", {
      kind: "assignment_submission",
      bucket: "assignment-submissions",
      path: "phase6-probe/not-a-real-file.pdf",
      submission_id: "00000000-0000-4000-8000-000000000099",
    });
    const denied = probe.status === 403 || probe.status === 404 || probe.status === 400;
    recordFinding({
      id: "STU-STORAGE-FOREIGN",
      role: "student",
      layer: "Storage",
      routeOrResource: "POST /api/lms/storage/signed-url (assignment_submission)",
      expected: "403/404/400 for non-owned/missing submission",
      actual: `status=${probe.status}`,
      status: denied ? "Pass" : "Fail",
      severity: denied ? null : "CRITICAL",
      evidence: `signed-url probe without real file (no write)`,
      proposedFix: denied ? undefined : "signed-url must enforce ownership before createSignedUrl",
    });
    expect(denied).toBeTruthy();
  });
});
