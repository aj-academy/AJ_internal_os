import { NextResponse } from "next/server";
import { enforceRateLimit, requireStaffApiSession } from "@/lib/security";
import { sendPushNotification } from "@/lib/push/sendPushNotification";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "push:test", { limit: 10, windowMs: 60_000 });
  if (limited) return limited;

  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  const result = await sendPushNotification({
    userId: user.id,
    title: "AJ OS Notifications Enabled",
    message: "You will now receive AJ OS alerts on this device.",
    type: "push_test",
    targetUrl: "/employee/notifications",
    priority: "normal",
  });

  return NextResponse.json({
    ok: result.succeeded > 0 || Boolean(result.notificationId),
    notificationId: result.notificationId,
    attempted: result.attempted,
    succeeded: result.succeeded,
    failed: result.failed,
    skipped: result.skipped,
    errors: result.errors.slice(0, 5),
  });
}
