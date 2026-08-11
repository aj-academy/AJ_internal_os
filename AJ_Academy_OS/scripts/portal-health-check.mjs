/**
 * Student + Mentor portal health check (pages + key GET APIs).
 * Read-only: no creates, uploads, evaluates, or auth spam.
 *
 * Usage: node scripts/portal-health-check.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { chromium } from "@playwright/test";

function loadEnv(file) {
  const p = path.resolve(file);
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[k]) process.env[k] = v;
  }
}

loadEnv(".env.e2e");
loadEnv(".env.local");

const BASE = (process.env.E2E_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
if (/aj-academy\.vercel\.app/i.test(BASE)) {
  console.error("Refusing production host.");
  process.exit(1);
}

function cookieHeaderFromStorage(file) {
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  return (state.cookies || []).map((c) => `${c.name}=${c.value}`).join("; ");
}

async function probeGet(url, cookie, expectJson = false) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        cookie,
        "user-agent": "AJ-OS-portal-health/1.0",
        accept: expectJson ? "application/json" : "text/html,*/*",
      },
    });
    const ms = Math.round(performance.now() - t0);
    const loc = res.headers.get("location") || null;
    let bodyPreview = "";
    let jsonOk = null;
    let jsonError = null;
    if (expectJson) {
      const text = await res.text();
      bodyPreview = text.slice(0, 200);
      try {
        const j = JSON.parse(text);
        jsonOk = j?.ok !== false && !j?.error;
        jsonError = j?.error || j?.message || null;
        if (Array.isArray(j)) jsonOk = true;
        if (j && typeof j === "object" && ("items" in j || "data" in j || "assignments" in j || "materials" in j || "tests" in j || "projects" in j || "students" in j || "tickets" in j || "reports" in j)) {
          jsonOk = true;
        }
      } catch {
        jsonOk = false;
        jsonError = "non-json";
      }
    } else {
      bodyPreview = (await res.text()).slice(0, 120);
    }
    const redirectedLogin = Boolean(loc && /\/login/i.test(loc));
    const ok =
      res.status >= 200 &&
      res.status < 400 &&
      !redirectedLogin &&
      (expectJson ? jsonOk !== false : true);
    return {
      url: url.replace(BASE, ""),
      status: res.status,
      ms,
      ok,
      redirectedLogin,
      location: loc,
      jsonOk,
      jsonError: jsonError ? String(jsonError).slice(0, 120) : null,
      bodyPreview: bodyPreview.replace(/\s+/g, " ").slice(0, 80),
    };
  } catch (e) {
    return {
      url: url.replace(BASE, ""),
      status: 0,
      ms: Math.round(performance.now() - t0),
      ok: false,
      error: String(e.message || e).slice(0, 160),
    };
  }
}

const STUDENT_PAGES = [
  "/student/dashboard",
  "/student/my-tasks",
  "/student/attendance",
  "/student/leave",
  "/student/permission",
  "/student/counselling",
  "/student/policies",
  "/student/profile",
  "/student/portfolio",
  "/student/learning/overview",
  "/student/learning/assignments",
  "/student/learning/tests",
  "/student/learning/materials",
  "/student/learning/projects",
  "/student/learning/queries",
];

const MENTOR_PAGES = [
  "/mentor/dashboard",
  "/mentor/students",
  "/mentor/my-tasks",
  "/mentor/assign-tasks",
  "/mentor/attendance",
  "/mentor/counselling",
  "/mentor/reimbursement",
  "/mentor/profile",
  "/mentor/learning/overview",
  "/mentor/learning/assignments",
  "/mentor/learning/tests",
  "/mentor/learning/materials",
  "/mentor/learning/projects",
  "/mentor/learning/queries",
  "/mentor/learning/submissions",
];

const STUDENT_APIS = [
  "/api/lms/assignments",
  "/api/lms/tests",
  "/api/lms/materials",
  "/api/lms/projects",
  "/api/lms/tickets",
];

