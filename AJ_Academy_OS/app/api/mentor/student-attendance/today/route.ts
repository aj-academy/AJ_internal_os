import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionRole, enforceRateLimit } from "@/lib/security";
import { todayDateIST } from "@/lib/datetime";
import type { UserRole } from "@/types/profile";
import {
  mapAttendanceDisplayStatus,
  parseYmd,
  selfiePathHint,
  type MentorStudentAttendanceRow,
} from "@/lib/attendance/mentorStudentAttendance";

export const runtime = "nodejs";

const MENTOR_ROLES = new Set<UserRole>(["mentor", "admin", "super_admin"]);

type AssignmentRow = {
  student_id: string;
  mentor_role: string | null;
  is_primary: boolean | null;
  status: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  registration_number: string | null;
  roll_number: string | null;
  department: string | null;
  course: string | null;
  section: string | null;
  status: string | null;
};

type AttendanceRow = {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_in_address: string | null;
  check_in_accuracy_meters: number | null;
  check_in_selfie_url: string | null;
  status: string | null;
  total_working_minutes: number | null;
};

/**
 * GET /api/mentor/student-attendance/today?date=YYYY-MM-DD
 * Roster = active student_mentor_assignments LEFT JOIN attendance for IST date.
 * mentor_id always from session — never from query.
 */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "mentor:student-attendance:today", {
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const gate = await verifySessionRole(MENTOR_ROLES);
  if (gate.response || !gate.user || !gate.profile) return gate.response!;

  const url = new URL(request.url);
  const dateParam = parseYmd(url.searchParams.get("date"));
  const attendanceDate = dateParam || todayDateIST();

  // Mentors only see their own allotments; admins may pass mentorId for support.
  const role = String(gate.profile.role || "").toLowerCase();
  const mentorId =
    role === "mentor"
      ? gate.user.id
      : parseUuid(url.searchParams.get("mentorId")) || gate.user.id;

  if (role === "mentor" && mentorId !== gate.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  try {
    await admin.rpc("expire_student_mentor_assignments");
  } catch {
    /* optional */
  }

  const { data: assignments, error: assignErr } = await admin
    .from("student_mentor_assignments")
    .select("student_id,mentor_role,is_primary,status")
    .eq("mentor_id", mentorId)
    .eq("status", "active")
    .order("assigned_at", { ascending: false })
    .limit(2000)
    .returns<AssignmentRow[]>();

  if (assignErr) {
    return NextResponse.json({ error: assignErr.message }, { status: 500 });
  }

  const uniqueStudentIds = [...new Set((assignments ?? []).map((a) => a.student_id))];
  if (!uniqueStudentIds.length) {
    return NextResponse.json({
      date: attendanceDate,
      timezone: "Asia/Kolkata",
      mentorId,
      summary: emptySummary(),
      students: [] as MentorStudentAttendanceRow[],
    });
  }

  // Prefer primary assignment row when duplicates
  const assignmentByStudent = new Map<string, AssignmentRow>();
  for (const a of assignments ?? []) {
    const prev = assignmentByStudent.get(a.student_id);
    if (!prev || (a.is_primary && !prev.is_primary)) {
      assignmentByStudent.set(a.student_id, a);
    }
  }

  const [{ data: profiles, error: profileErr }, { data: attendance, error: attErr }] =
    await Promise.all([
      admin
        .from("profiles")
        .select("id,full_name,registration_number,roll_number,department,course,section,status")
        .in("id", uniqueStudentIds)
        .returns<ProfileRow[]>(),
      admin
        .from("attendance_records")
        .select(
          "id,employee_id,attendance_date,check_in_time,check_out_time,check_in_latitude,check_in_longitude,check_in_address,check_in_accuracy_meters,check_in_selfie_url,status,total_working_minutes",
        )
        .in("employee_id", uniqueStudentIds)
        .eq("attendance_date", attendanceDate)
        .returns<AttendanceRow[]>(),
    ]);

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  let attendanceRows = attendance ?? [];
  if (attErr && /check_in_accuracy_meters|column/i.test(attErr.message)) {
    const retry = await admin
      .from("attendance_records")
      .select(
        "id,employee_id,attendance_date,check_in_time,check_out_time,check_in_latitude,check_in_longitude,check_in_address,check_in_selfie_url,status,total_working_minutes",
      )
      .in("employee_id", uniqueStudentIds)
      .eq("attendance_date", attendanceDate)
      .returns<AttendanceRow[]>();
    if (retry.error) {
      return NextResponse.json({ error: retry.error.message }, { status: 500 });
    }
    attendanceRows = retry.data ?? [];
  } else if (attErr) {
    return NextResponse.json({ error: attErr.message }, { status: 500 });
  }

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const attendanceByStudent = new Map<string, AttendanceRow>();
  for (const row of attendanceRows) {
    if (!attendanceByStudent.has(row.employee_id)) {
      attendanceByStudent.set(row.employee_id, row);
    }
  }

  const students: MentorStudentAttendanceRow[] = [];
  for (const studentId of uniqueStudentIds) {
    const assignment = assignmentByStudent.get(studentId)!;
    const profile = profileById.get(studentId);
    const att = attendanceByStudent.get(studentId) ?? null;
    students.push({
      studentId,
      studentName: profile?.full_name ?? null,
      registrationNumber: profile?.registration_number ?? null,
      rollNumber: profile?.roll_number ?? null,
      department: profile?.department ?? null,
      course: profile?.course ?? null,
      batch: profile?.department ?? null,
      section: profile?.section ?? null,
      studentStatus: profile?.status ?? null,
      mentorRole: assignment.mentor_role,
      isPrimary: Boolean(assignment.is_primary),
      attendanceId: att?.id ?? null,
      attendanceDate: att?.attendance_date ?? attendanceDate,
      attendanceStatus: mapAttendanceDisplayStatus(att),
      rawStatus: att?.status ?? null,
      checkInTime: att?.check_in_time ?? null,
      checkOutTime: att?.check_out_time ?? null,
      location: att?.check_in_address ?? null,
      latitude: att?.check_in_latitude ?? null,
      longitude: att?.check_in_longitude ?? null,
      accuracyMeters: att?.check_in_accuracy_meters ?? null,
      hasSelfie: selfiePathHint(att?.check_in_selfie_url),
      totalWorkingMinutes: att?.total_working_minutes ?? null,
    });
  }

  students.sort((a, b) => (a.studentName || "").localeCompare(b.studentName || ""));

  return NextResponse.json({
    date: attendanceDate,
    timezone: "Asia/Kolkata",
    mentorId,
    summary: buildSummary(students),
    students,
  });
}

function emptySummary() {
  return {
    totalStudents: 0,
    present: 0,
    checkedIn: 0,
    checkedOut: 0,
    late: 0,
    absent: 0,
    notYetCheckedIn: 0,
    onLeave: 0,
    attendanceRate: 0,
  };
}

function buildSummary(students: MentorStudentAttendanceRow[]) {
  const summary = emptySummary();
  summary.totalStudents = students.length;
  for (const s of students) {
    switch (s.attendanceStatus) {
      case "Present":
        summary.present += 1;
        break;
      case "Checked In":
        summary.checkedIn += 1;
        break;
      case "Checked Out":
        summary.checkedOut += 1;
        break;
      case "Late":
        summary.late += 1;
        break;
      case "Absent":
        summary.absent += 1;
        break;
      case "On Leave":
        summary.onLeave += 1;
        break;
      default:
        summary.notYetCheckedIn += 1;
        break;
    }
  }
  const attended = summary.present + summary.checkedIn + summary.checkedOut + summary.late;
  summary.attendanceRate =
    summary.totalStudents > 0 ? Math.round((attended / summary.totalStudents) * 1000) / 10 : 0;
  return summary;
}

function parseUuid(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
    return null;
  }
  return v;
}
