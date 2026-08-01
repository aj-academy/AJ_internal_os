import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import {
  auditMentorAllocationChange,
  normalizeAllocationInput,
  validateAllocationInput,
  type AllocationListRow,
} from "@/lib/lms/mentorAllocations";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminApiSession();
  if (auth.response) return auth.response;

  const supabase = await createClient();
  await supabase.rpc("lms_expire_mentor_allocations");

  const { data: allocations, error } = await supabase
    .from("mentor_allocations")
    .select("*")
    .order("assigned_at", { ascending: false })
    .limit(2000);

  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: "Run AJ_Academy_SB/lms_01_academic_foundation.sql then lms_02_mentor_allocations.sql in Supabase.",
      },
      { status: 500 },
    );
  }

  const rows = (allocations ?? []) as AllocationListRow[];
  const mentorIds = [...new Set(rows.map((r) => r.mentor_id))];
  const deptIds = [...new Set(rows.map((r) => r.department_id))];
  const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean))] as string[];
  const batchIds = [...new Set(rows.map((r) => r.batch_id).filter(Boolean))] as string[];
  const moduleIds = [...new Set(rows.map((r) => r.module_id).filter(Boolean))] as string[];

  const [mentors, depts, courses, batches, modules] = await Promise.all([
    mentorIds.length
      ? supabase.from("profiles").select("id,full_name,email").in("id", mentorIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
    deptIds.length
      ? supabase.from("academic_departments").select("id,name").in("id", deptIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    courseIds.length
      ? supabase.from("academic_courses").select("id,name").in("id", courseIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    batchIds.length
      ? supabase.from("academic_batches").select("id,name").in("id", batchIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    moduleIds.length
      ? supabase.from("academic_modules").select("id,name").in("id", moduleIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const mentorMap = new Map((mentors.data ?? []).map((m) => [m.id, m]));
  const deptMap = new Map((depts.data ?? []).map((d) => [d.id, d.name]));
  const courseMap = new Map((courses.data ?? []).map((c) => [c.id, c.name]));
  const batchMap = new Map((batches.data ?? []).map((b) => [b.id, b.name]));
  const moduleMap = new Map((modules.data ?? []).map((m) => [m.id, m.name]));

  const enriched = rows.map((r) => {
    const mentor = mentorMap.get(r.mentor_id);
    return {
      ...r,
      mentor_name: mentor?.full_name ?? null,
      mentor_email: mentor?.email ?? null,
      department_name: deptMap.get(r.department_id) ?? null,
      course_name: r.course_id ? courseMap.get(r.course_id) ?? null : null,
      batch_name: r.batch_id ? batchMap.get(r.batch_id) ?? null : null,
      module_name: r.module_id ? moduleMap.get(r.module_id) ?? null : null,
    };
  });

  return NextResponse.json({ allocations: enriched });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const input = normalizeAllocationInput(body as never);
  const validationError = validateAllocationInput(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: mentor, error: mentorError } = await supabase
    .from("profiles")
    .select("id,role,status")
    .eq("id", input.mentor_id)
    .maybeSingle();

  if (mentorError || !mentor) {
    return NextResponse.json({ error: "Mentor profile not found." }, { status: 404 });
  }
  if (String(mentor.role).toLowerCase() !== "mentor") {
    return NextResponse.json({ error: "Selected user must have role mentor." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mentor_allocations")
    .insert({
      mentor_id: input.mentor_id,
      department_id: input.department_id,
      course_id: input.course_id,
      batch_id: input.batch_id,
      module_id: input.module_id,
      start_date: input.start_date,
      end_date: input.end_date,
      is_primary: input.is_primary !== false,
      status: input.status ?? "active",
      notes: input.notes,
      assigned_by: auth.user.id,
      created_by: auth.user.id,
      updated_by: auth.user.id,
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await auditMentorAllocationChange({
    actorId: auth.user.id,
    action: "mentor_allocation.create",
    allocationId: data.id,
    newData: data,
  });

  return NextResponse.json({ allocation: data }, { status: 201 });
}
