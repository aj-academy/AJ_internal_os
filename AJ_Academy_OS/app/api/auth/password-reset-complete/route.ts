import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";
import { enforceRateLimit } from "@/lib/security";
import { logSecurityEvent } from "@/lib/security/auditLog";

export const runtime = "nodejs";

/**
 * POST /api/auth/password-reset-complete
 * Call after supabase.auth.updateUser({ password }) succeeds.
 * Records a durable audit row; never accepts or logs the password.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "auth:password-reset-complete", {
    limit: 20,
    windowMs: 15 * 60_000,
  });
  if (limited) return limited;

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    logSecurityEvent("password_reset_complete_rejected", { reason: "no_session" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  logSecurityEvent("password_reset_completed", { userId: user.id });

  try {
    const admin = createAdminClient();
    await writeAuditLog(admin, {
      actorId: user.id,
      action: "auth.password_reset_completed",
      module: "auth",
      targetTable: "auth.users",
      targetId: user.id,
      newData: {
        email: user.email ? `${user.email.slice(0, 2)}***` : null,
        at: new Date().toISOString(),
      },
    });
  } catch {
    /* non-blocking */
  }

  return NextResponse.json({ ok: true });
}
