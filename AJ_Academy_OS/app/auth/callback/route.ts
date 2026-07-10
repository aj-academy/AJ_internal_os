import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeRelativePath } from "@/lib/security/safeRedirect";
import { logSecurityEvent } from "@/lib/security/auditLog";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const nextPath = safeRelativePath(requestUrl.searchParams.get("next"), "/");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=reset_link_invalid", requestUrl.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logSecurityEvent("auth_callback_failed", { reason: error.message });
    return NextResponse.redirect(new URL("/login?error=reset_link_invalid", requestUrl.origin));
  }

  logSecurityEvent("auth_callback_ok", { next: nextPath });
  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
