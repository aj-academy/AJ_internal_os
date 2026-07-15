import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffApiSession } from "@/lib/security";
import { isMissingRemindersTable, mapReminderRow } from "@/lib/reminders/reminderHelpers";
import { processDueReminderAlerts } from "@/lib/reminders/processDueAlerts";

/**
 * Pending in-app reminder notifications for the signed-in user (popup feed).
 * By default also processes any due alerts so sound/popup work without waiting
 * for the daily Vercel cron (Hobby plan runs once/day only).
 */
export async function GET(request: Request) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  const url = new URL(request.url);
  const skipProcess = url.searchParams.get("process") === "0";

  if (!skipProcess) {
    try {
      const admin = createAdminClient();
      await processDueReminderAlerts(admin);
    } catch {
      /* service role missing in some local setups — cron still handles it */
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("aj_reminder_notifications")
    .select("*")
    .eq("user_id", user.id)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    if (isMissingRemindersTable(error.message) || /aj_reminder_notifications/i.test(error.message)) {
      return NextResponse.json({ notifications: [], schemaMissing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const reminderIds = [...new Set((data ?? []).map((n) => n.reminder_id as string))];
  const reminderMap: Record<string, ReturnType<typeof mapReminderRow>> = {};
  if (reminderIds.length) {
    const { data: rem } = await supabase.from("aj_reminders").select("*").in("id", reminderIds);
    for (const r of rem ?? []) {
      reminderMap[r.id as string] = mapReminderRow(r as Record<string, unknown>);
    }
  }

  return NextResponse.json({
    notifications: (data ?? []).map((n) => ({
      ...n,
      reminder: reminderMap[n.reminder_id as string] ?? null,
    })),
    schemaMissing: false,
  });
}

export async function PATCH(request: Request) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;
  let body: { id?: string; action?: string };
  try {
    body = (await request.json()) as { id?: string; action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = String(body.id ?? "");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const supabase = await createClient();
  const patch: Record<string, string> = {};
  if (body.action === "dismiss") patch.dismissed_at = new Date().toISOString();
  else if (body.action === "read") patch.read_at = new Date().toISOString();
  else if (body.action === "sound_played") patch.sound_played_at = new Date().toISOString();
  else return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const { error } = await supabase
    .from("aj_reminder_notifications")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
