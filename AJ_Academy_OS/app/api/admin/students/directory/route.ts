import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";

export const runtime = "nodejs";

/**
 * GET /api/admin/students/directory
 * Student list with active mentor allotments (admin view).
 * Query: search, mentorFilter=all|with|without, status=active|all
 */
export async function GET(request: Request) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const admin = createAdminClient();
  try {
    await admin.rpc("expire_student_mentor_assignments");
  } catch {
    /* optional */
  }

  const url = new URL(request.url);
  const search = (url.searchParams.get("search") || "").trim().toLowerCase();
  const mentorFilter = url.searchParams.get("mentorFilter") || "all"; // all | with | without
  const status = url.searchParams.get("status") || "active";

  let studentsQuery = admin
    .from("profiles")
    .select(
      "id,full_name,email,phone,department,course,registration_number,roll_number,section,academic_year,status,assigned_mentor_id,created_at",
    )
    .eq("role", "student")
    .order("full_name")
    .limit(3000);

  if (status !== "all") {
    studentsQuery = studentsQuery.eq("status", status);
  }

  const [{ data: students, error: sErr }, { data: assignments, error: aErr }, { data: mentors }] =
    await Promise.all([
      studentsQuery,
      admin
        .from("student_mentor_assignments")
        .select(
          "id,student_id,mentor_id,mentor_role,is_primary,status,start_date,end_date,assigned_at",
        )
        .eq("status", "active")
        .limit(10000),
      admin.from("profiles").select("id,full_name,email").eq("role", "mentor").limit(500),
    ]);

  if (sErr) {
    return NextResponse.json(
      { error: sErr.message, hint: "Ensure profiles are readable by admin." },
      { status: 500 },
    );
  }
  if (aErr) {
    return NextResponse.json(
      { error: aErr.message, hint: "Run student_mentor_assignments.sql" },
      { status: 500 },
    );
  }

  const mentorById = new Map((mentors ?? []).map((m) => [m.id, m]));
  const assignmentsByStudent = new Map<
    string,
    {
      id: string;
      mentor_id: string;
      mentor_role: string;
      is_primary: boolean;
      start_date: string;
      end_date: string | null;
      mentor_name: string | null;
      mentor_email: string | null;
    }[]
  >();

  for (const a of assignments ?? []) {
    const m = mentorById.get(a.mentor_id);
    const list = assignmentsByStudent.get(a.student_id) ?? [];
    list.push({
      id: a.id,
      mentor_id: a.mentor_id,
      mentor_role: a.mentor_role,
      is_primary: a.is_primary,
      start_date: a.start_date,
      end_date: a.end_date,
      mentor_name: m?.full_name ?? null,
      mentor_email: m?.email ?? null,
    });
    assignmentsByStudent.set(a.student_id, list);
  }

  let rows = (students ?? []).map((s) => {
    const mentorsForStudent = assignmentsByStudent.get(s.id) ?? [];
    // Sort primary first
    mentorsForStudent.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    const primary = mentorsForStudent.find((x) => x.is_primary) ?? null;
    const legacyMentor =
      !primary && s.assigned_mentor_id ? mentorById.get(s.assigned_mentor_id) : null;

    return {
      ...s,
      mentors: mentorsForStudent,
      primary_mentor: primary
        ? {
            id: primary.mentor_id,
            name: primary.mentor_name,
            email: primary.mentor_email,
            role: primary.mentor_role,
          }
        : legacyMentor
          ? {
              id: legacyMentor.id,
              name: legacyMentor.full_name,
              email: legacyMentor.email,
              role: "legacy_assigned_mentor",
            }
          : null,
      mentor_count: mentorsForStudent.length || (legacyMentor ? 1 : 0),
    };
  });

  if (mentorFilter === "with") {
    rows = rows.filter((r) => r.mentor_count > 0);
  } else if (mentorFilter === "without") {
    rows = rows.filter((r) => r.mentor_count === 0);
  }

  if (search) {
    rows = rows.filter((r) => {
      const hay = [
        r.full_name,
        r.email,
        r.registration_number,
        r.department,
        r.course,
        r.primary_mentor?.name,
        r.primary_mentor?.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(search);
    });
  }

  return NextResponse.json({
    students: rows,
    summary: {
      total: rows.length,
      withMentor: rows.filter((r) => r.mentor_count > 0).length,
      withoutMentor: rows.filter((r) => r.mentor_count === 0).length,
    },
  });
}
