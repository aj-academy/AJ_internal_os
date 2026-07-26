import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";
import { deriveAttendanceForDay, type AttendanceRecordInput } from "@/lib/hr/attendanceStatus";
import { resolveAttendancePolicyForDate } from "@/lib/hr/attendancePolicy";

export const dynamic = "force-dynamic";

type AttendanceRow = {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  total_working_minutes: number | null;
  status: string | null;
  location_type: string | null;
};

function isoDateOnly(value: string | null): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function computeWorkingMinutes(checkIn: string | null, checkOut: string | null): number | null {
  if (!checkIn || !checkOut) return null;
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  if (!Number.isFinite(diff) || diff <= 0) return null;
  return Math.ceil(diff / 60000);
}

// GET /api/hr/attendance/review?from=YYYY-MM-DD&to=YYYY-MM-DD&employeeId=&includeAll=0
export async function GET(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response) return response;

  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const from = url.searchParams.get("from") || monthAgo;
  const to = url.searchParams.get("to") || today;
  const employeeId = url.searchParams.get("employeeId");
  const includeAll = url.searchParams.get("includeAll") === "1";

  const admin = createAdminClient();

  let recordsQuery = admin
    .from("attendance_records")
    .select(
      "id, employee_id, attendance_date, check_in_time, check_out_time, total_working_minutes, status, location_type",
    )
    .gte("attendance_date", from)
    .lte("attendance_date", to)
    .order("attendance_date", { ascending: false });

  if (employeeId) recordsQuery = recordsQuery.eq("employee_id", employeeId);

  const [{ data: records, error: recErr }, { data: employees, error: empErr }, { data: corrections, error: corrErr }, resolvedPolicy] =
    await Promise.all([
      recordsQuery,
      admin
        .from("profiles")
        .select("id, full_name, email, department, designation")
        .eq("role", "employee")
        .eq("status", "active")
        .order("full_name", { ascending: true }),
      admin
        .from("attendance_corrections")
        .select(
          "id, attendance_id, employee_id, attendance_date, original_data, revised_data, reason, status, reviewed_by, reviewed_at, review_remarks, created_at",
        )
        .in("status", ["pending"])
        .order("created_at", { ascending: false }),
      resolveAttendancePolicyForDate(admin, to),
    ]);

  if (recErr) return NextResponse.json({ error: recErr.message }, { status: 500 });
  if (empErr) return NextResponse.json({ error: empErr.message }, { status: 500 });
  if (corrErr) return NextResponse.json({ error: corrErr.message }, { status: 500 });

  // Holiday calendar (Phase 3) — tolerate missing table before migration.
  const holidaySet = new Set<string>();
  {
    const { data: holidayRows } = await admin
      .from("holidays")
      .select("holiday_date")
      .gte("holiday_date", from)
      .lte("holiday_date", to);
    for (const h of holidayRows ?? []) holidaySet.add(h.holiday_date as string);
  }

  const employeeMap = new Map((employees ?? []).map((e) => [e.id, e]));
  // Cache policies by date so historical ranges stay reproducible when versions change.
  const policyByDate = new Map<string, typeof resolvedPolicy.policy>();
  policyByDate.set(to, resolvedPolicy.policy);

  const issues = [];
  for (const r of (records ?? []) as AttendanceRow[]) {
    let policy = policyByDate.get(r.attendance_date);
    if (!policy) {
      const resolved = await resolveAttendancePolicyForDate(admin, r.attendance_date);
      policy = resolved.policy;
      policyByDate.set(r.attendance_date, policy);
    }
    const derived = deriveAttendanceForDay(
      r as AttendanceRecordInput,
      { isHoliday: holidaySet.has(r.attendance_date) },
      policy,
    );
    const emp = employeeMap.get(r.employee_id);
    issues.push({
      id: r.id,
      employeeId: r.employee_id,
      employeeName: emp?.full_name ?? null,
      department: emp?.department ?? null,
      attendanceDate: r.attendance_date,
      checkInTime: r.check_in_time,
      checkOutTime: r.check_out_time,
      totalWorkingMinutes: r.total_working_minutes,
      rawStatus: r.status,
      derivedStatus: derived.status,
      flags: derived.flags,
      needsReview: derived.needsReview,
      policyId: derived.policyId,
    });
  }

  const filtered = issues.filter((row) => (includeAll ? true : row.needsReview || row.flags.length > 0));

  return NextResponse.json({
    from,
    to,
    reviewer: { id: profile?.id ?? null, name: profile?.full_name ?? null },
    policyNote:
      resolvedPolicy.source === "db"
        ? `Derived using effective-dated policy "${resolvedPolicy.policy.name}" (id ${resolvedPolicy.policy.id}). Each day uses the policy effective on that date.`
        : "No attendance_policies row found — using built-in default. Run hr_payroll_02_attendance_policies.sql and configure Payroll Settings.",
    policySource: resolvedPolicy.source,
    activePolicy: resolvedPolicy.policy,
    issues: filtered,
    pendingCorrections: corrections ?? [],
    employees: employees ?? [],
  });
}

