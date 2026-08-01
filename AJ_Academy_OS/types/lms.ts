/** LMS Phase 1 — academic structure + mentor allocations */

export type AcademicStatus = "active" | "inactive" | "archived" | "completed";

export type AcademicDepartment = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AcademicCourse = {
  id: string;
  department_id: string;
  name: string;
  code: string | null;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AcademicBatch = {
  id: string;
  course_id: string;
  name: string;
  academic_year: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type AcademicModule = {
  id: string;
  course_id: string;
  name: string;
  code: string | null;
  description: string | null;
  sort_order: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type StudentEnrolment = {
  id: string;
  student_id: string;
  department_id: string;
  course_id: string;
  batch_id: string | null;
  status: string;
  enrolled_at: string;
  ended_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MentorAllocationStatus = "active" | "inactive" | "expired" | "revoked";

export type MentorAllocation = {
  id: string;
  mentor_id: string;
  department_id: string;
  course_id: string | null;
  batch_id: string | null;
  module_id: string | null;
  start_date: string;
  end_date: string | null;
  is_primary: boolean;
  status: MentorAllocationStatus | string;
  assigned_by: string | null;
  assigned_at: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MentorAllocationInput = {
  mentor_id: string;
  department_id: string;
  course_id?: string | null;
  batch_id?: string | null;
  module_id?: string | null;
  start_date: string;
  end_date?: string | null;
  is_primary?: boolean;
  status?: MentorAllocationStatus;
  notes?: string | null;
};

export type EligibleStudent = {
  student_id: string;
  full_name: string | null;
  email: string | null;
  enrolment_id: string;
  course_id: string;
  batch_id: string | null;
};
