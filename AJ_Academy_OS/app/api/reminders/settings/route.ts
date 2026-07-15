import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";
import { isMissingRemindersTable } from "@/lib/reminders/reminderHelpers";

const DEFAULTS = {
  sound_enabled: true,
  sound_volume: 80,
  popup_enabled: true,
  browser_notification_enabled: false,
  push_enabled: false,
  default_notify_offsets_minutes: [15, 0],
  default_snooze_minutes: 10,
  quiet_hours_start: null as string | null,
  quiet_hours_end: null as string | null,
};

export async function GET() {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("aj_reminder_user_settings")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    if (isMissingRemindersTable(error.message) || /aj_reminder_user_settings/i.test(error.message)) {
      return NextResponse.json({ settings: { user_id: user.id, ...DEFAULTS }, schemaMissing: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({
    settings: data
      ? { ...DEFAULTS, ...data, user_id: user.id }
      : { user_id: user.id, ...DEFAULTS },
    schemaMissing: false,
  });
}

export async function PUT(request: Request) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const payload = {
    user_id: user.id,
    sound_enabled: body.sound_enabled !== false,
    sound_volume: Math.min(100, Math.max(0, Number(body.sound_volume ?? 80))),
    popup_enabled: body.popup_enabled !== false,
    browser_notification_enabled: Boolean(body.browser_notification_enabled),
    push_enabled: Boolean(body.push_enabled),
    default_notify_offsets_minutes: Array.isArray(body.default_notify_offsets_minutes)
      ? body.default_notify_offsets_minutes.map(Number)
      : [15, 0],
    default_snooze_minutes: Math.min(120, Math.max(1, Number(body.default_snooze_minutes ?? 10))),
    quiet_hours_start: body.quiet_hours_start ? String(body.quiet_hours_start).slice(0, 8) : null,
    quiet_hours_end: body.quiet_hours_end ? String(body.quiet_hours_end).slice(0, 8) : null,
  };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("aj_reminder_user_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) {
    return NextResponse.json(
      {
        error: /aj_reminder_user_settings|does not exist|schema cache/i.test(error.message)
          ? "Run AJ_Academy_SB/aj_reminders_schema.sql in Supabase SQL Editor."
          : error.message,
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ settings: data });
}
