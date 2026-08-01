import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";
import type { MentorAllocation, MentorAllocationInput } from "@/types/lms";

export async function auditMentorAllocationChange(params: {
  actorId: string;
  action: string;
  allocationId: string;
  oldData?: unknown;
  newData?: unknown;
}) {
  try {
    const admin = createAdminClient();
    await writeAuditLog(admin, {
      actorId: params.actorId,
      action: params.action,
      module: "lms_mentor_allocation",
      targetTable: "mentor_allocations",
      targetId: params.allocationId,
      oldData: params.oldData,
      newData: params.newData,
    });
  } catch (e) {
    console.error("[lms] auditMentorAllocationChange", e);
  }
}

export function normalizeAllocationInput(body: MentorAllocationInput): MentorAllocationInput {
  return {
    mentor_id: String(body.mentor_id || "").trim(),
    department_id: String(body.department_id || "").trim(),
    course_id: body.course_id ? String(body.course_id).trim() : null,
    batch_id: body.batch_id ? String(body.batch_id).trim() : null,
    module_id: body.module_id ? String(body.module_id).trim() : null,
    start_date: String(body.start_date || "").trim(),
    end_date: body.end_date ? String(body.end_date).trim() : null,
    is_primary: body.is_primary !== false,
    status: body.status ?? "active",
    notes: body.notes ? String(body.notes).trim() : null,
  };
}

export function validateAllocationInput(input: MentorAllocationInput): string | null {
  if (!input.mentor_id) return "Mentor is required.";
  if (!input.department_id) return "Department is required.";
  if (!input.start_date) return "Start date is required.";
  if (input.end_date && input.end_date < input.start_date) {
    return "End date must be on or after the start date.";
  }
  return null;
}

export type AllocationListRow = MentorAllocation & {
  mentor_name?: string | null;
  mentor_email?: string | null;
  department_name?: string | null;
  course_name?: string | null;
  batch_name?: string | null;
  module_name?: string | null;
};
