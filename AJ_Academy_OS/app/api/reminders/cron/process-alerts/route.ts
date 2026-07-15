import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingRemindersTable } from "@/lib/reminders/reminderHelpers";

/**
 * Secure alert processor. Call via Vercel Cron or external scheduler:
 *   Authorization: Bearer $CRON_SECRET
 * Does not modify Student Master / College / Tasks / Finance tables.
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

  const nowIso = new Date().toISOString();
  const { data: due, error } = await admin
    .from("aj_reminder_alerts")
    .select("id,reminder_id,fire_at,channel,idempotency_key")
    .eq("status", "pending")
    .lte("fire_at", nowIso)
    .order("fire_at", { ascending: true })
    .limit(50);

  if (error) {
    if (isMissingRemindersTable(error.message) || /aj_reminder_alerts/i.test(error.message)) {
      return NextResponse.json({ processed: 0, schemaMissing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  let processed = 0;
  for (const alert of due ?? []) {
    const alertId = alert.id as string;
    const reminderId = alert.reminder_id as string;

    const { data: reminder } = await admin.from("aj_reminders").select("*").eq("id", reminderId).maybeSingle();
    if (!reminder) {
      await admin.from("aj_reminder_alerts").update({ status: "cancelled", processed_at: nowIso }).eq("id", alertId);
      continue;
    }
    const status = String(reminder.status ?? "");
    if (status === "Completed" || status === "Cancelled") {
      await admin.from("aj_reminder_alerts").update({ status: "cancelled", processed_at: nowIso }).eq("id", alertId);
      continue;
    }
    if (reminder.snooze_until && new Date(String(reminder.snooze_until)).getTime() > Date.now()) {
      continue;
    }

    const { data: assignees } = await admin
      .from("aj_reminder_assignees")
      .select("user_id")
      .eq("reminder_id", reminderId);
    const userIds = new Set<string>();
    if (reminder.created_by) userIds.add(String(reminder.created_by));
    for (const a of assignees ?? []) userIds.add(String(a.user_id));

    const title = String(reminder.title ?? "Reminder");
    const body = [reminder.reminder_type, reminder.reminder_date, reminder.start_time]
      .filter(Boolean)
      .join(" · ");

    for (const uid of userIds) {
      await admin.from("aj_reminder_notifications").upsert(
        {
          reminder_id: reminderId,
          alert_id: alertId,
          user_id: uid,
          title,
          body,
          link_path: `/employee/reminders?open=${reminderId}`,
        },
        { onConflict: "alert_id,user_id" },
      );

      // Background Web Push: subscriptions are stored in aj_reminder_push_subscriptions.
      // Wire `web-push` in a follow-up once VAPID env keys + the npm package are installed.
      // Do not require the package at build time (keeps existing installs compiling cleanly).
      void process.env.REMINDER_VAPID_PRIVATE_KEY;
      void process.env.REMINDER_VAPID_PUBLIC_KEY;
    }

    await admin
      .from("aj_reminder_alerts")
      .update({ status: "processed", processed_at: nowIso })
      .eq("id", alertId)
      .eq("status", "pending");
    processed += 1;
  }

  return NextResponse.json({ processed, checked: (due ?? []).length });
}

export async function GET(request: Request) {
  return POST(request);
}
