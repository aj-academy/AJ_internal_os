import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, verifySessionRole } from "@/lib/security";
import { formatDateIST, formatTimeIST, todayDateIST } from "@/lib/datetime";
import type { UserRole } from "@/types/profile";
import {
  defaultHistoryRange,
  mapAttendanceDisplayStatus,
  parseYmd,
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
 * GET /api/mentor/student-attendance/export?format=xlsx|pdf&from&to&studentId&status&date
 * Scoped to active allotments. Never includes selfie URLs.
 */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "mentor:student-attendance:export", {
    limit: 20,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const gate = await verifySessionRole(MENTOR_ROLES);
  if (gate.response || !gate.user || !gate.profile) return gate.response!;

  const url = new URL(request.url);
  const format = (url.searchParams.get("format") || "xlsx").toLowerCase();
  if (format !== "xlsx" && format !== "pdf") {
    return NextResponse.json({ error: "format must be xlsx or pdf." }, { status: 400 });
  }

  const role = String(gate.profile.role || "").toLowerCase();
  const mentorId = role === "mentor" ? gate.user.id : gate.user.id;
  if (role === "mentor" && mentorId !== gate.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const mode = url.searchParams.get("mode") === "today" ? "today" : "history";
  const defaults = defaultHistoryRange();
  const date = parseYmd(url.searchParams.get("date")) || todayDateIST();
  const from = parseYmd(url.searchParams.get("from")) || (mode === "today" ? date : defaults.from);
  const to = parseYmd(url.searchParams.get("to")) || (mode === "today" ? date : defaults.to);
  const studentFilter = parseUuid(url.searchParams.get("studentId"));
  const statusFilter = (url.searchParams.get("status") || "").trim().toLowerCase();

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
      return NextResponse.json({ error: "Student is not in your active allotment." }, { status: 403 });
    }
    studentIds = [studentFilter];
  }
  if (!studentIds.length) {
    return NextResponse.json({ error: "No allotted students to export." }, { status: 404 });
  }

  const { data: profiles } = await admin
    .from("profiles")
    .select("id,full_name,registration_number,roll_number,department,course,section,status")
    .in("id", studentIds)
    .returns<ProfileRow[]>();
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  let rows: MentorStudentAttendanceRow[] = [];

  if (mode === "today") {
    const { data: attendance } = await admin
      .from("attendance_records")
      .select(
        "id,employee_id,attendance_date,check_in_time,check_out_time,check_in_latitude,check_in_longitude,check_in_address,check_in_accuracy_meters,status,total_working_minutes",
      )
      .in("employee_id", studentIds)
      .eq("attendance_date", date)
      .returns<AttendanceRow[]>();
    const attByStudent = new Map((attendance ?? []).map((a) => [a.employee_id, a]));
    for (const studentId of studentIds) {
      const profile = profileById.get(studentId);
      const att = attByStudent.get(studentId) ?? null;
      rows.push(toExportRow(studentId, profile, att, date));
    }
    rows.sort((a, b) => (a.studentName || "").localeCompare(b.studentName || ""));
  } else {
    let q = admin
      .from("attendance_records")
      .select(
        "id,employee_id,attendance_date,check_in_time,check_out_time,check_in_latitude,check_in_longitude,check_in_address,check_in_accuracy_meters,status,total_working_minutes",
      )
      .in("employee_id", studentIds)
      .gte("attendance_date", from)
      .lte("attendance_date", to)
      .order("attendance_date", { ascending: false })
      .limit(5000);
    if (statusFilter === "present") q = q.eq("status", "present");
    else if (statusFilter === "completed" || statusFilter === "checked out") q = q.eq("status", "completed");
    else if (statusFilter === "late") q = q.eq("status", "late");
    else if (statusFilter === "absent") q = q.eq("status", "absent");
    else if (statusFilter) q = q.ilike("status", `%${statusFilter}%`);

    const { data: attendance, error } = await q.returns<AttendanceRow[]>();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    rows = (attendance ?? []).map((att) =>
      toExportRow(att.employee_id, profileById.get(att.employee_id), att, att.attendance_date),
    );
  }

  if (!rows.length) {
    return NextResponse.json({ error: "No rows to export for the selected filters." }, { status: 404 });
  }

  const exportRows = rows.map((r) => ({
    Date: r.attendanceDate ? formatDateIST(r.attendanceDate) : "",
    Student: r.studentName || "",
    "Register No": r.registrationNumber || r.rollNumber || "",
    Department: r.department || "",
    Course: r.course || "",
    Batch: r.batch || "",
    Status: r.attendanceStatus,
    "Check In": r.checkInTime ? formatTimeIST(r.checkInTime) : "",
    "Check Out": r.checkOutTime ? formatTimeIST(r.checkOutTime) : "",
    Location: r.location || "",
    Latitude: r.latitude ?? "",
    Longitude: r.longitude ?? "",
    Accuracy: r.accuracyMeters != null ? `±${Math.round(r.accuracyMeters)} m` : "",
    Remarks: "",
  }));

  const mentorName = gate.profile.full_name || gate.user.email || "Mentor";
  const rangeLabel = mode === "today" ? date : `${from}_to_${to}`;

  if (format === "xlsx") {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Attendance");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const filename = `AJ_OS_Attendance_${rangeLabel}.xlsx`;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  pdf.setFontSize(14);
  pdf.text("AJ OS — Attendance Report", 24, 28);
  pdf.setFontSize(10);
  pdf.text(`Mentor: ${mentorName}`, 24, 46);
  pdf.text(`Range: ${mode === "today" ? date : `${from} → ${to}`}`, 24, 60);
  pdf.text(`Generated: ${formatDateIST(todayDateIST())}`, 24, 74);
  pdf.text(`Rows: ${exportRows.length}`, 24, 88);

  const present = rows.filter((r) =>
    ["Present", "Checked In", "Checked Out", "Late"].includes(r.attendanceStatus),
  ).length;
  const rate = rows.length ? Math.round((present / rows.length) * 1000) / 10 : 0;
  pdf.text(`Present-like: ${present} · Attendance %: ${rate}`, 24, 102);

  autoTable(pdf, {
    startY: 116,
    head: [["S.No", "Student", "Register", "Date", "Status", "In", "Out", "Location"]],
    body: rows.map((r, i) => [
      String(i + 1),
      r.studentName || "",
      r.registrationNumber || r.rollNumber || "",
      r.attendanceDate ? formatDateIST(r.attendanceDate) : "",
      r.attendanceStatus,
      r.checkInTime ? formatTimeIST(r.checkInTime) : "",
      r.checkOutTime ? formatTimeIST(r.checkOutTime) : "",
      (r.location || "").slice(0, 40),
    ]),
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [61, 52, 40] },
  });

  const pdfBuf = Buffer.from(pdf.output("arraybuffer"));
  const filename = `AJ_OS_Attendance_${rangeLabel}.pdf`;
  return new NextResponse(new Uint8Array(pdfBuf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function toExportRow(
  studentId: string,
  profile: ProfileRow | undefined,
  att: AttendanceRow | null,
  fallbackDate: string,
): MentorStudentAttendanceRow {
  return {
    studentId,
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
    attendanceId: att?.id ?? null,
    attendanceDate: att?.attendance_date ?? fallbackDate,
    attendanceStatus: mapAttendanceDisplayStatus(att),
    rawStatus: att?.status ?? null,
    checkInTime: att?.check_in_time ?? null,
    checkOutTime: att?.check_out_time ?? null,
    location: att?.check_in_address ?? null,
    latitude: att?.check_in_latitude ?? null,
    longitude: att?.check_in_longitude ?? null,
    accuracyMeters: att?.check_in_accuracy_meters ?? null,
    hasSelfie: false,
    totalWorkingMinutes: att?.total_working_minutes ?? null,
  };
}

function parseUuid(value: string | null): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)) {
    return null;
  }
  return v;
}
