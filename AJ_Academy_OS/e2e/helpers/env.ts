/**
 * Shared e2e env guards. Call requireE2eEnv() at the start of each smoke file.
 */
const KNOWN_PRODUCTION_HOSTS = ["aj-academy.vercel.app"];

export function requireE2eEnv() {
  const base = (process.env.E2E_BASE_URL || "").trim().replace(/\/$/, "");
  if (!base) {
    throw new Error(
      "E2E_BASE_URL is required. Example: E2E_BASE_URL=http://localhost:3000 npm run test:e2e:smoke",
    );
  }
  let host = "";
  try {
    host = new URL(base).hostname.toLowerCase();
  } catch {
    throw new Error(`Invalid E2E_BASE_URL: ${base}`);
  }
  if (KNOWN_PRODUCTION_HOSTS.includes(host)) {
    throw new Error(`Refusing production host: ${host}`);
  }
  return { baseURL: base };
}

export function optionalCreds(prefix: "ADMIN" | "MENTOR" | "STUDENT") {
  const email = (process.env[`E2E_${prefix}_EMAIL`] || "").trim();
  const password = (process.env[`E2E_${prefix}_PASSWORD`] || "").trim();
  if (!email || !password) return null;
  return { email, password };
}
