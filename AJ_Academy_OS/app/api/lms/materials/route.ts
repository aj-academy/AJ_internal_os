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
      .from("lms_study_material_recipients")
      .select("*, lms_study_materials(*)")
      .eq("student_id", gate.user!.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      return NextResponse.json(
        { error: error.message, hint: "Run AJ_Academy_SB/lms_05_study_materials.sql." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      items: (data ?? []).map((r) => ({
        recipient: {
          id: r.id,
          status: r.status,
          material_id: r.material_id,
          download_count: r.download_count,
        },
        material: r.lms_study_materials,
      })),
    });
  }

  const { data, error } = await supabase
    .from("lms_study_materials")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run AJ_Academy_SB/lms_05_study_materials.sql." },
      { status: 500 },
    );
  }
  return NextResponse.json({ materials: data ?? [] });
}

export async function POST(request: Request) {
  const gate = await verifySessionRole(STAFF);
  if (gate.response || !gate.user) return gate.response!;

  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    department_id?: string;
    course_id?: string | null;
    batch_id?: string | null;
    material_type?: string;
    external_url?: string | null;
    topic?: string | null;
    download_allowed?: boolean;
    student_ids?: string[];
    publish?: boolean;
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
    .from("lms_study_materials")
    .insert({
      title,
      description: body.description?.trim() || null,
      department_id: departmentId,
      course_id: body.course_id || null,
      batch_id: body.batch_id || null,
      material_type: body.material_type || "external_link",
      external_url: body.external_url?.trim() || null,
      topic: body.topic?.trim() || null,
      download_allowed: body.download_allowed !== false,
      status: "draft",
      audience_type: body.student_ids?.length ? "selected_students" : "department",
      assigned_by: gate.user.id,
      created_by: gate.user.id,
      updated_by: gate.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (body.publish) {
    const { data: pub, error: pubError } = await supabase.rpc("lms_publish_study_material", {
      p_material_id: created.id,
      p_student_ids: body.student_ids?.length ? body.student_ids : null,
      p_idempotency_key: `publish-material-${created.id}`,
    });
    if (pubError) {
      return NextResponse.json({ error: pubError.message, material: created, published: false }, { status: 500 });
    }
    const { data: refreshed } = await supabase.from("lms_study_materials").select("*").eq("id", created.id).single();
    return NextResponse.json({ material: refreshed ?? created, publish: pub }, { status: 201 });
  }

  return NextResponse.json({ material: created }, { status: 201 });
}
