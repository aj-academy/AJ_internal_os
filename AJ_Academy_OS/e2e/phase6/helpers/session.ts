import fs from "node:fs";
import path from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";

const authDir = path.join(__dirname, "..", "..", ".auth");

export function authStatePath(role: "admin" | "mentor" | "student") {
  return path.join(authDir, `${role}.json`);
}

/** Extract Supabase access token from Playwright storageState. Never log the token. */
export function readAccessTokenFromStorageState(role: "admin" | "mentor" | "student"): string | null {
  const file = authStatePath(role);
  if (!fs.existsSync(file)) return null;
  const state = JSON.parse(fs.readFileSync(file, "utf8")) as {
    cookies?: { name: string; value: string }[];
    origins?: { origin: string; localStorage?: { name: string; value: string }[] }[];
  };

  const tryParseSession = (raw: string): string | null => {
    let text = raw.trim();
    if (!text) return null;

    // @supabase/ssr often stores cookies as base64-<payload>
    if (text.startsWith("base64-")) {
      try {
        const b64 = text.slice("base64-".length).replace(/-/g, "+").replace(/_/g, "/");
        text = Buffer.from(b64, "base64").toString("utf8");
      } catch {
        return null;
      }
    }

    const candidates = [text];
    try {
      candidates.push(decodeURIComponent(text));
    } catch {
      /* ignore */
    }

    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as {
          access_token?: string;
          currentSession?: { access_token?: string };
          session?: { access_token?: string };
        };
        if (parsed.access_token) return parsed.access_token;
        if (parsed.currentSession?.access_token) return parsed.currentSession.access_token;
        if (parsed.session?.access_token) return parsed.session.access_token;
      } catch {
        /* continue */
      }
    }
    return null;
  };

  for (const origin of state.origins ?? []) {
    for (const item of origin.localStorage ?? []) {
      if (!/auth-token|supabase/i.test(item.name)) continue;
      const token = tryParseSession(item.value);
      if (token) return token;
    }
  }

  // Combine chunked auth cookies if present (name, name.0, name.1, ...)
  const cookies = state.cookies ?? [];
  const byBase = new Map<string, { idx: number; value: string }[]>();
  for (const cookie of cookies) {
    if (!/auth-token|sb-/i.test(cookie.name)) continue;
    const m = cookie.name.match(/^(.*?)(?:\.(\d+))?$/);
    if (!m) continue;
    const base = m[1];
    const idx = m[2] ? Number(m[2]) : -1;
    const list = byBase.get(base) ?? [];
    list.push({ idx, value: cookie.value });
    byBase.set(base, list);
  }

  for (const [, parts] of byBase) {
    parts.sort((a, b) => a.idx - b.idx);
    const combined = parts.map((p) => p.value).join("");
    const token = tryParseSession(combined);
    if (token) return token;
    for (const part of parts) {
      const t = tryParseSession(part.value);
      if (t) return t;
    }
  }

  return null;
}

export function supabasePublicEnv() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!url || !anon) return null;
  return { url, anon };
}

export async function apiGet(request: APIRequestContext, pathName: string) {
  const res = await request.get(pathName, { failOnStatusCode: false });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status(), json, ok: res.ok() };
}

export async function apiPost(request: APIRequestContext, pathName: string, body: unknown) {
  const res = await request.post(pathName, {
    data: body,
    failOnStatusCode: false,
    headers: { "content-type": "application/json" },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status(), json, ok: res.ok() };
}

/** Decode JWT payload claims without verifying (harness only). Never logs full token. */
export function jwtSub(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const payload = JSON.parse(json) as { sub?: string };
    return payload.sub || null;
  } catch {
    return null;
  }
}

export async function rlsSelect(opts: {
  token: string;
  table: string;
  query: string;
}): Promise<{ status: number; rows: unknown[]; error: string | null }> {
  const env = supabasePublicEnv();
  if (!env) return { status: 0, rows: [], error: "Missing NEXT_PUBLIC_SUPABASE_URL/ANON_KEY" };

  const url = `${env.url}/rest/v1/${opts.table}?${opts.query}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: env.anon,
      Authorization: `Bearer ${opts.token}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    return { status: res.status, rows: [], error: text.slice(0, 300) };
  }
  try {
    const rows = JSON.parse(text) as unknown[];
    return { status: res.status, rows: Array.isArray(rows) ? rows : [], error: null };
  } catch {
    return { status: res.status, rows: [], error: "Invalid JSON from PostgREST" };
  }
}

export async function finalUrlAfterGoto(page: Page, pathName: string) {
  try {
    await page.goto(pathName, { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch (err) {
    const msg = String(err);
    if (
      !msg.includes("ERR_ABORTED") &&
      !msg.includes("NS_BINDING_ABORTED") &&
      !msg.includes("Page crashed") &&
      !msg.includes("Target closed")
    ) {
      throw err;
    }
  }

  try {
    await page.waitForLoadState("domcontentloaded", { timeout: 10_000 });
  } catch {
    /* ignore */
  }

  try {
    return page.url();
  } catch {
    return "";
  }
}