// POST /api/hr/attendance/review  — raise a correction (status: pending)
export async function POST(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response) return response;

  let body: {
    attendanceId?: string | null;
    employeeId?: string;
    attendanceDate?: string;
    revised?: { check_in_time?: string | null; check_out_time?: string | null; status?: string | null };
    reason?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const employeeId = body.employeeId?.trim();
  const attendanceDate = isoDateOnly(body.attendanceDate ?? null);
  const reason = body.reason?.trim();
  const revised = body.revised ?? {};

  if (!employeeId || !attendanceDate) {
    return NextResponse.json({ error: "employeeId and attendanceDate are required" }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "A correction reason is required" }, { status: 400 });
  }
  if (revised.check_in_time == null && revised.check_out_time == null && revised.status == null) {
    return NextResponse.json({ error: "Provide at least one revised value" }, { status: 400 });
  }

  const admin = createAdminClient();

  let originalData: Record<string, unknown> = {};
  let attendanceId = body.attendanceId ?? null;

  if (attendanceId) {
    const { data: existing } = await admin
      .from("attendance_records")
      .select("id, check_in_time, check_out_time, total_working_minutes, status, location_type")
      .eq("id", attendanceId)
      .maybeSingle();
    if (existing) originalData = existing;
  } else {
    const { data: existing } = await admin
      .from("attendance_records")
      .select("id, check_in_time, check_out_time, total_working_minutes, status, location_type")
      .eq("employee_id", employeeId)
      .eq("attendance_date", attendanceDate)
      .maybeSingle();
    if (existing) {
      originalData = existing;
      attendanceId = existing.id;
    }
  }

  const { data: inserted, error } = await admin
    .from("attendance_corrections")
    .insert({
      attendance_id: attendanceId,
      employee_id: employeeId,
      attendance_date: attendanceDate,
      original_data: originalData,
      revised_data: revised,
      reason,
      status: "pending",
      requested_by: profile?.id ?? null,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(admin, {
    actorId: profile?.id ?? null,
    action: "attendance_correction_requested",
    targetTable: "attendance_corrections",
    targetId: inserted.id,
    oldData: originalData,
    newData: { revised, reason, employeeId, attendanceDate },
  });

  return NextResponse.json({ ok: true, id: inserted.id });
}

// PATCH /api/hr/attendance/review — approve or reject a correction
export async function PATCH(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response) return response;

  let body: { correctionId?: string; action?: "approve" | "reject"; remarks?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const correctionId = body.correctionId?.trim();
  const action = body.action;
  if (!correctionId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "correctionId and a valid action are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: correction, error: loadErr } = await admin
    .from("attendance_corrections")
    .select("*")
    .eq("id", correctionId)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!correction) return NextResponse.json({ error: "Correction not found" }, { status: 404 });
  if (correction.status !== "pending") {
    return NextResponse.json({ error: `Correction already ${correction.status}` }, { status: 409 });
  }

  const nowIso = new Date().toISOString();

  if (action === "reject") {
    const { error } = await admin
      .from("attendance_corrections")
      .update({
        status: "rejected",
        reviewed_by: profile?.id ?? null,
        reviewed_at: nowIso,
        review_remarks: body.remarks?.trim() ?? null,
      })
      .eq("id", correctionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(admin, {
      actorId: profile?.id ?? null,
      action: "attendance_correction_rejected",
      targetTable: "attendance_corrections",
      targetId: correctionId,
      oldData: correction.original_data,
      newData: { remarks: body.remarks ?? null },
    });
    return NextResponse.json({ ok: true });
  }

  // approve → apply revised values to attendance_records
  const revised = (correction.revised_data ?? {}) as {
    check_in_time?: string | null;
    check_out_time?: string | null;
    status?: string | null;
  };

  const patch: Record<string, unknown> = { updated_at: nowIso };
  if (revised.check_in_time !== undefined) patch.check_in_time = revised.check_in_time;
  if (revised.check_out_time !== undefined) patch.check_out_time = revised.check_out_time;
  if (revised.status !== undefined && revised.status !== null) patch.status = revised.status;

  const mergedCheckIn =
    revised.check_in_time !== undefined
      ? revised.check_in_time
      : (correction.original_data?.check_in_time ?? null);
  const mergedCheckOut =
    revised.check_out_time !== undefined
      ? revised.check_out_time
      : (correction.original_data?.check_out_time ?? null);
  const recomputed = computeWorkingMinutes(mergedCheckIn, mergedCheckOut);
  if (recomputed != null) patch.total_working_minutes = recomputed;

  let appliedAttendanceId = correction.attendance_id as string | null;

  if (appliedAttendanceId) {
    const { error } = await admin.from("attendance_records").update(patch).eq("id", appliedAttendanceId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: created, error } = await admin
      .from("attendance_records")
      .insert({
        employee_id: correction.employee_id,
        attendance_date: correction.attendance_date,
        check_in_time: mergedCheckIn,
        check_out_time: mergedCheckOut,
        total_working_minutes: recomputed,
        status: revised.status ?? "present",
        location_type: "Correction",
      })
      .select("id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    appliedAttendanceId = created.id;
  }

  const { error: updErr } = await admin
    .from("attendance_corrections")
    .update({
      status: "approved",
      attendance_id: appliedAttendanceId,
      reviewed_by: profile?.id ?? null,
      reviewed_at: nowIso,
      review_remarks: body.remarks?.trim() ?? null,
    })
    .eq("id", correctionId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  await writeAuditLog(admin, {
    actorId: profile?.id ?? null,
    action: "attendance_correction_approved",
    targetTable: "attendance_records",
    targetId: appliedAttendanceId,
    oldData: correction.original_data,
    newData: patch,
  });

  return NextResponse.json({ ok: true, attendanceId: appliedAttendanceId });
}
