import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PROFILE_SESSION_COOKIE } from "@/lib/auth/profile-session-cookie";

/** Clears auth cookies when profile is missing or session is broken. */
export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const response = NextResponse.json({ ok: true });
  response.cookies.set(PROFILE_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
