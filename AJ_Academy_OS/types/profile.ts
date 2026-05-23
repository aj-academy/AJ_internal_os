export type UserRole =
  | "super_admin"
  | "admin"
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
  designation: string | null;
  status: ProfileStatus | null;
  created_at: string;
}
