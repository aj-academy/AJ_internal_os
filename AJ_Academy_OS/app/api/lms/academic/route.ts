import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { writeAuditLog } from "@/lib/hr/auditLog";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Lists academic structure + optionally seeds from Settings / profiles. */
export async function GET(request: Request) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const supabase = await createClient();
  const url = new URL(request.url);
  const seed = url.searchParams.get("seed") === "1";

  if (seed) {
    const { data: seedResult, error: seedError } = await supabase.rpc("lms_seed_academic_from_settings", {
      p_actor: auth.user.id,
    });
    if (seedError) {
      return NextResponse.json(
        {
          error: seedError.message,
          hint: "Run AJ_Academy_SB/lms_academic_foundation.sql in Supabase.",
        },
        { status: 500 },
      );
    }
    const { data: enrolCount, error: enrolError } = await supabase.rpc("lms_backfill_student_enrolments", {
      p_actor: auth.user.id,
    });
    if (enrolError) {
      return NextResponse.json({ error: enrolError.message, seedResult }, { status: 500 });
    }
    try {
      const admin = createAdminClient();
      await writeAuditLog(admin, {
        actorId: auth.user.id,
        action: "lms_academic.seed_and_backfill",
        module: "lms_academic",
        newData: { seedResult, enrolCount },
      });
    } catch {
      /* non-blocking */
    }
  }

  const [departments, courses, batches, modules, enrolments, mentors] = await Promise.all([
    supabase.from("academic_departments").select("*").order("name").limit(500),
    supabase.from("academic_courses").select("*").order("name").limit(1000),
    supabase.from("academic_batches").select("*").order("name").limit(1000),
    supabase.from("academic_modules").select("*").order("sort_order").limit(2000),
    supabase
      .from("student_enrolments")
      .select("id,student_id,department_id,course_id,batch_id,status", { count: "exact" })
      .eq("status", "active")
      .limit(1),
    supabase
      .from("profiles")
      .select("id,full_name,email,department,status")
      .eq("role", "mentor")
      .order("full_name")
      .limit(500),
  ]);

  const missing =
    departments.error ||
    courses.error ||
    batches.error ||
    modules.error ||
    enrolments.error ||
    mentors.error;

  if (missing) {
    const msg =
      departments.error?.message ||
      courses.error?.message ||
      batches.error?.message ||
      modules.error?.message ||
      enrolments.error?.message ||
      mentors.error?.message ||
      "Could not load academic structure.";
    return NextResponse.json(
      {
        error: msg,
        hint: "Run AJ_Academy_SB/lms_academic_foundation.sql then lms_mentor_allocations.sql.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    departments: departments.data ?? [],
    courses: courses.data ?? [],
    batches: batches.data ?? [],
    modules: modules.data ?? [],
    activeEnrolmentCount: enrolments.count ?? 0,
    mentors: mentors.data ?? [],
  });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const body = (await request.json().catch(() => ({}))) as {
    entity?: string;
    name?: string;
    department_id?: string;
    course_id?: string;
    academic_year?: string;
    start_date?: string;
    end_date?: string;
    code?: string;
  };

  const supabase = await createClient();
  const entity = String(body.entity || "");
  const name = String(body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

  if (entity === "department") {
    const { data, error } = await supabase
      .from("academic_departments")
      .insert({
        name,
        code: body.code?.trim() || null,
        created_by: auth.user.id,
        updated_by: auth.user.id,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ department: data }, { status: 201 });
  }

  if (entity === "course") {
    if (!body.department_id) {
      return NextResponse.json({ error: "department_id is required." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("academic_courses")
      .insert({
        department_id: body.department_id,
        name,
        code: body.code?.trim() || null,
        created_by: auth.user.id,
        updated_by: auth.user.id,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ course: data }, { status: 201 });
  }

  if (entity === "batch") {
    if (!body.course_id) {
      return NextResponse.json({ error: "course_id is required." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("academic_batches")
      .insert({
        course_id: body.course_id,
        name,
        academic_year: body.academic_year?.trim() || null,
        start_date: body.start_date || null,
        end_date: body.end_date || null,
        created_by: auth.user.id,
        updated_by: auth.user.id,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ batch: data }, { status: 201 });
  }

  if (entity === "module") {
    if (!body.course_id) {
      return NextResponse.json({ error: "course_id is required." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("academic_modules")
      .insert({
        course_id: body.course_id,
        name,
        code: body.code?.trim() || null,
        created_by: auth.user.id,
        updated_by: auth.user.id,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ module: data }, { status: 201 });
  }

  return NextResponse.json({ error: "Unknown entity. Use department|course|batch|module." }, { status: 400 });
}
