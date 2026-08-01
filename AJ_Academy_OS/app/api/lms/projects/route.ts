import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

const STAFF = new Set<UserRole>(["mentor", "admin", "super_admin"]);

export async function GET() {
  const gate = await verifySessionRole(new Set<UserRole>(["mentor", "admin", "super_admin", "student"]));
  if (gate.response) return gate.response;
  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();

  if (role === "student") {
    const { data, error } = await supabase
      .from("lms_project_recipients")
      .select("*, lms_projects(*)")
      .eq("student_id", gate.user!.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json(
        { error: error.message, hint: "Run AJ_Academy_SB/lms_projects.sql." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      items: (data ?? []).map((r) => ({
        recipient: { id: r.id, status: r.status, project_id: r.project_id },
        project: r.lms_projects,
      })),
    });
  }

  const { data, error } = await supabase
    .from("lms_projects")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run AJ_Academy_SB/lms_projects.sql." },
      { status: 500 },
    );
  }
  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await verifySessionRole(STAFF);
  if (gate.response || !gate.user) return gate.response!;

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    problem_statement?: string;
    description?: string;
    department_id?: string;
    course_id?: string | null;
    batch_id?: string | null;
    team_mode?: string;
    final_deadline?: string | null;
    total_marks?: number;
    student_ids?: string[];
    publish?: boolean;
    seed_milestones?: boolean;
  };

  const title = String(body.title || "").trim();
  const departmentId = String(body.department_id || "").trim();
  if (!title || !departmentId) {
    return NextResponse.json({ error: "Title and department are required." }, { status: 400 });
  }

  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();
  if (role === "mentor") {
    const { data: allowed } = await supabase.rpc("lms_mentor_has_active_allocation", {
      p_mentor_id: gate.user.id,
      p_department_id: departmentId,
      p_course_id: body.course_id || null,
      p_batch_id: body.batch_id || null,
      p_module_id: null,
    });
    if (!allowed) {
      return NextResponse.json({ error: "No active mentor allocation for this scope." }, { status: 403 });
    }
  }

  const { data: created, error } = await supabase
    .from("lms_projects")
    .insert({
      title,
      problem_statement: body.problem_statement?.trim() || null,
      description: body.description?.trim() || null,
      department_id: departmentId,
      course_id: body.course_id || null,
      batch_id: body.batch_id || null,
      team_mode: body.team_mode || "individual",
      final_deadline: body.final_deadline || null,
      total_marks: body.total_marks ?? 100,
      guide_mentor_id: gate.user.id,
      status: "draft",
      audience_type: body.student_ids?.length ? "selected_students" : "department",
      assigned_by: gate.user.id,
      created_by: gate.user.id,
      updated_by: gate.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.seed_milestones !== false) {
    await supabase.rpc("lms_seed_default_project_milestones", { p_project_id: created.id });
  }

  if (body.publish) {
    const { data: pub, error: pubError } = await supabase.rpc("lms_publish_project", {
      p_project_id: created.id,
      p_student_ids: body.student_ids?.length ? body.student_ids : null,
      p_idempotency_key: `publish-project-${created.id}`,
    });
    if (pubError) {
      return NextResponse.json({ error: pubError.message, project: created, published: false }, { status: 500 });
    }
    const { data: refreshed } = await supabase.from("lms_projects").select("*").eq("id", created.id).single();
    return NextResponse.json({ project: refreshed ?? created, publish: pub }, { status: 201 });
  }

  return NextResponse.json({ project: created }, { status: 201 });
}
