import { todayDateIST } from "@/lib/datetime";
import { hasAttendanceSelfie } from "@/lib/attendance/selfieStorage";

export type MentorAttendanceDisplayStatus =
  | "Present"
  | "Checked Out"
  | "Checked In"
  | "Late"
  | "Absent"
  | "Not Yet Checked In"
  | "On Leave"
  | string;

export type MentorStudentAttendanceRow = {
  studentId: string;
  studentName: string | null;
  registrationNumber: string | null;
  rollNumber: string | null;
  department: string | null;
  course: string | null;
  batch: string | null;
  section: string | null;
  studentStatus: string | null;
  mentorRole: string | null;
  isPrimary: boolean;
  attendanceId: string | null;
  attendanceDate: string | null;
  attendanceStatus: MentorAttendanceDisplayStatus;
  rawStatus: string | null;
  checkInTime: string | null;
  checkOutTime: string | null;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  hasSelfie: boolean;
  totalWorkingMinutes: number | null;
};

export function mapAttendanceDisplayStatus(row: {
  check_in_time: string | null;
  check_out_time: string | null;
  status: string | null;
} | null): MentorAttendanceDisplayStatus {
  if (!row) return "Not Yet Checked In";
  const raw = (row.status || "").toLowerCase();
  if (raw === "late") return "Late";
  if (raw === "absent") return "Absent";
  if (raw === "on leave" || raw === "leave") return "On Leave";
  if (row.check_in_time && row.check_out_time) return "Checked Out";
  if (row.check_in_time) {
    if (raw === "completed") return "Checked Out";
    if (raw === "present") return "Present";
    return "Checked In";
  }
  return "Not Yet Checked In";
}

export function parseYmd(value: string | null | undefined): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

export function defaultHistoryRange(): { from: string; to: string } {
  const to = todayDateIST();
  const d = new Date(`${to}T12:00:00+05:30`);
  d.setDate(d.getDate() - 29);
  const from = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
  return { from, to };
}

export function selfiePathHint(selfieUrl: string | null | undefined): boolean {
  return hasAttendanceSelfie(selfieUrl);
}
