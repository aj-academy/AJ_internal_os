/**
 * Student↔mentor assignment helpers (capacity, transfer, bulk distribution).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const MENTOR_ROLES = [
  "primary_academic",
  "secondary",
  "academic",
  "project",
  "placement",
  "technical",
  "support",
  "backup",
] as const;

export type MentorRole = (typeof MENTOR_ROLES)[number];

export type DistributionStrategy =
  | "equal"
  | "round_robin"
  | "capacity"
  | "section"
  | "alphabetical"
  | "registration"
  | "manual";

export type CapacityStatus = "available" | "near_capacity" | "at_capacity" | "over_capacity";

export async function getMentorWorkload(admin: SupabaseClient, mentorId: string) {
  try {
    await admin.rpc("expire_student_mentor_assignments");
  } catch {
    /* optional RPC */
  }

  const { data: capacity } = await admin.from("mentor_capacity").select("*").eq("mentor_id", mentorId).maybeSingle();
  const caps = {
    max_total_students: capacity?.max_total_students ?? 50,
    max_primary_students: capacity?.max_primary_students ?? 40,
    max_secondary_students: capacity?.max_secondary_students ?? 20,
    is_active: capacity?.is_active ?? true,
    availability: capacity?.availability ?? "available",
  };

  const { data: active } = await admin
    .from("student_mentor_assignments")
    .select("id,is_primary,mentor_role,student_id")
    .eq("mentor_id", mentorId)
    .eq("status", "active");

  const primary = (active ?? []).filter((a) => a.is_primary).length;
  const secondary = (active ?? []).filter((a) => !a.is_primary).length;
  const total = (active ?? []).length;
  const pct = caps.max_total_students > 0 ? Math.round((total / caps.max_total_students) * 100) : 0;

  let status: CapacityStatus = "available";
  if (pct >= 100) status = total > caps.max_total_students ? "over_capacity" : "at_capacity";
  else if (pct >= 80) status = "near_capacity";

  return { caps, primary, secondary, total, pct, status, active: active ?? [] };
}

export function distributeStudents<T>(
  students: T[],
  mentorIds: string[],
  strategy: DistributionStrategy,
): { mentorId: string; students: T[] }[] {
  if (!mentorIds.length) return [];
  const buckets = mentorIds.map((mentorId) => ({ mentorId, students: [] as T[] }));

  if (strategy === "round_robin" || strategy === "equal") {
    students.forEach((s, i) => {
      buckets[i % buckets.length].students.push(s);
    });
    return buckets;
  }

  // capacity / alphabetical / registration / section fall back to equal unless callers pre-sort
  students.forEach((s, i) => {
    buckets[i % buckets.length].students.push(s);
  });
  return buckets;
}

