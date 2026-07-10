import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/security";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

function projectRefFromJwt(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      ref?: string;
    };
    return json.ref ?? null;
  } catch {
    return null;
  }
}

/** Safe diagnostics — never returns secret key values. Admin-only. */
export async function GET() {
  const { response } = await requireAdminApiSession();
  if (response) return response;

  const { url, anonKey, isConfigured } = getSupabasePublicEnv();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  const anonRef = anonKey ? projectRefFromJwt(anonKey) : null;
  const serviceRef = serviceKey ? projectRefFromJwt(serviceKey) : null;
  const urlRef = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? null;

  const refsMatch =
    Boolean(anonRef && serviceRef && urlRef) &&
    anonRef === serviceRef &&
    anonRef === urlRef;

  return NextResponse.json({
    configured: isConfigured && Boolean(serviceKey),
    projectRef: urlRef,
    urlHost: url ? new URL(url).host : null,
    anonKeyPresent: Boolean(anonKey),
    serviceKeyPresent: Boolean(serviceKey),
    keysMatchProject: refsMatch,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? null,
    hint: refsMatch
      ? "Env looks correct. Restart npm run dev after edits. Login also needs a profiles row + profiles_rls_fix.sql."
      : "URL and keys are from different Supabase projects — copy all three from the same project Settings → API.",
  });
}
