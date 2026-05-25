import type { NextResponse } from "next/server";
import { applySupabaseCookieOptions } from "@/lib/supabase/cookies";

/** Copy sb-* cookies from document.cookie string onto a route response. */
export function mirrorSupabaseCookiesFromHeader(
  response: NextResponse,
  cookieHeader: string,
) {
  if (!cookieHeader.trim()) return;

  const options = applySupabaseCookieOptions({ maxAge: 400 * 24 * 60 * 60 });

  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const name = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!name.startsWith("sb-")) continue;
    response.cookies.set(name, value, options);
  }
}
