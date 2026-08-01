import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { writeAuditLog } from "@/lib/hr/auditLog";
import {
  MENTOR_ROLES,
  createAssignment,
  distributeStudents,
  getMentorWorkload,
  suggestMentors,
  transferAssignment,
  type DistributionStrategy,
  type MentorRole,
} from "@/lib/students/mentorAssignments";

export const runtime = "nodejs";

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
  const mentorId = url.searchParams.get("mentorId");
  const studentId = url.searchParams.get("studentId");
  const withoutMentor = url.searchParams.get("withoutMentor") === "1";
  const workload = url.searchParams.get("workload") === "1";

  if (workload) {
    const { data: mentors } = await admin
      .from("profiles")
      .select("id,full_name,email,department,status")
      .eq("role", "mentor")
      .limit(200);
    const rows = [];
    for (const m of mentors ?? []) {
      const w = await getMentorWorkload(admin, m.id);
      rows.push({ ...m, workload: w });
    }
    return NextResponse.json({ mentors: rows });
  }

  let query = admin
    .from("student_mentor_assignments")
    .select(
      "*, student:profiles!student_mentor_assignments_student_id_fkey(id,full_name,email,department), mentor:profiles!student_mentor_assignments_mentor_id_fkey(id,full_name,email,department)",
    )
    .order("assigned_at", { ascending: false })
    .limit(500);

  if (mentorId) query = query.eq("mentor_id", mentorId);
  if (studentId) query = query.eq("student_id", studentId);

  const { data, error } = await query;
  if (error) {
    // fallback without embed if FK names differ
    const plain = await admin
      .from("student_mentor_assignments")
      .select("*")
      .order("assigned_at", { ascending: false })
      .limit(500);
    if (plain.error) {
      return NextResponse.json(
        { error: plain.error.message, hint: "Run student_mentor_assignments.sql" },
        { status: 500 },
      );
    }
    return NextResponse.json({ assignments: plain.data ?? [] });
  }

  if (withoutMentor) {
    const { data: students } = await admin
      .from("profiles")
      .select("id,full_name,email,department,course,registration_number,assigned_mentor_id")
      .eq("role", "student")
      .eq("status", "active")
      .limit(2000);
    const assigned = new Set(
      (data ?? []).filter((a) => a.status === "active" && a.is_primary).map((a) => a.student_id),
    );
    const without = (students ?? []).filter((s) => !assigned.has(s.id) && !s.assigned_mentor_id);
    return NextResponse.json({ assignments: data ?? [], studentsWithoutMentor: without });
  }

  return NextResponse.json({ assignments: data ?? [], roles: MENTOR_ROLES });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;
  const admin = createAdminClient();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action : "assign";

  try {
    if (action === "suggest") {
      const { data: mentors } = await admin
        .from("profiles")
        .select("id,full_name,email,department,status")
        .eq("role", "mentor")
        .eq("status", "active")
        .limit(200);
      const scored = [];
      for (const m of mentors ?? []) {
        const w = await getMentorWorkload(admin, m.id);
        scored.push({
          id: m.id,
          department: m.department,
          total: w.total,
          max: w.caps.max_total_students,
          status: w.status,
        });
      }
      const suggestions = suggestMentors({
        mentors: scored,
        studentDepartmentName: typeof body.department === "string" ? body.department : null,
      });
      return NextResponse.json({ suggestions, mentors: mentors ?? [] });
    }

    if (action === "transfer") {
      const result = await transferAssignment(admin, {
        student_id: String(body.student_id || ""),
        from_mentor_id: String(body.from_mentor_id || ""),
        to_mentor_id: String(body.to_mentor_id || ""),
        mentor_role: body.mentor_role as MentorRole | undefined,
        transfer_date: typeof body.transfer_date === "string" ? body.transfer_date : undefined,
        reason: typeof body.reason === "string" ? body.reason : undefined,
        retain_readonly: !!body.retain_readonly,
        assigned_by: auth.user.id,
      });
      await notifyPair(admin, result.created.student_id, result.created.mentor_id, "Mentor transferred");
      await writeAuditLog(admin, {
        actorId: auth.user.id,
        action: "student_mentor.transfer",
        module: "student_mentor",
        targetId: result.created.id,
        newData: result,
      }).catch(() => undefined);
      return NextResponse.json({ result });
    }

    if (action === "bulk") {
      const studentIds = Array.isArray(body.student_ids) ? body.student_ids.map(String) : [];
      const mentorIds = Array.isArray(body.mentor_ids) ? body.mentor_ids.map(String) : [];
      const strategy = (body.strategy as DistributionStrategy) || "equal";
      const mentor_role = (body.mentor_role as MentorRole) || "primary_academic";
      const is_primary = body.is_primary !== false;
      const dryRun = body.dry_run !== false;
      const capacity_override = !!body.capacity_override;
      const capacity_override_reason =
        typeof body.capacity_override_reason === "string" ? body.capacity_override_reason : null;

      if (!studentIds.length || !mentorIds.length) {
        return NextResponse.json({ error: "student_ids and mentor_ids required." }, { status: 400 });
      }

      const distribution = distributeStudents(studentIds, mentorIds, strategy);
      if (dryRun) {
        const preview = [];
        for (const bucket of distribution) {
          const w = await getMentorWorkload(admin, bucket.mentorId);
          preview.push({
            mentorId: bucket.mentorId,
            studentCount: bucket.students.length,
            students: bucket.students,
            workload: w,
            capacityWarning: w.total + bucket.students.length > w.caps.max_total_students,
          });
        }
        return NextResponse.json({ preview, strategy, mentor_role, is_primary });
      }

      const created = [];
      const errors = [];
      for (const bucket of distribution) {
        for (const student_id of bucket.students) {
          try {
            const row = await createAssignment(admin, {
              student_id,
              mentor_id: bucket.mentorId,
              mentor_role,
              is_primary,
              assigned_by: auth.user.id,
              capacity_override,
              capacity_override_reason,
              reason: typeof body.reason === "string" ? body.reason : "Bulk allocation",
              start_date: typeof body.start_date === "string" ? body.start_date : undefined,
              end_date: typeof body.end_date === "string" ? body.end_date : null,
              is_temporary: !!body.is_temporary,
              department_id: typeof body.department_id === "string" ? body.department_id : null,
              course_id: typeof body.course_id === "string" ? body.course_id : null,
              batch_id: typeof body.batch_id === "string" ? body.batch_id : null,
            });
            created.push(row);
          } catch (e) {
            errors.push({ student_id, mentor_id: bucket.mentorId, error: e instanceof Error ? e.message : "failed" });
          }
        }
      }

      for (const mentorId of mentorIds) {
        try {
          await admin.from("in_app_notifications").insert({
            user_id: mentorId,
            type: "mentor_allocation",
            title: "Bulk student allocation",
            body: `${created.filter((c) => c.mentor_id === mentorId).length} students allocated to you.`,
            link_path: "/mentor/students",
          });
        } catch {
          /* optional */
        }
      }

      await writeAuditLog(admin, {
        actorId: auth.user.id,
        action: "student_mentor.bulk",
        module: "student_mentor",
        newData: { created: created.length, errors: errors.length, strategy },
      }).catch(() => undefined);

      return NextResponse.json({ created: created.length, errors, assignments: created });
    }

    // single assign
    const student_id = String(body.student_id || "");
    const mentor_id = String(body.mentor_id || "");
    const mentor_role = (body.mentor_role as MentorRole) || "primary_academic";
    if (!student_id || !mentor_id) {
      return NextResponse.json({ error: "student_id and mentor_id required." }, { status: 400 });
    }

    const row = await createAssignment(admin, {
      student_id,
      mentor_id,
      mentor_role,
      is_primary: body.is_primary !== false && (mentor_role === "primary_academic" || !!body.is_primary),
      department_id: typeof body.department_id === "string" ? body.department_id : null,
      course_id: typeof body.course_id === "string" ? body.course_id : null,
      batch_id: typeof body.batch_id === "string" ? body.batch_id : null,
      start_date: typeof body.start_date === "string" ? body.start_date : undefined,
      end_date: typeof body.end_date === "string" ? body.end_date : null,
      is_temporary: !!body.is_temporary,
      reason: typeof body.reason === "string" ? body.reason : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      assigned_by: auth.user.id,
      capacity_override: !!body.capacity_override,
      capacity_override_reason:
        typeof body.capacity_override_reason === "string" ? body.capacity_override_reason : null,
    });

    await notifyPair(admin, student_id, mentor_id, "Mentor assigned");
    await writeAuditLog(admin, {
      actorId: auth.user.id,
      action: "student_mentor.assign",
      module: "student_mentor",
      targetId: row.id,
      newData: row,
    }).catch(() => undefined);

    return NextResponse.json({ assignment: row });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Assignment failed.", hint: "Run student_mentor_assignments.sql" },
      { status: 400 },
    );
  }
}

async function notifyPair(admin: ReturnType<typeof createAdminClient>, studentId: string, mentorId: string, title: string) {
  try {
    await admin.from("in_app_notifications").insert([
      {
        user_id: studentId,
        type: "mentor_allocation",
        title,
        body: "Your mentor assignment was updated.",
        link_path: "/student/dashboard",
      },
      {
        user_id: mentorId,
        type: "mentor_allocation",
        title,
        body: "A student was allocated to you.",
        link_path: "/mentor/students",
      },
    ]);
  } catch {
    /* optional */
  }
}
