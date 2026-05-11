export type TaskStatus = "Pending" | "In Progress" | "Completed";
export type TaskPriority = "Low" | "Medium" | "High";

export interface TaskRecord {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  priority: TaskPriority;
  status: TaskStatus;
  start_date: string | null;
  due_date: string | null;
  progress: number;
  project_id?: string | null;
  created_at: string;
  updated_at: string;
}
