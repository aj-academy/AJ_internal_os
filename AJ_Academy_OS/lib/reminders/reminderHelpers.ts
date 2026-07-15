import type {
  RecurrenceRule,
  ReminderFormValue,
  ReminderRow,
  ReminderStatus,
  ReminderType,
} from "@/types/reminders";
import { REMINDER_TYPES, REMINDER_PRIORITIES, REMINDER_STATUSES } from "@/types/reminders";

export const REMINDER_BASE_PATH = {
  admin: "/admin/reminders",
  employee: "/employee/reminders",
} as const;

/** IST calendar date YYYY-MM-DD */
export function todayDateIST(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Combine IST date + time into UTC ISO for storage/scheduling */
export function istDateTimeToUtcIso(dateYmd: string, timeHms: string | null | undefined): string | null {
  if (!dateYmd) return null;
  const time = (timeHms || "00:00:00").slice(0, 8);
  const padded = time.length === 5 ? `${time}:00` : time;
  // Asia/Kolkata is fixed UTC+05:30
  const local = `${dateYmd}T${padded}+05:30`;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function emptyReminderForm(defaults?: {
  notify?: number[];
  date?: string;
}): ReminderFormValue {
  return {
    title: "",
    reminder_type: "",
    description: "",
    reminder_date: defaults?.date || todayDateIST(),
    start_time: "09:00",
    end_time: "",
    is_all_day: false,
    priority: "Medium",
    status: "Scheduled",
    location: "",
    meeting_mode: "",
    meeting_link: "",
    related_module: "",
    related_record_id: "",
    related_record_label: "",
    recurrence_rule: "none",
    recurrence_interval: 1,
    recurrence_weekdays: [],
    recurrence_end_date: "",
    recurrence_end_count: "",
    is_private: false,
    sound_enabled: true,
    push_enabled: true,
    notify_offsets_minutes: defaults?.notify?.length ? defaults.notify : [15, 0],
    assignee_ids: [],
    participant_ids: [],
  };
}

export function reminderRowToForm(row: ReminderRow): ReminderFormValue {
  const assignees = (row.assignees ?? []).filter((a) => a.role === "assignee").map((a) => a.user_id);
  const participants = (row.assignees ?? []).filter((a) => a.role === "participant").map((a) => a.user_id);
  return {
    title: row.title,
    reminder_type: row.reminder_type,
    description: row.description ?? "",
    reminder_date: row.reminder_date,
    start_time: (row.start_time || "").slice(0, 5),
    end_time: (row.end_time || "").slice(0, 5),
    is_all_day: row.is_all_day,
    priority: row.priority,
    status: row.status,
    location: row.location ?? "",
    meeting_mode: row.meeting_mode ?? "",
    meeting_link: row.meeting_link ?? "",
    related_module: row.related_module ?? "",
    related_record_id: row.related_record_id ?? "",
    related_record_label: row.related_record_label ?? "",
    recurrence_rule: row.recurrence_rule,
    recurrence_interval: row.recurrence_interval || 1,
    recurrence_weekdays: row.recurrence_weekdays ?? [],
    recurrence_end_date: row.recurrence_end_date ?? "",
    recurrence_end_count: row.recurrence_end_count != null ? String(row.recurrence_end_count) : "",
    is_private: row.is_private,
    sound_enabled: row.sound_enabled,
    push_enabled: row.push_enabled,
    notify_offsets_minutes: row.notify_offsets_minutes?.length ? row.notify_offsets_minutes : [0],
    assignee_ids: assignees,
    participant_ids: participants,
  };
}

export function validateReminderForm(v: ReminderFormValue): string | null {
  if (!v.title.trim()) return "Title is required.";
  if (!v.reminder_type || !(REMINDER_TYPES as readonly string[]).includes(v.reminder_type)) {
    return "Reminder type is required.";
  }
  if (!v.reminder_date) return "Date is required.";
  if (!v.is_all_day && !v.start_time) return "Start time is required unless all-day.";
  if (v.end_time && v.start_time && v.end_time < v.start_time) {
    return "End time cannot be before start time.";
  }
  if (v.meeting_link.trim()) {
    try {
      const u = new URL(v.meeting_link.trim());
      if (!/^https?:$/i.test(u.protocol)) return "Meeting link must be http(s).";
    } catch {
      return "Meeting link must be a valid URL.";
    }
  }
  if (v.recurrence_end_date && v.recurrence_end_date < v.reminder_date) {
    return "Recurrence end date cannot be before the start date.";
  }
  if (!(REMINDER_PRIORITIES as readonly string[]).includes(v.priority)) return "Invalid priority.";
  if (!(REMINDER_STATUSES as readonly string[]).includes(v.status)) return "Invalid status.";
  return null;
}

export function buildAlertIdempotencyKey(
  reminderId: string,
  fireAtIso: string,
  offsetMinutes: number,
  channel: string,
): string {
  return `${reminderId}:${fireAtIso}:${offsetMinutes}:${channel}`;
}

/** Schedule fire times in UTC for a single occurrence */
export function buildAlertFireTimes(opts: {
  reminderId: string;
  date: string;
  startTime: string | null;
  isAllDay: boolean;
  offsets: number[];
  soundOrPush: boolean;
}): { fire_at: string; offset_minutes: number; idempotency_key: string; channel: string }[] {
  const baseIso = opts.isAllDay
    ? istDateTimeToUtcIso(opts.date, "09:00:00")
    : istDateTimeToUtcIso(opts.date, opts.startTime || "09:00:00");
  if (!baseIso) return [];
  const baseMs = new Date(baseIso).getTime();
  const offsets = [...new Set(opts.offsets.length ? opts.offsets : [0])].sort((a, b) => b - a);
  const channel = opts.soundOrPush ? "both" : "in_app";
  return offsets.map((offset_minutes) => {
    const fire = new Date(baseMs - offset_minutes * 60_000).toISOString();
    return {
      fire_at: fire,
      offset_minutes,
      channel,
      idempotency_key: buildAlertIdempotencyKey(opts.reminderId, fire, offset_minutes, channel),
    };
  });
}

/** Expand recurrence into materialisation dates (controlled horizon, max 60) */
export function expandRecurrenceDates(opts: {
  startDate: string;
  rule: RecurrenceRule;
  interval: number;
  weekdays?: number[];
  endDate?: string | null;
  endCount?: number | null;
  horizonDays?: number;
}): string[] {
  const { startDate, rule, interval } = opts;
  if (rule === "none") return [startDate];
  const horizonDays = opts.horizonDays ?? 90;
  const maxCount = Math.min(opts.endCount ?? 60, 60);
  const endCap = opts.endDate || addDaysYmd(startDate, horizonDays);
  const out: string[] = [];
  let cur = startDate;
  let safety = 0;
  while (out.length < maxCount && safety < 400) {
    safety += 1;
    if (cur > endCap) break;
    if (rule === "weekday") {
      const dow = dayOfWeekMon0(cur);
      if (dow <= 4) out.push(cur);
      cur = addDaysYmd(cur, 1);
      continue;
    }
    if (rule === "custom" && opts.weekdays?.length) {
      const dow = dayOfWeekMon0(cur);
      if (opts.weekdays.includes(dow)) out.push(cur);
      cur = addDaysYmd(cur, 1);
      continue;
    }
    out.push(cur);
    if (rule === "daily") cur = addDaysYmd(cur, Math.max(1, interval));
    else if (rule === "weekly") cur = addDaysYmd(cur, 7 * Math.max(1, interval));
    else if (rule === "monthly") cur = addMonthsYmd(cur, Math.max(1, interval));
    else if (rule === "yearly") cur = addMonthsYmd(cur, 12 * Math.max(1, interval));
    else cur = addDaysYmd(cur, 1);
  }
  return out;
}

function dayOfWeekMon0(ymd: string): number {
  // Use UTC noon + IST shift approximation via Date: treat as local calendar in IST by constructing +05:30
  const d = new Date(`${ymd}T12:00:00+05:30`);
  const js = d.getUTCDay(); // 0 Sun
  return js === 0 ? 6 : js - 1;
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + days);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, day] = ymd.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, Math.min(day, 28), 6, 30));
  // Clamp to month end in IST via format
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function isOverdueReminder(row: ReminderRow, now = new Date()): boolean {
  if (row.status === "Completed" || row.status === "Cancelled") return false;
  if (row.snooze_until && new Date(row.snooze_until).getTime() > now.getTime()) return false;
  const start = row.is_all_day
    ? istDateTimeToUtcIso(row.reminder_date, "23:59:59")
    : istDateTimeToUtcIso(row.reminder_date, row.start_time || "23:59:59");
  if (!start) return false;
  return new Date(start).getTime() < now.getTime();
}

