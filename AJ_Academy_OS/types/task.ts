export type TaskStatus = "Pending" | "In Progress" | "Completed";
export type TaskPriority = "Low" | "Medium" | "High";

export interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string | null;
  assignee_name?: string | null;
  assignee_email?: string | null;
  /** Who created or last reassigned the task (profiles.id); used for in-app completion notifications. */
  assigned_by?: string | null;
  /** Submitted by assignee when marking completed (requires task_notifications_columns.sql). */
  completion_summary?: string | null;
  /** Resolved label for UI: "Admin" for admin roles, else full name / email. */
  assigner_display_name?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  progress: number;
  project_id?: string | null;
  attachment_urls?: { name: string; url: string; mime: string; size: number }[];
  created_at: string;
  updated_at: string;
}
