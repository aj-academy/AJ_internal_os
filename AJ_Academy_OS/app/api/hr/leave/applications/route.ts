import { NextResponse } from "next/server";
import { requireStaffApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";
import {
  consumeLeaveBalance,
  countChargeableLeaveDays,
  loadLeaveBalances,
  restoreLeaveBalance,
  type LeaveTypeRow,
} from "@/lib/hr/leave";

export const dynamic = "force-dynamic";

function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/hr/leave/applications?status=&employeeId=&year=
// Admin: all applications (filterable). Employee: own applications only.
export async function GET(request: Request) {
  const { response, profile } = await requireStaffApiSession();
  if (response || !profile) return response!;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const employeeIdParam = url.searchParams.get("employeeId");
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();

  const admin = createAdminClient();
  const isAdmin = isAdminRole(profile.role);
  const targetEmployeeId = isAdmin ? employeeIdParam : profile.id;

  let query = admin
    .from("leave_applications")
    .select("*, leave_types(code, name, is_paid, counts_as_presence)")
    .gte("start_date", `${year}-01-01`)
    .lte("start_date", `${year}-12-31`)
    .order("applied_at", { ascending: false });

  if (targetEmployeeId) query = query.eq("employee_id", targetEmployeeId);
  if (status) query = query.eq("status", status);

  const { data: applications, error } = await query;
  if (error) {
    if (/does not exist/i.test(error.message)) {
      return NextResponse.json({
        applications: [],
        balances: [],
        employees: [],
        migrationRequired: "hr_payroll_04_leave_management.sql",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Balances: employee → own; admin → for the filtered employee (if one is selected)
  let balances: Awaited<ReturnType<typeof loadLeaveBalances>> = [];
  const balanceEmployee = isAdmin ? employeeIdParam : profile.id;
  if (balanceEmployee) {
    try {
      balances = await loadLeaveBalances(admin, balanceEmployee, year);
    } catch {
      balances = [];
    }
  }

  let employees: { id: string; full_name: string | null; email: string | null }[] = [];
  if (isAdmin) {
    const { data: emps } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "employee")
      .eq("status", "active")
      .order("full_name");
    employees = emps ?? [];
  }

  return NextResponse.json({ year, applications: applications ?? [], balances, employees });
}

// POST /api/hr/leave/applications — employee (or admin on behalf) applies for leave
export async function POST(request: Request) {
  const { response, profile } = await requireStaffApiSession();
  if (response || !profile) return response!;

  let body: {
    employeeId?: string;
    leaveTypeId?: string;
    startDate?: string;
    endDate?: string;
    isHalfDay?: boolean;
    halfDaySession?: "first_half" | "second_half";
    reason?: string;
    contactInfo?: string;
    attachmentUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const isAdmin = isAdminRole(profile.role);
  const employeeId = isAdmin && body.employeeId ? body.employeeId : profile.id;
  const leaveTypeId = body.leaveTypeId?.trim();
  const startDate = body.startDate?.trim();
  const endDate = (body.endDate ?? body.startDate)?.trim();
  const isHalfDay = !!body.isHalfDay;
  const reason = body.reason?.trim();

  if (!leaveTypeId) return NextResponse.json({ error: "Select a leave type." }, { status: 400 });
  if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return NextResponse.json({ error: "Valid start and end dates are required." }, { status: 400 });
  }
  if (endDate < startDate) {
    return NextResponse.json({ error: "End date cannot be before start date." }, { status: 400 });
  }
  if (isHalfDay && startDate !== endDate) {
    return NextResponse.json({ error: "Half-day leave must be a single date." }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: "A reason is required." }, { status: 400 });

  const admin = createAdminClient();

  const { data: leaveType, error: typeErr } = await admin
    .from("leave_types")
    .select("*")
    .eq("id", leaveTypeId)
    .maybeSingle();
  if (typeErr) return NextResponse.json({ error: typeErr.message }, { status: 500 });
  if (!leaveType || !leaveType.is_active) {
    return NextResponse.json({ error: "Leave type not found or inactive." }, { status: 400 });
  }
  const lt = leaveType as LeaveTypeRow;

  if (isHalfDay && !lt.allows_half_day) {
    return NextResponse.json({ error: `${lt.name} does not allow half-day requests.` }, { status: 400 });
  }
  if (lt.requires_document && !body.attachmentUrl?.trim()) {
    return NextResponse.json(
      { error: `${lt.name} requires a supporting document. Attach a document link/file.` },
      { status: 400 },
    );
  }

  // Minimum notice (admins applying on behalf may bypass, e.g. backdated sick leave)
  if (!isAdmin && lt.min_notice_days > 0) {
    const noticeMs = new Date(`${startDate}T00:00:00`).getTime() - new Date(`${todayIso()}T00:00:00`).getTime();
    const noticeDays = Math.floor(noticeMs / (24 * 60 * 60 * 1000));
    if (noticeDays < lt.min_notice_days) {
      return NextResponse.json(
        { error: `${lt.name} requires at least ${lt.min_notice_days} day(s) notice.` },
        { status: 400 },
      );
    }
  }

  const { totalDays, skipped } = await countChargeableLeaveDays(admin, startDate, endDate, isHalfDay);
  if (totalDays <= 0) {
    return NextResponse.json(
      {
        error:
          "The selected range contains no chargeable working days (all weekly offs/holidays). Nothing to apply for.",
        skipped,
      },
      { status: 400 },
    );
  }

  // Balance check for paid, balance-burning types
  if (lt.is_paid && !lt.counts_as_presence && !lt.allow_negative_balance) {
    const year = Number(startDate.slice(0, 4));
    const balances = await loadLeaveBalances(admin, employeeId, year);
    const bal = balances.find((b) => b.leaveTypeId === lt.id);
    const available = bal?.available ?? 0;
    if (available < totalDays) {
      return NextResponse.json(
        {
          error: `Insufficient ${lt.name} balance: available ${available}, requested ${totalDays}. ${
            bal?.entitlementConfigured
              ? ""
              : "Note: the annual entitlement for this type has not been configured by HR yet."
          }`.trim(),
        },
        { status: 400 },
      );
    }
  }

  const { data: created, error } = await admin
    .from("leave_applications")
    .insert({
      employee_id: employeeId,
      leave_type_id: lt.id,
      start_date: startDate,
      end_date: endDate,
      is_half_day: isHalfDay,
      half_day_session: isHalfDay ? (body.halfDaySession ?? "first_half") : null,
      total_days: totalDays,
      reason,
      contact_info: body.contactInfo?.trim() || null,
      attachment_url: body.attachmentUrl?.trim() || null,
      status: "pending",
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "An overlapping pending/approved leave already exists for these dates." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(admin, {
    actorId: profile.id,
    action: "leave_applied",
    targetTable: "leave_applications",
    targetId: created.id,
    newData: { employeeId, leaveType: lt.code, startDate, endDate, totalDays, skipped },
  });

  const { data: empProfile } = await admin.from("profiles").select("full_name").eq("id", employeeId).maybeSingle();
  void import("@/lib/hr/payrollNotifications").then(({ notifyLeaveSubmittedToAdmins }) =>
    notifyLeaveSubmittedToAdmins({
      admin,
      applicationId: created.id,
      employeeName: empProfile?.full_name,
    }),
  );

  return NextResponse.json({ ok: true, application: created, totalDays, skipped });
}

// PATCH /api/hr/leave/applications — approve / reject (admin) or cancel (owner, pending only)
export async function PATCH(request: Request) {
  const { response, profile } = await requireStaffApiSession();
  if (response || !profile) return response!;

  let body: { id?: string; action?: "approve" | "reject" | "cancel"; remarks?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id?.trim();
  const action = body.action;
  if (!id || !action || !["approve", "reject", "cancel"].includes(action)) {
    return NextResponse.json({ error: "id and a valid action are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const isAdmin = isAdminRole(profile.role);

  const { data: application, error: loadErr } = await admin
    .from("leave_applications")
    .select("*, leave_types(*)")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const lt = application.leave_types as LeaveTypeRow;
  const nowIso = new Date().toISOString();
  const year = Number(String(application.start_date).slice(0, 4));

  if (action === "cancel") {
    const ownRequest = application.employee_id === profile.id;
    if (!ownRequest && !isAdmin) {
      return NextResponse.json({ error: "You can only cancel your own request." }, { status: 403 });
    }
    if (application.status !== "pending" && !isAdmin) {
      return NextResponse.json({ error: "Only pending requests can be cancelled." }, { status: 409 });
    }
    const wasApproved = application.status === "approved";
    const { error } = await admin
      .from("leave_applications")
      .update({
        status: "cancelled",
        reviewed_by: isAdmin ? profile.id : application.reviewed_by,
        reviewed_at: nowIso,
        review_remarks: body.remarks?.trim() || application.review_remarks,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (wasApproved) {
      await restoreLeaveBalance(admin, application.employee_id, lt, year, Number(application.total_days), profile.id);
    }

    await writeAuditLog(admin, {
      actorId: profile.id,
      action: "leave_cancelled",
      targetTable: "leave_applications",
      targetId: id,
      oldData: { status: application.status },
      newData: { status: "cancelled", restoredBalance: wasApproved },
    });
    return NextResponse.json({ ok: true });
  }

  // approve / reject require admin
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (application.status !== "pending") {
    return NextResponse.json({ error: `Application already ${application.status}` }, { status: 409 });
  }

  if (action === "reject") {
    const { error } = await admin
      .from("leave_applications")
      .update({
        status: "rejected",
        reviewed_by: profile.id,
        reviewed_at: nowIso,
        review_remarks: body.remarks?.trim() || null,
      })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog(admin, {
      actorId: profile.id,
      action: "leave_rejected",
      targetTable: "leave_applications",
      targetId: id,
      oldData: { status: "pending" },
      newData: { status: "rejected", remarks: body.remarks ?? null },
    });
    void import("@/lib/hr/payrollNotifications").then(({ notifyLeaveDecision }) =>
      notifyLeaveDecision({
        employeeId: application.employee_id,
        approved: false,
        applicationId: id,
      }),
    );
    return NextResponse.json({ ok: true });
  }

  // approve — update status then burn balance
  const { error } = await admin
    .from("leave_applications")
    .update({
      status: "approved",
      reviewed_by: profile.id,
      reviewed_at: nowIso,
      review_remarks: body.remarks?.trim() || null,
    })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    await consumeLeaveBalance(admin, application.employee_id, lt, year, Number(application.total_days), profile.id);
  } catch (e) {
    // Roll the status back so approval + balance stay consistent.
    await admin.from("leave_applications").update({ status: "pending", reviewed_by: null, reviewed_at: null }).eq("id", id);
    return NextResponse.json(
      { error: `Balance update failed, approval rolled back: ${e instanceof Error ? e.message : "unknown error"}` },
      { status: 500 },
    );
  }

  await writeAuditLog(admin, {
    actorId: profile.id,
    action: "leave_approved",
    targetTable: "leave_applications",
    targetId: id,
    oldData: { status: "pending" },
    newData: { status: "approved", totalDays: application.total_days, leaveType: lt.code },
  });

  void import("@/lib/hr/payrollNotifications").then(({ notifyLeaveDecision }) =>
    notifyLeaveDecision({
      employeeId: application.employee_id,
      approved: true,
      applicationId: id,
    }),
  );

  return NextResponse.json({ ok: true });
}
