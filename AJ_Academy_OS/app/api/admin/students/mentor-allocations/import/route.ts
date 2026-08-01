import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { writeAuditLog } from "@/lib/hr/auditLog";
import { parseMentorAllocFile } from "@/lib/students/mentorAllocImport";
import { createAssignment, type MentorRole } from "@/lib/students/mentorAssignments";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * POST multipart: file, dry_run=1|0, capacity_override=1|0, capacity_override_reason=
 */
export async function POST(request: Request) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required." }, { status: 400 });
  }

  const dryRun = String(form.get("dry_run") ?? "1") !== "0";
  const capacityOverride = String(form.get("capacity_override") ?? "") === "1";
  const capacityOverrideReason = String(form.get("capacity_override_reason") ?? "").trim() || null;

  const buffer = Buffer.from(await file.arrayBuffer());
  const parsed = parseMentorAllocFile(buffer, file.name);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.errors[0], errors: parsed.errors }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolve students + mentors
  const emails = Array.from(
    new Set(
      parsed.rows.flatMap((r) => [r.studentEmail, r.mentorEmail].filter(Boolean)),
    ),
  );
  const regs = Array.from(new Set(parsed.rows.map((r) => r.studentReg).filter(Boolean)));

  const [{ data: byEmail }, { data: byReg }, { data: mentors }] = await Promise.all([
    emails.length
      ? admin.from("profiles").select("id,email,role,status").in("email", emails)
      : Promise.resolve({ data: [] as { id: string; email: string | null; role: string | null; status: string | null }[] }),
    regs.length
      ? admin
          .from("profiles")
          .select("id,email,role,status,registration_number")
          .eq("role", "student")
          .in("registration_number", regs)
      : Promise.resolve({ data: [] as { id: string; email: string | null; registration_number: string | null }[] }),
    admin.from("profiles").select("id,email,role,status").eq("role", "mentor").limit(500),
  ]);

  const emailMap = new Map((byEmail ?? []).map((p) => [String(p.email || "").toLowerCase(), p]));
  const regMap = new Map(
    (byReg ?? []).map((p) => [String(p.registration_number || "").trim().toLowerCase(), p]),
  );
  const mentorByEmail = new Map(
    (mentors ?? []).map((m) => [String(m.email || "").toLowerCase(), m]),
  );

  const deptRows = await admin.from("academic_departments").select("id,name").limit(500);
  const courseRows = await admin.from("academic_courses").select("id,name,department_id").limit(1000);
  const batchRows = await admin.from("academic_batches").select("id,name,course_id").limit(1000);
  const deptByName = new Map((deptRows.data ?? []).map((d) => [d.name.trim().toLowerCase(), d.id]));
  const courseByKey = new Map(
    (courseRows.data ?? []).map((c) => [`${c.department_id}::${c.name.trim().toLowerCase()}`, c]),
  );
  const batchByKey = new Map(
    (batchRows.data ?? []).map((b) => [`${b.course_id}::${b.name.trim().toLowerCase()}`, b.id]),
  );

  const enriched = parsed.rows.map((r) => {
    const issues = [...r.issues];
    const student =
      (r.studentReg ? regMap.get(r.studentReg.trim().toLowerCase()) : undefined) ||
      (r.studentEmail ? emailMap.get(r.studentEmail) : undefined);
    const mentor = mentorByEmail.get(r.mentorEmail);

    const studentOk =
      !!student &&
      (("role" in student ? student.role : "student") === "student");
    if (!studentOk) issues.push("Student not found (portal student required).");
    if (!mentor || mentor.status === "inactive") issues.push("Mentor not found or inactive.");

    let department_id: string | null = null;
    let course_id: string | null = null;
    let batch_id: string | null = null;
    if (r.department) {
      department_id = deptByName.get(r.department.trim().toLowerCase()) ?? null;
      if (!department_id) issues.push("Department does not exist.");
    }
    if (r.course && department_id) {
      const c = courseByKey.get(`${department_id}::${r.course.trim().toLowerCase()}`);
      if (!c) issues.push("Course does not belong to department / missing.");
      else course_id = c.id;
    }
    if (r.batch && course_id) {
      batch_id = batchByKey.get(`${course_id}::${r.batch.trim().toLowerCase()}`) ?? null;
      if (!batch_id) issues.push("Batch does not belong to course / missing.");
    }

    return {
      ...r,
      studentId: student?.id ?? null,
      mentorId: mentor?.id ?? null,
      department_id,
      course_id,
      batch_id,
      severity: (issues.length ? "error" : r.severity) as "valid" | "warning" | "error",
      issues,
    };
  });

  const summary = {
    total: enriched.length,
    valid: enriched.filter((r) => r.severity === "valid").length,
    error: enriched.filter((r) => r.severity === "error").length,
  };

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      summary,
      rows: enriched.slice(0, 100),
      templateVersion: parsed.templateVersion,
    });
  }

  const created = [];
  const errors = [];
  for (const row of enriched) {
    if (row.severity === "error" || !row.studentId || !row.mentorId) {
      errors.push({ rowNumber: row.rowNumber, issues: row.issues });
      continue;
    }
    try {
      const assignment = await createAssignment(admin, {
        student_id: row.studentId,
        mentor_id: row.mentorId,
        mentor_role: row.mentorRole as MentorRole,
        is_primary: row.isPrimary,
        start_date: row.startDate,
        end_date: row.endDate,
        is_temporary: !!row.endDate,
        department_id: row.department_id,
        course_id: row.course_id,
        batch_id: row.batch_id,
        notes: row.notes || null,
        assigned_by: auth.user.id,
        reason: "Mentor allocation import",
        capacity_override: capacityOverride,
        capacity_override_reason: capacityOverrideReason,
      });
      created.push({ rowNumber: row.rowNumber, id: assignment.id });
    } catch (e) {
      errors.push({
        rowNumber: row.rowNumber,
        issues: [e instanceof Error ? e.message : "Assign failed"],
      });
    }
  }

  await writeAuditLog(admin, {
    actorId: auth.user.id,
    action: "student_mentor.import",
    module: "student_mentor",
    newData: { created: created.length, errors: errors.length, file: file.name },
  }).catch(() => undefined);

  return NextResponse.json({
    dryRun: false,
    summary: { ...summary, created: created.length, failed: errors.length },
    created,
    errors,
  });
}
