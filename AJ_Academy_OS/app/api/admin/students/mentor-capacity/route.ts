import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { writeAuditLog } from "@/lib/hr/auditLog";

export const runtime = "nodejs";

/** GET all mentor capacity rows (+ defaults for mentors missing a row) */
export async function GET() {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;
  const admin = createAdminClient();

  const [{ data: mentors }, { data: caps, error }] = await Promise.all([
    admin.from("profiles").select("id,full_name,email,department,status").eq("role", "mentor").limit(200),
    admin.from("mentor_capacity").select("*"),
  ]);
  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run student_mentor_assignments.sql" },
      { status: 500 },
    );
  }
  const byId = new Map((caps ?? []).map((c) => [c.mentor_id, c]));
  return NextResponse.json({
    rows: (mentors ?? []).map((m) => ({
      mentor: m,
      capacity: byId.get(m.id) ?? null,
    })),
  });
}

/** PUT upsert mentor capacity */
export async function PUT(request: Request) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;
  const admin = createAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const mentor_id = String(body.mentor_id || "");
  if (!mentor_id) return NextResponse.json({ error: "mentor_id required." }, { status: 400 });

  const row = {
    mentor_id,
    max_total_students: Number(body.max_total_students ?? 50),
    max_primary_students: Number(body.max_primary_students ?? 40),
    max_secondary_students: Number(body.max_secondary_students ?? 20),
    max_projects: Number(body.max_projects ?? 20),
    max_active_tests: Number(body.max_active_tests ?? 20),
    max_batches: Number(body.max_batches ?? 10),
    expertise: Array.isArray(body.expertise) ? body.expertise.map(String) : [],
    availability: typeof body.availability === "string" ? body.availability : "available",
    is_active: body.is_active !== false,
    notes: typeof body.notes === "string" ? body.notes : null,
    updated_by: auth.user.id,
  };

  const { data, error } = await admin.from("mentor_capacity").upsert(row).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await writeAuditLog(admin, {
    actorId: auth.user.id,
    action: "mentor_capacity.upsert",
    module: "student_mentor",
    targetId: mentor_id,
    newData: data,
  }).catch(() => undefined);

  return NextResponse.json({ capacity: data });
}
