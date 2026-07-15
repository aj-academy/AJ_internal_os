import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";
import {
  buildAlertFireTimes,
  emptyReminderForm,
  isMissingRemindersTable,
  mapReminderRow,
  validateReminderForm,
} from "@/lib/reminders/reminderHelpers";
import type { ReminderFormValue } from "@/types/reminders";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("aj_reminders").select("*").eq("id", id).maybeSingle();
  if (error) {
    if (isMissingRemindersTable(error.message)) {
      return NextResponse.json({ error: "Reminders schema missing." }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const mapped = mapReminderRow(data as Record<string, unknown>);
  const { data: assignees } = await supabase
    .from("aj_reminder_assignees")
    .select("user_id,role")
    .eq("reminder_id", id);
  mapped.assignees = (assignees ?? []).map((a) => ({
    user_id: a.user_id as string,
    role: a.role as "assignee" | "participant",
  }));
  return NextResponse.json({ reminder: mapped });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const record = body as Partial<ReminderFormValue> & {
    status?: string;
    action?: string;
    snooze_minutes?: number;
    reschedule_date?: string;
    reschedule_time?: string;
    reschedule_reason?: string;
    scope?: "this" | "future" | "series";
  };

  const supabase = await createClient();
  const { data: existing, error: loadErr } = await supabase
    .from("aj_reminders")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 400 });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Quick actions
  if (record.action === "complete") {
    const { error } = await supabase
      .from("aj_reminders")
      .update({
        status: "Completed",
        completed_at: new Date().toISOString(),
        snooze_until: null,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await supabase
      .from("aj_reminder_alerts")
      .update({ status: "cancelled" })
      .eq("reminder_id", id)
      .eq("status", "pending");
    await supabase
      .from("aj_reminder_notifications")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("reminder_id", id)
      .is("dismissed_at", null);
    await supabase.from("aj_reminder_activity_logs").insert({
      reminder_id: id,
      actor_id: user.id,
      action: "completed",
      details: {},
    });
    return NextResponse.json({ ok: true });
  }

  if (record.action === "snooze") {
    const mins = Math.min(120, Math.max(1, Number(record.snooze_minutes ?? 10)));
    const until = new Date(Date.now() + mins * 60_000).toISOString();
    const { error } = await supabase.from("aj_reminders").update({ snooze_until: until }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    // Hide current due popup(s) until the snooze alert fires again
    await supabase
      .from("aj_reminder_notifications")
      .update({ dismissed_at: new Date().toISOString() })
      .eq("reminder_id", id)
      .is("dismissed_at", null);
    const idem = `${id}:snooze:${until}`;
    await supabase.from("aj_reminder_alerts").upsert(
      {
        reminder_id: id,
        fire_at: until,
        offset_minutes: 0,
        channel: "both",
        idempotency_key: idem,
        status: "pending",
      },
      { onConflict: "idempotency_key" },
    );
    await supabase.from("aj_reminder_activity_logs").insert({
      reminder_id: id,
      actor_id: user.id,
      action: "snoozed",
      details: { minutes: mins, until },
    });
    return NextResponse.json({ ok: true, snooze_until: until });
  }

  if (record.action === "reschedule") {
    const date = String(record.reschedule_date ?? "").slice(0, 10);
    const time = String(record.reschedule_time ?? "").slice(0, 5);
    if (!date) return NextResponse.json({ error: "New date is required." }, { status: 400 });
    const oldDate = existing.reminder_date;
    const oldTime = existing.start_time;
    const { error } = await supabase
      .from("aj_reminders")
      .update({
        reminder_date: date,
        start_time: existing.is_all_day ? null : time || existing.start_time,
        status: "Rescheduled",
        snooze_until: null,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await supabase
      .from("aj_reminder_alerts")
      .update({ status: "cancelled" })
      .eq("reminder_id", id)
      .eq("status", "pending");
    const offsets = Array.isArray(existing.notify_offsets_minutes)
      ? (existing.notify_offsets_minutes as number[])
      : [0];
    const fires = buildAlertFireTimes({
      reminderId: id,
      date,
      startTime: existing.is_all_day ? null : time || (existing.start_time as string),
      isAllDay: Boolean(existing.is_all_day),
      offsets,
      soundOrPush: true,
    });
    if (fires.length) {
      await supabase.from("aj_reminder_alerts").upsert(
        fires.map((a) => ({
          reminder_id: id,
          fire_at: a.fire_at,
          offset_minutes: a.offset_minutes,
          channel: a.channel,
          idempotency_key: a.idempotency_key,
          status: "pending",
        })),
        { onConflict: "idempotency_key" },
      );
    }
    await supabase.from("aj_reminder_activity_logs").insert({
      reminder_id: id,
      actor_id: user.id,
      action: "rescheduled",
      details: {
        from: { date: oldDate, time: oldTime },
        to: { date, time },
        reason: record.reschedule_reason ?? null,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // Full form update
  const form: ReminderFormValue = {
    ...emptyReminderForm(),
    title: String(record.title ?? existing.title ?? ""),
    reminder_type: (record.reminder_type as ReminderFormValue["reminder_type"]) || existing.reminder_type,
    description: String(record.description ?? existing.description ?? ""),
    reminder_date: String(record.reminder_date ?? existing.reminder_date).slice(0, 10),
    start_time: String(record.start_time ?? existing.start_time ?? "").slice(0, 5),
    end_time: String(record.end_time ?? existing.end_time ?? "").slice(0, 5),
    is_all_day: record.is_all_day ?? Boolean(existing.is_all_day),
    priority: (record.priority as ReminderFormValue["priority"]) || existing.priority,
    status: (record.status as ReminderFormValue["status"]) || existing.status,
    location: String(record.location ?? existing.location ?? ""),
    meeting_mode: (record.meeting_mode as ReminderFormValue["meeting_mode"]) || existing.meeting_mode || "",
    meeting_link: String(record.meeting_link ?? existing.meeting_link ?? ""),
    related_module: (record.related_module as ReminderFormValue["related_module"]) || existing.related_module || "",
    related_record_id: String(record.related_record_id ?? existing.related_record_id ?? ""),
    related_record_label: String(record.related_record_label ?? existing.related_record_label ?? ""),
    recurrence_rule: (record.recurrence_rule as ReminderFormValue["recurrence_rule"]) || existing.recurrence_rule,
    recurrence_interval: Number(record.recurrence_interval ?? existing.recurrence_interval ?? 1),
    recurrence_weekdays: Array.isArray(record.recurrence_weekdays)
      ? record.recurrence_weekdays
      : (existing.recurrence_weekdays as number[]) || [],
    recurrence_end_date: String(record.recurrence_end_date ?? existing.recurrence_end_date ?? ""),
    recurrence_end_count: String(record.recurrence_end_count ?? existing.recurrence_end_count ?? ""),
    is_private: record.is_private ?? Boolean(existing.is_private),
    sound_enabled: record.sound_enabled ?? existing.sound_enabled !== false,
    push_enabled: record.push_enabled ?? existing.push_enabled !== false,
    notify_offsets_minutes: Array.isArray(record.notify_offsets_minutes)
      ? record.notify_offsets_minutes.map(Number)
      : (existing.notify_offsets_minutes as number[]) || [0],
    assignee_ids: Array.isArray(record.assignee_ids) ? record.assignee_ids.map(String) : [],
    participant_ids: Array.isArray(record.participant_ids) ? record.participant_ids.map(String) : [],
  };

  const invalid = validateReminderForm(form);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { error: updErr } = await supabase
    .from("aj_reminders")
    .update({
      title: form.title.trim(),
      reminder_type: form.reminder_type,
      description: form.description.trim() || null,
      reminder_date: form.reminder_date,
      start_time: form.is_all_day ? null : form.start_time || null,
      end_time: form.is_all_day ? null : form.end_time || null,
      is_all_day: form.is_all_day,
      priority: form.priority,
      status: form.status,
      location: form.location.trim() || null,
      meeting_mode: form.meeting_mode || null,
      meeting_link: form.meeting_link.trim() || null,
      related_module: form.related_module || null,
      related_record_id: form.related_record_id || null,
      related_record_label: form.related_record_label.trim() || null,
      is_private: form.is_private,
      sound_enabled: form.sound_enabled,
      push_enabled: form.push_enabled,
      notify_offsets_minutes: form.notify_offsets_minutes,
      completed_at: form.status === "Completed" ? new Date().toISOString() : null,
      cancelled_at: form.status === "Cancelled" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });

  if (record.assignee_ids || record.participant_ids) {
    await supabase.from("aj_reminder_assignees").delete().eq("reminder_id", id);
    const rows = [
      ...form.assignee_ids.map((user_id) => ({ reminder_id: id, user_id, role: "assignee" as const })),
      ...form.participant_ids
        .filter((u) => !form.assignee_ids.includes(u))
        .map((user_id) => ({ reminder_id: id, user_id, role: "participant" as const })),
    ];
    if (rows.length) await supabase.from("aj_reminder_assignees").insert(rows);
  }

  await supabase
    .from("aj_reminder_alerts")
    .update({ status: "cancelled" })
    .eq("reminder_id", id)
    .eq("status", "pending");
  const fires = buildAlertFireTimes({
    reminderId: id,
    date: form.reminder_date,
    startTime: form.is_all_day ? null : form.start_time,
    isAllDay: form.is_all_day,
    offsets: form.notify_offsets_minutes,
    soundOrPush: form.sound_enabled || form.push_enabled,
  });
  if (fires.length) {
    await supabase.from("aj_reminder_alerts").upsert(
      fires.map((a) => ({
        reminder_id: id,
        fire_at: a.fire_at,
        offset_minutes: a.offset_minutes,
        channel: a.channel,
        idempotency_key: a.idempotency_key,
        status: "pending",
      })),
      { onConflict: "idempotency_key" },
    );
  }

  await supabase.from("aj_reminder_activity_logs").insert({
    reminder_id: id,
    actor_id: user.id,
    action: "updated",
    details: {},
  });

  const { data: refreshed } = await supabase.from("aj_reminders").select("*").eq("id", id).single();
  return NextResponse.json({
    reminder: refreshed ? mapReminderRow(refreshed as Record<string, unknown>) : null,
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;
  const { id } = await ctx.params;
  const supabase = await createClient();
  const { error } = await supabase.from("aj_reminders").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
