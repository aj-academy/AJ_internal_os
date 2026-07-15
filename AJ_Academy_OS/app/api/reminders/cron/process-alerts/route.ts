import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueReminderAlerts } from "@/lib/reminders/processDueAlerts";

/**
 * Secure alert processor. Call via Vercel Cron or external scheduler:
 *   Authorization: Bearer $CRON_SECRET
 * Also invoked indirectly when staff poll /api/reminders/notifications (process=1).
 */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const headerSecret = request.headers.get("x-cron-secret") || "";
  if (!secret || (token !== secret && headerSecret !== secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Service role unavailable" },
      { status: 500 },
    );
  }

  const result = await processDueReminderAlerts(admin);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

export async function GET(request: Request) {
  return POST(request);
}
