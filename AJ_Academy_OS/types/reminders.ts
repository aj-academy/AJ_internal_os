export const REMINDER_TYPES = [
  "Meeting",
  "Appointment",
  "Call",
  "Student Follow-up",
  "College Follow-up",
  "Proposal Follow-up",
  "Payment Follow-up",
  "College Visit",
  "Training Session",
  "Deadline",
  "Personal Reminder",
  "General Reminder",
] as const;

export type ReminderType = (typeof REMINDER_TYPES)[number];

export const REMINDER_PRIORITIES = ["Low", "Medium", "High", "Urgent"] as const;
export type ReminderPriority = (typeof REMINDER_PRIORITIES)[number];

export const REMINDER_STATUSES = [
  "Scheduled",
  "In Progress",
  "Completed",
  "Cancelled",
  "Missed",
  "Rescheduled",
] as const;
export type ReminderStatus = (typeof REMINDER_STATUSES)[number];

export const MEETING_MODES = [
  "In Person",
  "Phone Call",
  "Google Meet",
  "Zoom",
  "Microsoft Teams",
  "Other",
] as const;
export type MeetingMode = (typeof MEETING_MODES)[number];

export const RELATED_MODULES = [
  "Student Master",
  "College Visits",
  "Project Master",
  "Task Assignment",
  "Finance & Expenses",
  "Employee/User Master",
  "General",
] as const;
export type RelatedModule = (typeof RELATED_MODULES)[number];

export const RECURRENCE_RULES = [
  "none",
  "daily",
  "weekday",
  "weekly",
  "monthly",
  "yearly",
  "custom",
] as const;
export type RecurrenceRule = (typeof RECURRENCE_RULES)[number];

export const NOTIFY_OFFSET_PRESETS = [
  { label: "At scheduled time", minutes: 0 },
  { label: "5 minutes before", minutes: 5 },
  { label: "10 minutes before", minutes: 10 },
  { label: "15 minutes before", minutes: 15 },
  { label: "30 minutes before", minutes: 30 },
  { label: "1 hour before", minutes: 60 },
  { label: "1 day before", minutes: 1440 },
] as const;

export type ReminderAssigneeRole = "assignee" | "participant";

export type ReminderAssignee = {
  id?: string;
  user_id: string;
  role: ReminderAssigneeRole;
  full_name?: string | null;
  email?: string | null;
};

export type ReminderRow = {
  id: string;
  title: string;
  reminder_type: ReminderType;
  description: string | null;
  reminder_date: string;
  start_time: string | null;
  end_time: string | null;
  is_all_day: boolean;
  priority: ReminderPriority;
  status: ReminderStatus;
  location: string | null;
  meeting_mode: MeetingMode | null;
  meeting_link: string | null;
  related_module: RelatedModule | null;
  related_record_id: string | null;
  related_record_label: string | null;
  recurrence_rule: RecurrenceRule;
  recurrence_interval: number;
  recurrence_weekdays: number[] | null;
  recurrence_end_date: string | null;
  recurrence_end_count: number | null;
  recurrence_group_id: string | null;
  recurrence_parent_id: string | null;
  is_private: boolean;
  sound_enabled: boolean;
  push_enabled: boolean;
  notify_offsets_minutes: number[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  snooze_until: string | null;
  assignees?: ReminderAssignee[];
};

export type ReminderFormValue = {
  title: string;
  reminder_type: ReminderType | "";
  description: string;
  reminder_date: string;
  start_time: string;
  end_time: string;
  is_all_day: boolean;
  priority: ReminderPriority;
  status: ReminderStatus;
  location: string;
  meeting_mode: MeetingMode | "";
  meeting_link: string;
  related_module: RelatedModule | "";
  related_record_id: string;
  related_record_label: string;
  recurrence_rule: RecurrenceRule;
  recurrence_interval: number;
  recurrence_weekdays: number[];
  recurrence_end_date: string;
  recurrence_end_count: string;
  is_private: boolean;
  sound_enabled: boolean;
  push_enabled: boolean;
  notify_offsets_minutes: number[];
  assignee_ids: string[];
  participant_ids: string[];
};

export type ReminderUserSettings = {
  user_id: string;
  sound_enabled: boolean;
  sound_volume: number;
  popup_enabled: boolean;
  browser_notification_enabled: boolean;
  push_enabled: boolean;
  default_notify_offsets_minutes: number[];
  default_snooze_minutes: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
};

export type ReminderNotificationRow = {
  id: string;
  reminder_id: string;
  alert_id: string | null;
  user_id: string;
  title: string;
  body: string | null;
  link_path: string | null;
  sound_played_at: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
  reminder?: ReminderRow | null;
};

export type ReminderWorkbenchTab =
  | "today"
  | "upcoming"
  | "calendar"
  | "all"
  | "assigned"
  | "created"
  | "completed"
  | "settings";
