/**
 * Safe localhost load probe for AJ OS (no new users, limited auth logins).
 *
 * Waves:
 *  A) Concurrent GET /login (HTML) — app/server capacity
 *  B) Concurrent authenticated GETs with saved student/mentor cookies — portal load
 *  C) Small concurrent password logins with ONE QA student (rate-limit aware)
 *
 * Usage: node scripts/load-probe-localhost.mjs
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
  console.error("Refusing production host for load probe.");
  process.exit(1);
}

function cookieHeaderFromStorage(file) {
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  return (state.cookies || []).map((c) => `${c.name}=${c.value}`).join("; ");
}

async function timedFetch(url, init = {}) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      ...init,
      redirect: "manual",
      headers: {
        ...(init.headers || {}),
        "user-agent": "AJ-OS-load-probe/1.0",
      },
    });
    const ms = performance.now() - t0;
    return { ok: res.status >= 200 && res.status < 400, status: res.status, ms };
  } catch (e) {
    return { ok: false, status: 0, ms: performance.now() - t0, error: String(e.message || e) };
  }
}

function summarize(label, results) {
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;
  const pct = (p) => ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))] || 0;
  const statuses = {};
  for (const r of results) statuses[r.status] = (statuses[r.status] || 0) + 1;
  const errors = results
    .filter((r) => r.error)
    .slice(0, 5)
    .map((r) => r.error);
  return {
    label,
    total: results.length,
    ok,
    fail,
    p50_ms: Math.round(pct(50)),
    p95_ms: Math.round(pct(95)),
    max_ms: Math.round(ms[ms.length - 1] || 0),
    statuses,
    ...(errors.length ? { errors } : {}),
  };
}

async function wave(label, n, fn) {
  const started = performance.now();
  const results = await Promise.all(Array.from({ length: n }, (_, i) => fn(i)));
  const summary = summarize(label, results);
  summary.wall_ms = Math.round(performance.now() - started);
  return summary;
}

async function loginOnce(browser, email, password, roleLabel) {
  const page = await browser.newPage();
  const t0 = performance.now();
  try {
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await page.getByLabel("Role", { exact: true }).selectOption({ label: roleLabel });
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForURL(/\/(student|mentor|admin)\//, { timeout: 45_000 });
    return { ok: true, status: 200, ms: performance.now() - t0 };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      ms: performance.now() - t0,
      error: String(e.message || e).slice(0, 160),
    };
  } finally {
    await page.close().catch(() => undefined);
  }
}

const studentState = path.resolve("e2e/.auth/student.json");
const mentorState = path.resolve("e2e/.auth/mentor.json");
if (!fs.existsSync(studentState) || !fs.existsSync(mentorState)) {
  console.error("Missing e2e/.auth/*.json — run auth.setup first.");
  process.exit(1);
}

const studentCookie = cookieHeaderFromStorage(studentState);
const mentorCookie = cookieHeaderFromStorage(mentorState);

const only = process.env.LOAD_ONLY; // e.g. E or Eseq
const report = {
  base: BASE,
  startedAt: new Date().toISOString(),
  note: "Safe probe: reuse QA sessions; only a few real logins. Not a full 150-unique-user simulation.",
  waves: [],
};

if (!only || only === "A") {
  report.waves.push(
    await wave("A_login_page_GET_x50", 50, () => timedFetch(`${BASE}/login`)),
  );
}

if (!only || only === "B") {
  report.waves.push(
    await wave("B_student_dashboard_GET_x40", 40, () =>
      timedFetch(`${BASE}/student/dashboard`, { headers: { cookie: studentCookie } }),
    ),
  );
}

if (!only || only === "C") {
  report.waves.push(
    await wave("C_mentor_dashboard_GET_x30", 30, () =>
      timedFetch(`${BASE}/mentor/dashboard`, { headers: { cookie: mentorCookie } }),
    ),
  );
}

if (!only || only === "D") {
  const studentPaths = [
    "/student/dashboard",
    "/student/learning/assignments",
    "/student/learning/tests",
    "/student/learning/materials",
    "/student/profile",
  ];
  report.waves.push(
    await wave("D_student_mixed_pages_x50", 50, (i) =>
      timedFetch(`${BASE}${studentPaths[i % studentPaths.length]}`, {
        headers: { cookie: studentCookie },
      }),
    ),
  );
}

const email = process.env.E2E_STUDENT_EMAIL;
const password = process.env.E2E_STUDENT_PASSWORD;

if (!only || only === "E" || only === "Eseq") {
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  try {
    if (only === "Eseq") {
      const seq = [];
      for (let i = 0; i < 3; i++) {
        seq.push(await loginOnce(browser, email, password, "Student"));
      }
      const summary = summarize("E_student_login_seq_x3", seq);
      summary.wall_ms = Math.round(seq.reduce((s, r) => s + r.ms, 0));
      report.waves.push(summary);
    } else {
      report.waves.push(
        await wave("E_student_login_x5", 5, () =>
          loginOnce(browser, email, password, "Student"),
        ),
      );
    }
  } finally {
    await browser.close();
  }
}

const failWaves = report.waves.filter((w) => w.fail > 0);
report.overall = {
  waves: report.waves.length,
  waves_with_failures: failWaves.length,
  total_requests: report.waves.reduce((s, w) => s + w.total, 0),
  total_failures: report.waves.reduce((s, w) => s + w.fail, 0),
};

fs.mkdirSync("test-results", { recursive: true });
fs.writeFileSync("test-results/load-probe-localhost.json", JSON.stringify(report, null, 2));

// #region agent log
try {
  const logPath = path.resolve("..", "debug-4cd1ad.log");
  const line = JSON.stringify({
    sessionId: "4cd1ad",
    runId: only || "full",
    hypothesisId: "load",
    location: "scripts/load-probe-localhost.mjs",
    message: "load probe finished",
    data: report.overall,
    waves: report.waves.map((w) => ({
      label: w.label,
      ok: w.ok,
      fail: w.fail,
      p50_ms: w.p50_ms,
      p95_ms: w.p95_ms,
      errors: w.errors || [],
    })),
    timestamp: Date.now(),
  });
  fs.appendFileSync(logPath, line + "\n");
} catch {
  /* ignore */
}
// #endregion

console.log(JSON.stringify(report, null, 2));
process.exit(report.overall.total_failures > 0 ? 1 : 0);