export function relatedRecordHref(
  module: string | null | undefined,
  recordId: string | null | undefined,
  role: "admin" | "employee",
): string | null {
  if (!module || !recordId) return null;
  const base = role === "admin" ? "/admin" : "/employee";
  switch (module) {
    case "Student Master":
      return `${base}/student-master`;
    case "College Visits":
      return `${base}/college-visits`;
    case "Project Master":
      return role === "admin" ? "/admin/project-master" : null;
    case "Task Assignment":
      return role === "admin" ? "/admin/task-assignment" : "/employee/my-tasks";
    case "Finance & Expenses":
      return role === "admin" ? "/admin/finance" : null;
    case "Employee/User Master":
      return role === "admin" ? "/admin/employee-master" : "/employee/profile";
    default:
      return null;
  }
}

export function mapReminderRow(raw: Record<string, unknown>): ReminderRow {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    reminder_type: raw.reminder_type as ReminderType,
    description: (raw.description as string) ?? null,
    reminder_date: String(raw.reminder_date ?? "").slice(0, 10),
    start_time: raw.start_time != null ? String(raw.start_time).slice(0, 8) : null,
    end_time: raw.end_time != null ? String(raw.end_time).slice(0, 8) : null,
    is_all_day: Boolean(raw.is_all_day),
    priority: (raw.priority as ReminderRow["priority"]) || "Medium",
    status: (raw.status as ReminderStatus) || "Scheduled",
    location: (raw.location as string) ?? null,
    meeting_mode: (raw.meeting_mode as ReminderRow["meeting_mode"]) ?? null,
    meeting_link: (raw.meeting_link as string) ?? null,
    related_module: (raw.related_module as ReminderRow["related_module"]) ?? null,
    related_record_id: raw.related_record_id != null ? String(raw.related_record_id) : null,
    related_record_label: (raw.related_record_label as string) ?? null,
    recurrence_rule: (raw.recurrence_rule as ReminderRow["recurrence_rule"]) || "none",
    recurrence_interval: Number(raw.recurrence_interval ?? 1) || 1,
    recurrence_weekdays: Array.isArray(raw.recurrence_weekdays)
      ? (raw.recurrence_weekdays as number[])
      : null,
    recurrence_end_date: raw.recurrence_end_date != null ? String(raw.recurrence_end_date).slice(0, 10) : null,
    recurrence_end_count: raw.recurrence_end_count != null ? Number(raw.recurrence_end_count) : null,
    recurrence_group_id: raw.recurrence_group_id != null ? String(raw.recurrence_group_id) : null,
    recurrence_parent_id: raw.recurrence_parent_id != null ? String(raw.recurrence_parent_id) : null,
    is_private: Boolean(raw.is_private),
    sound_enabled: raw.sound_enabled !== false,
    push_enabled: raw.push_enabled !== false,
    notify_offsets_minutes: Array.isArray(raw.notify_offsets_minutes)
      ? (raw.notify_offsets_minutes as number[])
      : [0],
    created_by: raw.created_by != null ? String(raw.created_by) : null,
    created_at: String(raw.created_at ?? ""),
    updated_at: String(raw.updated_at ?? ""),
    completed_at: raw.completed_at != null ? String(raw.completed_at) : null,
    cancelled_at: raw.cancelled_at != null ? String(raw.cancelled_at) : null,
    snooze_until: raw.snooze_until != null ? String(raw.snooze_until) : null,
  };
}

export function isMissingRemindersTable(msg: string) {
  const m = msg.toLowerCase();
  return (
    m.includes("aj_reminders") &&
    (m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find"))
  );
}