const MENTOR_APIS = [
  "/api/lms/assignments",
  "/api/lms/tests",
  "/api/lms/materials",
  "/api/lms/projects",
  "/api/lms/tickets",
  "/api/lms/reports",
  "/api/mentor/my-students",
];

/** Staff-only (admin/employee). Mentor + student both get 403 by design today. */
const STAFF_ONLY_REMINDER_APIS = [
  "/api/reminders/notifications?process=0",
  "/api/reminders/settings",
];

/** APIs that may 403 for students by design (staff-only). */
const STUDENT_EXPECTED_403 = STAFF_ONLY_REMINDER_APIS;
const MENTOR_EXPECTED_403 = STAFF_ONLY_REMINDER_APIS;

const studentState = path.resolve("e2e/.auth/student.json");
const mentorState = path.resolve("e2e/.auth/mentor.json");
if (!fs.existsSync(studentState) || !fs.existsSync(mentorState)) {
  console.error("Missing auth storage — run auth.setup first.");
  process.exit(1);
}

const studentCookie = cookieHeaderFromStorage(studentState);
const mentorCookie = cookieHeaderFromStorage(mentorState);

const report = {
  base: BASE,
  startedAt: new Date().toISOString(),
  note: "Read-only page+API health for student/mentor. No mutations.",
  student: { pages: [], apis: [], ui: [] },
  mentor: { pages: [], apis: [], ui: [] },
};

for (const p of STUDENT_PAGES) {
  report.student.pages.push(await probeGet(`${BASE}${p}`, studentCookie, false));
}
for (const p of STUDENT_APIS) {
  report.student.apis.push(await probeGet(`${BASE}${p}`, studentCookie, true));
}
for (const p of STUDENT_EXPECTED_403) {
  const r = await probeGet(`${BASE}${p}`, studentCookie, true);
  // Invert: 403 is success for staff-only endpoints
  report.student.apis.push({
    ...r,
    ok: r.status === 403,
    note: "expected_403_staff_only",
  });
}
for (const p of MENTOR_PAGES) {
  report.mentor.pages.push(await probeGet(`${BASE}${p}`, mentorCookie, false));
}
for (const p of MENTOR_APIS) {
  report.mentor.apis.push(await probeGet(`${BASE}${p}`, mentorCookie, true));
}
for (const p of MENTOR_EXPECTED_403) {
  const r = await probeGet(`${BASE}${p}`, mentorCookie, true);
  report.mentor.apis.push({
    ...r,
    ok: r.status === 403,
    note: "expected_403_staff_only",
  });
}

function isBenignApiFail(role, url, status) {
  // Staff-only reminder APIs: students and mentors are expected to get 403.
  if (status === 403 && /\/api\/reminders\//i.test(url)) return true;
  void role;
  return false;
}

/** Browser checks: fresh page per route to avoid crash cascade. */
async function uiCheck(role, storageFile, routes) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  const out = [];
  for (const route of routes) {
    const context = await browser.newContext({ storageState: storageFile, baseURL: BASE });
    const page = await context.newPage();
    const t0 = performance.now();
    const apiFails = [];
    const onResp = (res) => {
      const u = res.url();
      if (!u.includes("/api/")) return;
      if (res.status() >= 400 && !isBenignApiFail(role, u, res.status())) {
        apiFails.push({ url: u.replace(BASE, "").slice(0, 120), status: res.status() });
      }
    };
    page.on("response", onResp);
    try {
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 60_000 });
      await page.waitForLoadState("networkidle", { timeout: 25_000 }).catch(() => undefined);
      // Client pages may hydrate after shell; wait for visible text.
      await page
        .locator("h1, h2, main, [data-testid], table, form, .dashboard-section")
        .first()
        .waitFor({ state: "visible", timeout: 20_000 })
        .catch(() => undefined);
      await page.waitForTimeout(800);
      const url = page.url();
      const title = await page.title().catch(() => "");
      const bodyText = ((await page.locator("body").innerText().catch(() => "")) || "").slice(0, 500);
      const bouncedLogin = /\/login/i.test(url);
      const hasError =
        /application error|internal server error|something went wrong|uncaught|chunkloaderror/i.test(
          bodyText,
        );
      const hasMain =
        bodyText.length > 40 &&
        /welcome|dashboard|assignment|test|material|student|mentor|task|attendance|learning|overview|submission|roster|project|quer|leave|policy|profile|portfolio/i.test(
          bodyText,
        );
      out.push({
        route,
        ok: !bouncedLogin && !hasError && hasMain && apiFails.length === 0,
        ms: Math.round(performance.now() - t0),
        finalUrl: url.replace(BASE, ""),
        bouncedLogin,
        hasError,
        hasMain,
        title: title.slice(0, 80),
        apiFails: apiFails.slice(0, 8),
        bodySnippet: bodyText.replace(/\s+/g, " ").slice(0, 140),
      });
    } catch (e) {
      out.push({
        route,
        ok: false,
        ms: Math.round(performance.now() - t0),
        error: String(e.message || e).slice(0, 160),
      });
    } finally {
      await context.close().catch(() => undefined);
    }
  }
  await browser.close();
  return out;
}

