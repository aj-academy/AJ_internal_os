export type TaskStatus = "Pending" | "In Progress" | "Completed";
export type TaskPriority = "Low" | "Medium" | "High";
export type TaskAssignmentType = "lead" | "project" | "college";

export type TaskLinkedLead = {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  phone_called?: boolean | null;
  whatsapp_sent?: boolean | null;
  email_sent?: boolean | null;
};

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
  completion_attachment_urls?: { name: string; url: string; mime: string; size: number }[];
  /** Resolved label for UI: "Admin" for admin roles, else full name / email. */
  assigner_display_name?: string | null;
  assigner_department?: string | null;
  assignee_department?: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  progress: number;
  assignment_type?: TaskAssignmentType | null;
  project_id?: string | null;
  project_label?: string | null;
  client_ids?: string[];
  linked_lead_labels?: string[];
  linked_leads?: TaskLinkedLead[];
  college_visit_ids?: string[];
  linked_college_labels?: string[];
  attachment_urls?: { name: string; url: string; mime: string; size: number }[];
  created_at: string;
  updated_at: string;
}
