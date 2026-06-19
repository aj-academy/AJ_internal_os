export type UserRole =
  | "super_admin"
  | "admin"
  | "employee"
  | "student"
  | "freelancer"
  | "mentor";

export type ProfileStatus = "active" | "inactive";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole | null;
  department: string | null;
  course?: string | null;
  assigned_mentor_id?: string | null;
  designation: string | null;
  status: ProfileStatus | null;
  created_at: string;
}
