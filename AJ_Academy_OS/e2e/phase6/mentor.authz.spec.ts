import { test, expect } from "@playwright/test";
import { requireE2eEnv, optionalCreds } from "../helpers/env";
import { recordFinding } from "./helpers/findings";
import {
  apiGet,
  finalUrlAfterGoto,
  jwtSub,
  readAccessTokenFromStorageState,
  rlsSelect,
  supabasePublicEnv,
} from "./helpers/session";

test.describe("Phase 6 Mentor authorization", () => {
  test.describe.configure({ mode: "default" });

  test.beforeAll(() => {
    requireE2eEnv();
    test.skip(!optionalCreds("MENTOR"), "Set E2E_MENTOR_EMAIL and E2E_MENTOR_PASSWORD");
  });

  test("UI: cannot open Admin routes", async ({ page }) => {
    const adminUrl = await finalUrlAfterGoto(page, "/admin/dashboard");
    const ok = !/\/admin\/dashboard/i.test(adminUrl);
    recordFinding({
      id: "MEN-UI-ADMIN-DENY",
      role: "mentor",
      layer: "UI",
      routeOrResource: "/admin/dashboard",
      expected: "Redirect away from admin",
      actual: `Ended at ${adminUrl}`,
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "CRITICAL",
      evidence: `adminBlocked=${ok}`,
      proposedFix: ok ? undefined : "mentor layout must not allow admin routes",
    });
    expect(ok).toBeTruthy();
  });

  test("UI: can open mentor students area", async ({ page }) => {
    const url = await finalUrlAfterGoto(page, "/mentor/students");
    const ok = /\/mentor\/students/i.test(url) && !/\/login/i.test(url);
    recordFinding({
      id: "MEN-UI-STUDENTS",
      role: "mentor",
      layer: "UI",
      routeOrResource: "/mentor/students",
      expected: "Mentor can open assigned-students UI",
      actual: `Ended at ${url}`,
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "HIGH",
      evidence: `ok=${ok}`,
    });
    expect(ok).toBeTruthy();
  });

  test("API: denied admin directory; my-students allowed", async ({ request }) => {
    const dir = await apiGet(request, "/api/admin/students/directory");
    const denied = dir.status === 401 || dir.status === 403;
    recordFinding({
      id: "MEN-API-ADMIN-DENY",
      role: "mentor",
      layer: "API",
      routeOrResource: "GET /api/admin/students/directory",
      expected: "401/403",
      actual: `status=${dir.status}`,
      status: denied ? "Pass" : "Fail",
      severity: denied ? null : "CRITICAL",
      evidence: `ok=${dir.ok}`,
    });

    // Prefer RLS over /api/mentor/my-students (API runs expire_* RPC side effect).
    const token = readAccessTokenFromStorageState("mentor");
    const mentorId = token ? jwtSub(token) : null;
    if (!token || !mentorId) {
      recordFinding({
        id: "MEN-RLS-ASSIGNED-STUDENTS",
        role: "mentor",
        layer: "RLS",
        routeOrResource: "student_mentor_assignments",
        expected: "Mentor can SELECT own assignments",
        actual: "Missing mentor token",
        status: "Blocked",
        severity: null,
        evidence: "token missing",
      });
      expect(denied).toBeTruthy();
      return;
    }

    const assigned = await rlsSelect({
      token,
      table: "student_mentor_assignments",
      query: `select=id,student_id,mentor_id,status&mentor_id=eq.${mentorId}&limit=100`,
    });

    if (assigned.error && assigned.status !== 200) {
      recordFinding({
        id: "MEN-RLS-ASSIGNED-STUDENTS",
        role: "mentor",
        layer: "RLS",
        routeOrResource: "student_mentor_assignments",
        expected: "SELECT own mentee rows",
        actual: (assigned.error || "").slice(0, 300),
        status: "Blocked",
        severity: null,
        evidence: `status=${assigned.status}`,
        qaDataNeeded: "Confirm student_mentor_assignments.sql + RLS applied; assign ≥1 student to QA mentor",
      });
    } else {
      const foreign = assigned.rows.filter(
        (r) => (r as { mentor_id?: string }).mentor_id && (r as { mentor_id: string }).mentor_id !== mentorId,
      );
      const okAssign = foreign.length === 0;
      recordFinding({
        id: "MEN-RLS-ASSIGNED-STUDENTS",
        role: "mentor",
        layer: "RLS",
        routeOrResource: "student_mentor_assignments",
        expected: "Only rows for this mentor_id",
        actual: `rows=${assigned.rows.length}; foreignMentorRows=${foreign.length}`,
        status: okAssign ? "Pass" : "Fail",
        severity: okAssign ? null : "CRITICAL",
        evidence: `rows=${assigned.rows.length}`,
        qaDataNeeded:
          assigned.rows.length === 0
            ? "Assign ≥1 student to QA mentor (student_mentor_assignments) for positive coverage"
            : undefined,
      });
      expect(okAssign).toBeTruthy();
    }

    expect(denied).toBeTruthy();
  });

  test("RLS: cannot read unrelated student profile outside mentor scope", async () => {
    const env = supabasePublicEnv();
    const mentorToken = readAccessTokenFromStorageState("mentor");
    const adminToken = readAccessTokenFromStorageState("admin");
    const mentorId = mentorToken ? jwtSub(mentorToken) : null;
    if (!env || !mentorToken || !mentorId || !adminToken) {
      recordFinding({
        id: "MEN-RLS-UNRELATED-STUDENT",
        role: "mentor",
        layer: "RLS",
        routeOrResource: "profiles (student)",
        expected: "Unrelated student not readable",
        actual: "Missing tokens/env",
        status: "Blocked",
        severity: null,
        evidence: `env=${Boolean(env)} mentor=${Boolean(mentorToken)} admin=${Boolean(adminToken)}`,
        qaDataNeeded: "Admin + mentor storageState and supabase public env",
      });
      test.skip(true, "Missing tokens");
      return;
    }

    const assigned = await rlsSelect({
      token: mentorToken,
      table: "student_mentor_assignments",
      query: `select=student_id&mentor_id=eq.${mentorId}&status=eq.active&limit=200`,
    });
    const assignedIds = new Set(
      assigned.rows.map((r) => (r as { student_id?: string }).student_id).filter(Boolean) as string[],
    );

    const allStudents = await rlsSelect({
      token: adminToken,
      table: "profiles",
      query: "select=id,department&role=eq.student&limit=50",
    });

    const mentorProf = await rlsSelect({
      token: mentorToken,
      table: "profiles",
      query: `select=id,department&id=eq.${mentorId}`,
    });
    const mentorDept = String(
      ((mentorProf.rows[0] as { department?: string } | undefined)?.department || "").toLowerCase().trim(),
    );

    const unrelated = (allStudents.rows as { id: string; department?: string }[]).find((s) => {
      if (assignedIds.has(s.id)) return false;
      const dept = String(s.department || "")
        .toLowerCase()
        .trim();
      // profiles_rls_tighten also allows same-department students
      if (mentorDept && dept && mentorDept === dept) return false;
      return true;
    });

    if (!unrelated) {
      recordFinding({
        id: "MEN-RLS-UNRELATED-STUDENT",
        role: "mentor",
        layer: "RLS",
        routeOrResource: "profiles",
        expected: "Find a student outside mentee + department scope and deny",
        actual: `assigned=${assignedIds.size}; catalog=${allStudents.rows.length}; none out-of-scope`,
        status: "Blocked",
        severity: null,
        evidence: "No out-of-scope student found among first 50",
        qaDataNeeded:
          "Provide a student in a different department, not assigned to QA mentor (or set E2E_UNRELATED_STUDENT_ID)",
      });
      test.skip(true, "No unrelated student");
      return;
    }

    const forcedId = (process.env.E2E_UNRELATED_STUDENT_ID || "").trim() || unrelated.id;
    const probe = await rlsSelect({
      token: mentorToken,
      table: "profiles",
      query: `select=id,email,role&id=eq.${forcedId}`,
    });
    const denied = probe.status === 200 && probe.rows.length === 0;
    recordFinding({
      id: "MEN-RLS-UNRELATED-STUDENT",
      role: "mentor",
      layer: "RLS",
      routeOrResource: "public.profiles",
      expected: "0 rows for out-of-scope student",
      actual: `rows=${probe.rows.length}@${probe.status}`,
      status: denied ? "Pass" : "Fail",
      severity: denied ? null : "CRITICAL",
      evidence: `probedIdLength=${forcedId.length}`,
      likelyCause: denied
        ? undefined
        : "Mentor profiles SELECT allows same-dept or broader authenticated read",
      proposedFix: denied
        ? undefined
        : "Review profiles_mentor_students_select; consider allocation-scoped reads only",
    });
    expect(denied).toBeTruthy();
  });

  test("RLS/API: mentor must not see sensitive tickets", async ({ request }) => {
    const token = readAccessTokenFromStorageState("mentor");
    if (!token) {
      recordFinding({
        id: "MEN-SENSITIVE-TICKETS",
        role: "mentor",
        layer: "RLS",
        routeOrResource: "lms_student_tickets is_sensitive",
        expected: "No sensitive tickets returned",
        actual: "No mentor token",
        status: "Blocked",
        severity: null,
        evidence: "token missing",
      });
      test.skip(true, "No token");
      return;
    }

    const viaApi = await apiGet(request, "/api/lms/tickets");
    const apiTickets = ((viaApi.json as { tickets?: { id?: string; is_sensitive?: boolean }[] })?.tickets ??
      []) as { is_sensitive?: boolean }[];
    const apiSensitive = apiTickets.filter((t) => t.is_sensitive === true);

    const viaRls = await rlsSelect({
      token,
      table: "lms_student_tickets",
      query: "select=id,is_sensitive,is_confidential&is_sensitive=eq.true&limit=20",
    });

    if (viaRls.error && viaRls.status !== 200) {
      recordFinding({
        id: "MEN-SENSITIVE-TICKETS",
        role: "mentor",
        layer: "RLS",
        routeOrResource: "lms_student_tickets",
        expected: "Sensitive tickets hidden",
        actual: (viaRls.error || "").slice(0, 300),
        status: "Blocked",
        severity: null,
        evidence: `apiStatus=${viaApi.status} rlsStatus=${viaRls.status}`,
        qaDataNeeded: "Confirm lms_tickets.sql applied",
      });
      test.skip(true, "tickets table error");
      return;
    }

    const ok = apiSensitive.length === 0 && viaRls.rows.length === 0;
    recordFinding({
      id: "MEN-SENSITIVE-TICKETS",
      role: "mentor",
      layer: "RLS",
      routeOrResource: "GET /api/lms/tickets + RLS is_sensitive=true",
      expected: "Mentor sees 0 sensitive tickets",
      actual: `apiSensitive=${apiSensitive.length}; rlsSensitiveRows=${viaRls.rows.length}; apiTotal=${apiTickets.length}`,
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "CRITICAL",
      evidence: `apiHttp=${viaApi.status}`,
      likelyCause: ok ? undefined : "Mentor SELECT policy missing is_sensitive=false guard",
      proposedFix: ok ? undefined : "Enforce lms_student_tickets_mentor_select sensitive filter + API filter",
      qaDataNeeded:
        ok && apiTickets.length === 0 && viaRls.rows.length === 0
          ? "Optional: create a sensitive ticket owned by a student (manual) to strengthen positive deny proof"
          : undefined,
    });
    expect(ok).toBeTruthy();
  });

  test("API: mentor LMS lists respect role gate", async ({ request }) => {
    const assignments = await apiGet(request, "/api/lms/assignments");
    const tests = await apiGet(request, "/api/lms/tests");
    const materials = await apiGet(request, "/api/lms/materials");
    const ok = assignments.ok && tests.ok && materials.ok;
    recordFinding({
      id: "MEN-API-LMS-LISTS",
      role: "mentor",
      layer: "API",
      routeOrResource: "GET /api/lms/{assignments,tests,materials}",
      expected: "Mentor can read LMS lists (scoped by RLS)",
      actual: `a=${assignments.status} t=${tests.status} m=${materials.status}`,
      status: ok ? "Pass" : "Fail",
      severity: ok ? null : "HIGH",
      evidence: `ok=${ok}`,
      qaDataNeeded: ok ? undefined : "Mentor allocations / LMS schema may be missing",
    });
    expect(ok).toBeTruthy();
  });
});
