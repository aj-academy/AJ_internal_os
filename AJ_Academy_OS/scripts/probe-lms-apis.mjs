import fs from "node:fs";
import path from "node:path";

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

function cookie(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"))
    .cookies.map((c) => `${c.name}=${c.value}`)
    .join("; ");
}

async function get(role, cookieHdr, url) {
  const r = await fetch(`${BASE}${url}`, {
    headers: { cookie: cookieHdr, accept: "application/json" },
  });
  const t = await r.text();
  let info = {};
  try {
    const j = JSON.parse(t);
    info = {
      keys: Object.keys(j).slice(0, 10),
      items: Array.isArray(j.items) ? j.items.length : undefined,
      students: Array.isArray(j.students) ? j.students.length : undefined,
      error: j.error || null,
    };
  } catch {
    info = { parse: "nonjson" };
  }
  console.log(JSON.stringify({ role, url, status: r.status, ...info, preview: t.slice(0, 90) }));
}

const sc = cookie("e2e/.auth/student.json");
const mc = cookie("e2e/.auth/mentor.json");

for (const u of [
  "/api/lms/assignments",
  "/api/lms/tests",
  "/api/lms/materials",
  "/api/lms/projects",
  "/api/lms/tickets",
]) {
  await get("student", sc, u);
}
for (const u of [
  "/api/lms/assignments",
  "/api/lms/tests",
  "/api/lms/materials",
  "/api/lms/projects",
  "/api/lms/tickets",
  "/api/lms/reports",
  "/api/mentor/my-students",
]) {
  await get("mentor", mc, u);
}
