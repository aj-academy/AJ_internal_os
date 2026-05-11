export type ProjectStatus = "Planning" | "Active" | "On Hold" | "In Review" | "Completed" | "Cancelled" | "Delayed";
export type ProjectPriority = "Low" | "Medium" | "High" | "Urgent";

export type ProjectTabId =
  | "overview"
  | "all"
  | "active"
  | "completed"
  | "delayed"
  | "team"
  | "timeline"
  | "budget"
  | "reports"
  | "settings";

export interface ProjectRow {
  id: string;
  project_code: string | null;
  project_name: string;
  client_id: string | null;
  project_type: string | null;
  description: string | null;
  priority: string | null;
  status: string | null;
  start_date: string | null;
  deadline: string | null;
  estimated_completion: string | null;
  budget: number | null;
  advance_paid: number | null;
  pending_amount: number | null;
  project_manager: string | null;
  assigned_team: unknown;
  progress: number | null;
  total_tasks: number | null;
  completed_tasks: number | null;
  delayed_tasks: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProjectActivityRow {
  id: string;
  project_id: string;
  activity_type: string;
  notes: string | null;
  old_value: string | null;
  new_value: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TeamMemberRow {
  project_id: string;
  profile_id: string;
  role: string | null;
}

export interface ClientOption {
  id: string;
  lead_name: string | null;
  name: string | null;
  company_name: string | null;
}
