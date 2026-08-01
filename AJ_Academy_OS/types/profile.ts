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
  /** Portal student fields (student_portal_profile_fields.sql) */
  registration_number?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  alternate_phone?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  academic_year?: string | null;
  year_of_study?: string | null;
  semester?: string | null;
  section?: string | null;
  admission_date?: string | null;
  roll_number?: string | null;
  college_name?: string | null;
}
