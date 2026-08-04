import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { PASSWORD_RECOVERY_PATH } from "@/lib/auth/appUrl";
import { safeRelativePath } from "@/lib/security/safeRedirect";
import { logSecurityEvent } from "@/lib/security/auditLog";

const ALLOWED_NEXT = new Set([PASSWORD_RECOVERY_PATH, "/auth/reset-password", "/reset-password", "/login"]);

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = safeRelativePath(requestUrl.searchParams.get("next"), PASSWORD_RECOVERY_PATH);
  const nextPath = ALLOWED_NEXT.has(requestedNext.split("?")[0] || "")
    ? requestedNext.startsWith("/reset-password")
      ? PASSWORD_RECOVERY_PATH
      : requestedNext
    : PASSWORD_RECOVERY_PATH;

  if (!code) {
    logSecurityEvent("auth_callback_failed", { reason: "missing_code" });
    return NextResponse.redirect(
      new URL(`${PASSWORD_RECOVERY_PATH}?error=invalid`, requestUrl.origin),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    logSecurityEvent("auth_callback_failed", { reason: error.message.slice(0, 120) });
    return NextResponse.redirect(
      new URL(`${PASSWORD_RECOVERY_PATH}?error=expired`, requestUrl.origin),
    );
  }

  logSecurityEvent("auth_callback_ok", { next: nextPath });
  logSecurityEvent("password_recovery_session_opened", { next: nextPath });
  return NextResponse.redirect(new URL(nextPath, requestUrl.origin));
}
