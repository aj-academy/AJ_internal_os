import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStaffApiSession } from "@/lib/security";
import {
  buildAlertFireTimes,
  emptyReminderForm,
  expandRecurrenceDates,
  isMissingRemindersTable,
  mapReminderRow,
  validateReminderForm,
} from "@/lib/reminders/reminderHelpers";
import type { ReminderFormValue } from "@/types/reminders";

async function loadAssignees(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reminderIds: string[],
) {
  if (!reminderIds.length) return {} as Record<string, { user_id: string; role: "assignee" | "participant"; full_name: string | null; email: string | null }[]>;
  const { data } = await supabase
    .from("aj_reminder_assignees")
    .select("reminder_id,user_id,role")
    .in("reminder_id", reminderIds);
  const userIds = [...new Set((data ?? []).map((r) => r.user_id as string))];
  const nameMap: Record<string, { full_name: string | null; email: string | null }> = {};
  if (userIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id,full_name,email").in("id", userIds);
    for (const p of profiles ?? []) {
      nameMap[p.id as string] = {
        full_name: (p.full_name as string | null) ?? null,
        email: (p.email as string | null) ?? null,
      };
    }
  }
  const out: Record<string, { user_id: string; role: "assignee" | "participant"; full_name: string | null; email: string | null }[]> = {};
  for (const row of data ?? []) {
    const rid = row.reminder_id as string;
    if (!out[rid]) out[rid] = [];
    out[rid].push({
      user_id: row.user_id as string,
      role: row.role as "assignee" | "participant",
      full_name: nameMap[row.user_id as string]?.full_name ?? null,
      email: nameMap[row.user_id as string]?.email ?? null,
    });
  }
  return out;
}

async function replaceAssignees(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reminderId: string,
  assigneeIds: string[],
  participantIds: string[],
) {
  await supabase.from("aj_reminder_assignees").delete().eq("reminder_id", reminderId);
  const rows = [
    ...assigneeIds.map((user_id) => ({ reminder_id: reminderId, user_id, role: "assignee" as const })),
    ...participantIds
      .filter((id) => !assigneeIds.includes(id))
      .map((user_id) => ({ reminder_id: reminderId, user_id, role: "participant" as const })),
  ];
  if (rows.length) {
    const { error } = await supabase.from("aj_reminder_assignees").insert(rows);
    if (error) throw new Error(error.message);
  }
}

async function replaceAlerts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  reminderId: string,
  form: ReminderFormValue,
  dates: string[],
) {
  await supabase
    .from("aj_reminder_alerts")
    .update({ status: "cancelled" })
    .eq("reminder_id", reminderId)
    .eq("status", "pending");

  const alertRows = dates.flatMap((date) =>
    buildAlertFireTimes({
      reminderId,
      date,
      startTime: form.is_all_day ? null : form.start_time || null,
      isAllDay: form.is_all_day,
      offsets: form.notify_offsets_minutes,
      soundOrPush: form.sound_enabled || form.push_enabled,
    }).map((a) => ({
      reminder_id: reminderId,
      fire_at: a.fire_at,
      offset_minutes: a.offset_minutes,
      channel: a.channel,
      idempotency_key: a.idempotency_key,
      status: "pending",
    })),
  );
  if (alertRows.length) {
    const { error } = await supabase.from("aj_reminder_alerts").upsert(alertRows, {
      onConflict: "idempotency_key",
      ignoreDuplicates: false,
    });
    if (error && !/duplicate|unique/i.test(error.message)) {
      // Retry plain insert ignoring conflicts
      for (const row of alertRows) {
        await supabase.from("aj_reminder_alerts").upsert(row, { onConflict: "idempotency_key" });
      }
    }
  }
}

function formToInsert(form: ReminderFormValue, userId: string, groupId?: string | null) {
  return {
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
    recurrence_rule: form.recurrence_rule,
    recurrence_interval: form.recurrence_interval || 1,
    recurrence_weekdays: form.recurrence_weekdays.length ? form.recurrence_weekdays : null,
    recurrence_end_date: form.recurrence_end_date || null,
    recurrence_end_count: form.recurrence_end_count ? Number(form.recurrence_end_count) : null,
    recurrence_group_id: groupId ?? null,
    is_private: form.is_private,
    sound_enabled: form.sound_enabled,
    push_enabled: form.push_enabled,
    notify_offsets_minutes: form.notify_offsets_minutes.length ? form.notify_offsets_minutes : [0],
    created_by: userId,
  };
}

