import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingRemindersTable } from "@/lib/reminders/reminderHelpers";

/**
 * Process pending aj_reminder_alerts whose fire_at <= now into
 * aj_reminder_notifications. Uses a privileged (service-role) client.
 */
export async function processDueReminderAlerts(
  admin: SupabaseClient,
  limit = 50,
): Promise<{ processed: number; checked: number; schemaMissing?: boolean; error?: string }> {
  const nowIso = new Date().toISOString();
  const { data: due, error } = await admin
    .from("aj_reminder_alerts")
    .select("id,reminder_id,fire_at,channel,idempotency_key")
    .eq("status", "pending")
    .lte("fire_at", nowIso)
    .order("fire_at", { ascending: true })
    .limit(limit);

  if (error) {
    if (isMissingRemindersTable(error.message) || /aj_reminder_alerts/i.test(error.message)) {
      return { processed: 0, checked: 0, schemaMissing: true };
    }
    return { processed: 0, checked: 0, error: error.message };
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
    const body = [reminder.reminder_type, reminder.reminder_date, reminder.start_time].filter(Boolean).join(" · ");

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
    }

    await admin
      .from("aj_reminder_alerts")
      .update({ status: "processed", processed_at: nowIso })
      .eq("id", alertId)
      .eq("status", "pending");
    processed += 1;
  }

  return { processed, checked: (due ?? []).length };
}