export async function createAssignment(
  admin: SupabaseClient,
  input: {
    student_id: string;
    mentor_id: string;
    mentor_role: MentorRole;
    is_primary?: boolean;
    department_id?: string | null;
    course_id?: string | null;
    batch_id?: string | null;
    start_date?: string;
    end_date?: string | null;
    is_temporary?: boolean;
    reason?: string | null;
    notes?: string | null;
    assigned_by: string;
    capacity_override?: boolean;
    capacity_override_reason?: string | null;
  },
) {
  const isPrimary = input.is_primary ?? input.mentor_role === "primary_academic";
  const workload = await getMentorWorkload(admin, input.mentor_id);

  if (!workload.caps.is_active || workload.caps.availability === "unavailable") {
    throw new Error("Mentor is inactive or unavailable.");
  }

  const wouldTotal = workload.total + 1;
  const wouldPrimary = workload.primary + (isPrimary ? 1 : 0);
  const wouldSecondary = workload.secondary + (isPrimary ? 0 : 1);
  const over =
    wouldTotal > workload.caps.max_total_students ||
    wouldPrimary > workload.caps.max_primary_students ||
    wouldSecondary > workload.caps.max_secondary_students;

  if (over && !input.capacity_override) {
    throw new Error(
      `Mentor at capacity (total ${workload.total}/${workload.caps.max_total_students}). Provide capacity override with reason.`,
    );
  }
  if (over && input.capacity_override && !input.capacity_override_reason?.trim()) {
    throw new Error("Capacity override requires a reason.");
  }

  if (isPrimary) {
    // close existing primary
    await admin
      .from("student_mentor_assignments")
      .update({ status: "transferred", end_date: new Date().toISOString().slice(0, 10) })
      .eq("student_id", input.student_id)
      .eq("is_primary", true)
      .eq("status", "active");
  }

  const { data, error } = await admin
    .from("student_mentor_assignments")
    .insert({
      student_id: input.student_id,
      mentor_id: input.mentor_id,
      mentor_role: input.mentor_role,
      is_primary: isPrimary,
      department_id: input.department_id ?? null,
      course_id: input.course_id ?? null,
      batch_id: input.batch_id ?? null,
      start_date: input.start_date || new Date().toISOString().slice(0, 10),
      end_date: input.end_date ?? null,
      is_temporary: !!input.is_temporary,
      auto_expire: true,
      status: "active",
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      assigned_by: input.assigned_by,
      capacity_override: !!input.capacity_override,
      capacity_override_reason: input.capacity_override_reason ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  if (input.capacity_override && over) {
    await admin.from("mentor_capacity_overrides").insert({
      assignment_id: data.id,
      mentor_id: input.mentor_id,
      student_id: input.student_id,
      reason: input.capacity_override_reason,
      overridden_by: input.assigned_by,
    });
  }

  return data;
}

export async function transferAssignment(
  admin: SupabaseClient,
  input: {
    student_id: string;
    from_mentor_id: string;
    to_mentor_id: string;
    mentor_role?: MentorRole;
    transfer_date?: string;
    reason?: string;
    retain_readonly?: boolean;
    assigned_by: string;
  },
) {
  const { data: current } = await admin
    .from("student_mentor_assignments")
    .select("*")
    .eq("student_id", input.student_id)
    .eq("mentor_id", input.from_mentor_id)
    .eq("status", "active")
    .order("is_primary", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!current) throw new Error("No active assignment found for current mentor.");

  const transferDate = input.transfer_date || new Date().toISOString().slice(0, 10);

  await admin
    .from("student_mentor_assignments")
    .update({
      status: "transferred",
      end_date: transferDate,
      retain_readonly_access: !!input.retain_readonly,
      reason: input.reason || current.reason,
    })
    .eq("id", current.id);

  const created = await createAssignment(admin, {
    student_id: input.student_id,
    mentor_id: input.to_mentor_id,
    mentor_role: input.mentor_role || (current.mentor_role as MentorRole),
    is_primary: current.is_primary,
    department_id: current.department_id,
    course_id: current.course_id,
    batch_id: current.batch_id,
    start_date: transferDate,
    reason: input.reason || "Mentor transfer",
    assigned_by: input.assigned_by,
  });

  await admin
    .from("student_mentor_assignments")
    .update({ transferred_from_id: current.id })
    .eq("id", created.id);

  return { closed: current, created };
}

export function suggestMentors(args: {
  mentors: {
    id: string;
    department: string | null;
    total: number;
    max: number;
    status: CapacityStatus;
    preferredDepts?: string[];
  }[];
  studentDepartmentId?: string | null;
  studentDepartmentName?: string | null;
}): { mentorId: string; score: number; reason: string }[] {
  return args.mentors
    .map((m) => {
      let score = 100 - m.total;
      let reason = "workload";
      if (m.status === "over_capacity" || m.status === "at_capacity") score -= 50;
      if (
        args.studentDepartmentName &&
        m.department &&
        m.department.toLowerCase() === args.studentDepartmentName.toLowerCase()
      ) {
        score += 20;
        reason = "department match";
      }
      if (args.studentDepartmentId && m.preferredDepts?.includes(args.studentDepartmentId)) {
        score += 15;
        reason = "preferred department";
      }
      return { mentorId: m.id, score, reason };
    })
    .sort((a, b) => b.score - a.score);
}