export async function GET() {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("aj_reminders")
    .select("*")
    .order("reminder_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(500);

  if (error) {
    if (isMissingRemindersTable(error.message)) {
      return NextResponse.json({
        reminders: [],
        schemaMissing: true,
        error: "Run AJ_Academy_SB/aj_reminders_schema.sql in Supabase SQL Editor.",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data ?? []).map((r) => mapReminderRow(r as Record<string, unknown>));
  const assignees = await loadAssignees(
    supabase,
    rows.map((r) => r.id),
  );
  return NextResponse.json({
    reminders: rows.map((r) => ({ ...r, assignees: assignees[r.id] ?? [] })),
    schemaMissing: false,
  });
}

export async function POST(request: Request) {
  const { response, user } = await requireStaffApiSession();
  if (response || !user) return response!;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const record = body as Partial<ReminderFormValue> & { assignee_ids?: string[]; participant_ids?: string[] };
  const form: ReminderFormValue = {
    ...emptyReminderForm(),
    ...record,
    title: String(record.title ?? ""),
    reminder_type: (record.reminder_type as ReminderFormValue["reminder_type"]) || "",
    assignee_ids: Array.isArray(record.assignee_ids) ? record.assignee_ids.map(String) : [],
    participant_ids: Array.isArray(record.participant_ids) ? record.participant_ids.map(String) : [],
    notify_offsets_minutes: Array.isArray(record.notify_offsets_minutes)
      ? record.notify_offsets_minutes.map(Number)
      : [15, 0],
  };

  const invalid = validateReminderForm(form);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  // Creator is always self (ignore client-supplied created_by)
  if (!form.assignee_ids.includes(user.id) && form.assignee_ids.length === 0) {
    form.assignee_ids = [user.id];
  }

  const supabase = await createClient();
  const dates = expandRecurrenceDates({
    startDate: form.reminder_date,
    rule: form.recurrence_rule,
    interval: form.recurrence_interval || 1,
    weekdays: form.recurrence_weekdays,
    endDate: form.recurrence_end_date || null,
    endCount: form.recurrence_end_count ? Number(form.recurrence_end_count) : null,
  });

  const groupId = dates.length > 1 ? crypto.randomUUID() : null;
  const createdIds: string[] = [];

  try {
    for (let i = 0; i < dates.length; i += 1) {
      const date = dates[i];
      const payload = {
        ...formToInsert({ ...form, reminder_date: date }, user.id, groupId),
        recurrence_parent_id: i === 0 ? null : createdIds[0] ?? null,
      };
      const { data, error } = await supabase.from("aj_reminders").insert(payload).select("*").single();
      if (error) {
        if (isMissingRemindersTable(error.message)) {
          return NextResponse.json(
            { error: "Run AJ_Academy_SB/aj_reminders_schema.sql in Supabase SQL Editor." },
            { status: 400 },
          );
        }
        throw new Error(error.message);
      }
      const id = data.id as string;
      createdIds.push(id);
      await replaceAssignees(supabase, id, form.assignee_ids, form.participant_ids);
      await replaceAlerts(supabase, id, { ...form, reminder_date: date }, [date]);
      await supabase.from("aj_reminder_activity_logs").insert({
        reminder_id: id,
        actor_id: user.id,
        action: "created",
        details: { date },
      });
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not create reminder." },
      { status: 400 },
    );
  }

  const { data: first } = await supabase.from("aj_reminders").select("*").eq("id", createdIds[0]).single();
  const mapped = first ? mapReminderRow(first as Record<string, unknown>) : null;
  if (mapped) {
    const assignees = await loadAssignees(supabase, [mapped.id]);
    mapped.assignees = assignees[mapped.id] ?? [];
  }
  return NextResponse.json({ reminder: mapped, created_count: createdIds.length });
}
