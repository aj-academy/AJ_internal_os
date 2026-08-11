import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, verifySessionRole } from "@/lib/security";
import type { UserRole } from "@/types/profile";
import {
  ATTENDANCE_SELFIES_BUCKET,
  normalizeAttendanceSelfiePath,
} from "@/lib/attendance/selfieStorage";

export const runtime = "nodejs";

const ROLES = new Set<UserRole>([
  "student",
  "mentor",
  "employee",
  "freelancer",
  "admin",
  "super_admin",
]);

/**
 * GET /api/attendance/selfie?attendanceId=
 * Returns a short-lived signed URL after authorization.
 * Never persists signed URLs.
 */
export async function GET(request: Request) {
  const limited = enforceRateLimit(request, "attendance:selfie", {
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const gate = await verifySessionRole(ROLES);
  if (gate.response || !gate.user || !gate.profile) return gate.response!;

  const attendanceId = new URL(request.url).searchParams.get("attendanceId")?.trim() || "";
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      attendanceId,
    )
  ) {
    return NextResponse.json({ error: "attendanceId is required." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("attendance_records")
    .select("id,employee_id,check_in_selfie_url")
    .eq("id", attendanceId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Attendance record not found." }, { status: 404 });
  }

  const role = String(gate.profile.role || "").toLowerCase();
  const employeeId = String(row.employee_id);

  let allowed = false;
  if (role === "admin" || role === "super_admin") {
    allowed = true;
  } else if (employeeId === gate.user.id) {
    allowed = true;
  } else if (role === "mentor") {
    const { data: assign } = await admin
      .from("student_mentor_assignments")
      .select("id")
      .eq("mentor_id", gate.user.id)
      .eq("student_id", employeeId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    allowed = Boolean(assign?.id);
  }

  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const path = normalizeAttendanceSelfiePath(row.check_in_selfie_url as string | null);
  if (!path) {
    return NextResponse.json({ error: "No selfie on this attendance record." }, { status: 404 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from(ATTENDANCE_SELFIES_BUCKET)
    .createSignedUrl(path, 120);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: signError?.message || "Could not create signed URL." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    url: signed.signedUrl,
    expiresIn: 120,
    attendanceId,
  });
}
