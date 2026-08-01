import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

/** Mentor: list my assigned students by role. */
export async function GET(request: Request) {
  const gate = await verifySessionRole(new Set<UserRole>(["mentor", "admin", "super_admin"]));
  if (gate.response || !gate.user || !gate.profile) return gate.response!;

  const admin = createAdminClient();
  try {
    await admin.rpc("expire_student_mentor_assignments");
  } catch {
    /* optional */
  }

  const url = new URL(request.url);
  const roleFilter = url.searchParams.get("role");
  const mentorId =
    gate.profile.role === "mentor" ? gate.user.id : url.searchParams.get("mentorId") || gate.user.id;

  let query = admin
    .from("student_mentor_assignments")
    .select("*")
    .eq("mentor_id", mentorId)
    .in("status", ["active", "transferred", "completed", "expired"])
    .order("assigned_at", { ascending: false })
    .limit(1000);

  if (roleFilter === "primary") query = query.eq("is_primary", true).eq("status", "active");
  else if (roleFilter === "secondary") query = query.eq("is_primary", false).eq("status", "active");
  else if (roleFilter) query = query.eq("mentor_role", roleFilter).eq("status", "active");

  const { data: assignments, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run student_mentor_assignments.sql" },
      { status: 500 },
    );
  }

  const studentIds = Array.from(new Set((assignments ?? []).map((a) => a.student_id)));
  const { data: students } = studentIds.length
    ? await admin
        .from("profiles")
        .select("id,full_name,email,department,course,registration_number,phone,status")
        .in("id", studentIds)
    : { data: [] as { id: string }[] };

  const byId = new Map((students ?? []).map((s) => [s.id, s]));
  const rows = (assignments ?? []).map((a) => ({
    ...a,
    student: byId.get(a.student_id) ?? null,
  }));

  return NextResponse.json({ assignments: rows });
}
