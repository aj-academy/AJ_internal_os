import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionRole, enforceRateLimit } from "@/lib/security";
import type { UserRole } from "@/types/profile";
import {
  defaultHistoryRange,
  mapAttendanceDisplayStatus,
  parseYmd,
  selfiePathHint,
  type MentorStudentAttendanceRow,
} from "@/lib/attendance/mentorStudentAttendance";

export const runtime = "nodejs";

const MENTOR_ROLES = new Set<UserRole>(["mentor", "admin", "super_admin"]);

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

/**
 * GET /api/mentor/student-attendance/history
 * Query: from, to, studentId, status, page, pageSize
 * Only attendance for currently active allotted students.
 */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "mentor:student-attendance:history", {
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const gate = await verifySessionRole(MENTOR_ROLES);
  if (gate.response || !gate.user || !gate.profile) return gate.response!;

  const url = new URL(request.url);
  const defaults = defaultHistoryRange();
  const from = parseYmd(url.searchParams.get("from")) || defaults.from;
  const to = parseYmd(url.searchParams.get("to")) || defaults.to;
  if (from > to) {
    return NextResponse.json({ error: "`from` must be on or before `to`." }, { status: 400 });
  }

  const studentFilter = parseUuid(url.searchParams.get("studentId"));
  const statusFilter = (url.searchParams.get("status") || "").trim().toLowerCase();
  const page = Math.max(1, Number(url.searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 25) || 25));

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
    .select("student_id")
    .eq("mentor_id", mentorId)
    .eq("status", "active")
    .limit(2000);

  if (assignErr) {
    return NextResponse.json({ error: assignErr.message }, { status: 500 });
  }

  let studentIds = [...new Set((assignments ?? []).map((a) => a.student_id as string))];
  if (studentFilter) {
    if (!studentIds.includes(studentFilter)) {
      return NextResponse.json({
        from,
        to,
        page,
        pageSize,
        total: 0,
        totalPages: 0,
        rows: [] as MentorStudentAttendanceRow[],
      });
    }
    studentIds = [studentFilter];
  }

  if (!studentIds.length) {
    return NextResponse.json({
      from,
      to,
      page,
      pageSize,
      total: 0,
      totalPages: 0,
      rows: [] as MentorStudentAttendanceRow[],
    });
  }

  const selectWithAccuracy =
    "id,employee_id,attendance_date,check_in_time,check_out_time,check_in_latitude,check_in_longitude,check_in_address,check_in_accuracy_meters,check_in_selfie_url,status,total_working_minutes";
  const selectLegacy =
    "id,employee_id,attendance_date,check_in_time,check_out_time,check_in_latitude,check_in_longitude,check_in_address,check_in_selfie_url,status,total_working_minutes";

  let query = admin
    .from("attendance_records")
    .select(selectWithAccuracy, { count: "exact" })
    .in("employee_id", studentIds)
    .gte("attendance_date", from)
    .lte("attendance_date", to)
    .order("attendance_date", { ascending: false })
    .order("check_in_time", { ascending: false });

  if (statusFilter === "present") query = query.eq("status", "present");
  else if (statusFilter === "completed" || statusFilter === "checked out") {
    query = query.eq("status", "completed");
  } else if (statusFilter === "late") query = query.eq("status", "late");
  else if (statusFilter === "absent") query = query.eq("status", "absent");
  else if (statusFilter) query = query.ilike("status", `%${statusFilter}%`);

  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  let { data: attendance, error: attErr, count } = await query.returns<AttendanceRow[]>();

  if (attErr && /check_in_accuracy_meters|column/i.test(attErr.message)) {
    let retryQ = admin
      .from("attendance_records")
      .select(selectLegacy, { count: "exact" })
      .in("employee_id", studentIds)
      .gte("attendance_date", from)
      .lte("attendance_date", to)
      .order("attendance_date", { ascending: false })
      .order("check_in_time", { ascending: false });
    if (statusFilter === "present") retryQ = retryQ.eq("status", "present");
    else if (statusFilter === "completed" || statusFilter === "checked out") {
      retryQ = retryQ.eq("status", "completed");
    } else if (statusFilter === "late") retryQ = retryQ.eq("status", "late");
    else if (statusFilter === "absent") retryQ = retryQ.eq("status", "absent");
    else if (statusFilter) retryQ = retryQ.ilike("status", `%${statusFilter}%`);
    const retry = await retryQ
      .range((page - 1) * pageSize, page * pageSize - 1)
      .returns<AttendanceRow[]>();
    attendance = retry.data;
    attErr = retry.error;
    count = retry.count;
  }

  if (attErr) {
    return NextResponse.json({ error: attErr.message }, { status: 500 });
  }

  const rowsRaw = attendance ?? [];

  const profileIds = [...new Set(rowsRaw.map((r) => r.employee_id))];
  const { data: profiles } = profileIds.length
    ? await admin
        .from("profiles")
        .select("id,full_name,registration_number,roll_number,department,course,section,status")
        .in("id", profileIds)
        .returns<ProfileRow[]>()
    : { data: [] as ProfileRow[] };

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const rows: MentorStudentAttendanceRow[] = rowsRaw.map((att) => {
    const profile = profileById.get(att.employee_id);
    return {
      studentId: att.employee_id,
      studentName: profile?.full_name ?? null,
      registrationNumber: profile?.registration_number ?? null,
      rollNumber: profile?.roll_number ?? null,
      department: profile?.department ?? null,
      course: profile?.course ?? null,
      batch: profile?.department ?? null,
      section: profile?.section ?? null,
      studentStatus: profile?.status ?? null,
      mentorRole: null,
      isPrimary: false,
      attendanceId: att.id,
      attendanceDate: att.attendance_date,
      attendanceStatus: mapAttendanceDisplayStatus(att),
      rawStatus: att.status,
      checkInTime: att.check_in_time,
      checkOutTime: att.check_out_time,
      location: att.check_in_address,
      latitude: att.check_in_latitude,
      longitude: att.check_in_longitude,
      accuracyMeters: att.check_in_accuracy_meters ?? null,
      hasSelfie: selfiePathHint(att.check_in_selfie_url),
      totalWorkingMinutes: att.total_working_minutes,
    };
  });

  const total = typeof count === "number" ? count : rows.length;
  return NextResponse.json({
    from,
    to,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    rows,
  });
}

function parseUuid(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
    return null;
  }
  return v;
}