report.student.ui = await uiCheck("student", studentState, [
  "/student/dashboard",
  "/student/learning/assignments",
  "/student/learning/tests",
  "/student/learning/materials",
  "/student/learning/projects",
  "/student/learning/queries",
  "/student/my-tasks",
  "/student/attendance",
]);

report.mentor.ui = await uiCheck("mentor", mentorState, [
  "/mentor/dashboard",
  "/mentor/students",
  "/mentor/learning/assignments",
  "/mentor/learning/tests",
  "/mentor/learning/materials",
  "/mentor/learning/submissions",
  "/mentor/learning/overview",
  "/mentor/assign-tasks",
  "/mentor/my-tasks",
]);

function tally(items) {
  return {
    total: items.length,
    ok: items.filter((i) => i.ok).length,
    fail: items.filter((i) => !i.ok).length,
    failures: items.filter((i) => !i.ok),
  };
}

report.summary = {
  student_pages: tally(report.student.pages),
  student_apis: tally(report.student.apis),
  student_ui: tally(report.student.ui),
  mentor_pages: tally(report.mentor.pages),
  mentor_apis: tally(report.mentor.apis),
  mentor_ui: tally(report.mentor.ui),
};

report.summary.all_ok =
  report.summary.student_pages.fail === 0 &&
  report.summary.student_apis.fail === 0 &&
  report.summary.student_ui.fail === 0 &&
  report.summary.mentor_pages.fail === 0 &&
  report.summary.mentor_apis.fail === 0 &&
  report.summary.mentor_ui.fail === 0;

fs.mkdirSync("test-results", { recursive: true });
fs.writeFileSync("test-results/portal-health-check.json", JSON.stringify(report, null, 2));

// #region agent log
try {
  fs.appendFileSync(
    path.resolve("..", "debug-4cd1ad.log"),
    JSON.stringify({
      sessionId: "4cd1ad",
      runId: "portal-health",
      hypothesisId: "H1-H5",
      location: "scripts/portal-health-check.mjs",
      message: "portal health finished",
      data: report.summary,
      timestamp: Date.now(),
    }) + "\n",
  );
} catch {
  /* ignore */
}
// #endregion

console.log(JSON.stringify({ summary: report.summary, base: BASE }, null, 2));
if (!report.summary.all_ok) {
  console.log("\nFAILURES:");
  for (const key of Object.keys(report.summary)) {
    if (key === "all_ok") continue;
    const block = report.summary[key];
    if (block.fail > 0) {
      console.log(`\n${key}:`);
      console.log(JSON.stringify(block.failures, null, 2));
    }
  }
}
process.exit(report.summary.all_ok ? 0 : 1);
