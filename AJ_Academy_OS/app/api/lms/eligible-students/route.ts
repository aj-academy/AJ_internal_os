import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

/** Eligible enrolled students for mentor/admin audience picker. */
export async function GET(request: Request) {
  const gate = await verifySessionRole(new Set<UserRole>(["mentor", "admin", "super_admin"]));
  if (gate.response) return gate.response;

  const url = new URL(request.url);
  const departmentId = url.searchParams.get("department_id");
  const courseId = url.searchParams.get("course_id");
  const batchId = url.searchParams.get("batch_id");

  if (!departmentId) {
    return NextResponse.json({ error: "department_id is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lms_eligible_students_for_scope", {
    p_department_id: departmentId,
    p_course_id: courseId || null,
    p_batch_id: batchId || null,
  });

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: "Run lms_academic_foundation.sql + lms_mentor_allocations.sql and ensure students have enrolments (Seed from Settings).",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ students: data ?? [] });
}
