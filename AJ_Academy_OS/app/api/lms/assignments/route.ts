import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

const MENTOR_OR_ADMIN = new Set<UserRole>(["mentor", "admin", "super_admin"]);

export async function GET() {
  const gate = await verifySessionRole(new Set<UserRole>(["mentor", "admin", "super_admin", "student"]));
  if (gate.response) return gate.response;

  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();

  if (role === "student") {
    const { data: recipients, error } = await supabase
      .from("lms_assignment_recipients")
      .select("*, lms_assignments(*)")
      .eq("student_id", gate.user!.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          hint: "Run AJ_Academy_SB/lms_03_assignments.sql after lms_01 and lms_02.",
        },
        { status: 500 },
      );
    }
    return NextResponse.json({
      items: (recipients ?? []).map((r) => ({
        recipient: {
          id: r.id,
          status: r.status,
          first_viewed_at: r.first_viewed_at,
          assignment_id: r.assignment_id,
        },
        assignment: r.lms_assignments,
      })),
    });
  }

  const { data, error } = await supabase
    .from("lms_assignments")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: "Run AJ_Academy_SB/lms_03_assignments.sql after lms_01 and lms_02.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ assignments: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await verifySessionRole(MENTOR_OR_ADMIN);
  if (gate.response || !gate.user) return gate.response!;

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    instructions?: string;
    department_id?: string;
    course_id?: string | null;
    batch_id?: string | null;
    module_id?: string | null;
    total_marks?: number;
    passing_marks?: number;
    due_at?: string | null;
    start_at?: string | null;
    allow_late?: boolean;
    submission_type?: string;
    audience_type?: string;
    student_ids?: string[];
    publish?: boolean;
  };

  const title = String(body.title || "").trim();
  const departmentId = String(body.department_id || "").trim();
  if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
  if (!departmentId) return NextResponse.json({ error: "Department is required." }, { status: 400 });

  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();

  if (role === "mentor") {
    const { data: allowed, error: scopeError } = await supabase.rpc("lms_mentor_has_active_allocation", {
      p_mentor_id: gate.user.id,
      p_department_id: departmentId,
      p_course_id: body.course_id || null,
      p_batch_id: body.batch_id || null,
      p_module_id: body.module_id || null,
    });
    if (scopeError) {
      return NextResponse.json({ error: scopeError.message }, { status: 500 });
    }
    if (!allowed) {
      return NextResponse.json(
        { error: "No active mentor allocation for this department/course/batch scope." },
        { status: 403 },
      );
    }
  }

  const { data: created, error } = await supabase
    .from("lms_assignments")
    .insert({
      title,
      description: body.description?.trim() || null,
      instructions: body.instructions?.trim() || null,
      department_id: departmentId,
      course_id: body.course_id || null,
      batch_id: body.batch_id || null,
      module_id: body.module_id || null,
      total_marks: body.total_marks ?? 100,
      passing_marks: body.passing_marks ?? 40,
      due_at: body.due_at || null,
      start_at: body.start_at || null,
      allow_late: Boolean(body.allow_late),
      submission_type: body.submission_type || "combined",
      audience_type: body.audience_type || (body.student_ids?.length ? "selected_students" : "department"),
      status: "draft",
      assigned_by: gate.user.id,
      created_by: gate.user.id,
      updated_by: gate.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.publish) {
    const { data: pub, error: pubError } = await supabase.rpc("lms_publish_assignment", {
      p_assignment_id: created.id,
      p_student_ids: body.student_ids?.length ? body.student_ids : null,
      p_idempotency_key: `publish-${created.id}`,
    });
    if (pubError) {
      return NextResponse.json(
        { error: pubError.message, assignment: created, published: false },
        { status: 500 },
      );
    }
    const { data: refreshed } = await supabase.from("lms_assignments").select("*").eq("id", created.id).single();
    return NextResponse.json({ assignment: refreshed ?? created, publish: pub }, { status: 201 });
  }

  return NextResponse.json({ assignment: created }, { status: 201 });
}
