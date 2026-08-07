import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushNotification } from "@/lib/push/sendPushNotification";

/** Generic lock-screen-safe copy — never include salary amounts or bank details. */
export async function notifyLeaveDecision(args: {
  employeeId: string;
  approved: boolean;
  applicationId: string;
}) {
  try {
    await sendPushNotification({
      userId: args.employeeId,
      title: args.approved ? "Leave approved" : "Leave updated",
      message: args.approved
        ? "Your leave request was approved. Open AJ OS to view details."
        : "Your leave request was updated. Open AJ OS to view details.",
      type: args.approved ? "hr_leave_approved" : "hr_leave_rejected",
      targetUrl: "/employee/hr-payroll/leave",
      entityType: "leave_application",
      entityId: args.applicationId,
      priority: "high",
    });
  } catch {
    /* push must not fail the business op */
  }
}

export async function notifyLeaveSubmittedToAdmins(args: {
  admin: SupabaseClient;
  applicationId: string;
  employeeName?: string | null;
}) {
  try {
    const { data: admins } = await args.admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "super_admin"])
      .eq("status", "active");
    const name = args.employeeName?.trim() || "An employee";
    for (const a of admins ?? []) {
      await sendPushNotification({
        userId: a.id,
        title: "New leave request",
        message: `${name} submitted a leave request for review.`,
        type: "hr_leave_submitted",
        targetUrl: "/admin/hr-payroll/leave-management",
        entityType: "leave_application",
        entityId: args.applicationId,
        priority: "normal",
      });
    }
  } catch {
    /* ignore */
  }
}

export async function notifyPayslipReleased(args: {
  employeeId: string;
  payslipId: string;
  year: number;
  month: number;
}) {
  try {
    await sendPushNotification({
      userId: args.employeeId,
      title: "Payslip available",
      message: `Your payslip for ${args.month}/${args.year} is ready to download in AJ OS.`,
      type: "hr_payslip_released",
      targetUrl: "/employee/hr-payroll/payslips",
      entityType: "payslip",
      entityId: args.payslipId,
      priority: "high",
    });
  } catch {
    /* ignore */
  }
}

export async function notifySalaryQueryUpdated(args: {
  employeeId: string;
  queryId: string;
  status: string;
}) {
  try {
    const label = args.status.replace(/_/g, " ");
    await sendPushNotification({
      userId: args.employeeId,
      title: "Salary query update",
      message: `Your salary query is now ${label}. Open AJ OS to read the response.`,
      type: "hr_salary_query_updated",
      targetUrl: "/employee/hr-payroll/queries",
      entityType: "salary_query",
      entityId: args.queryId,
      priority: "normal",
    });
  } catch {
    /* ignore */
  }
}

export async function notifyAdminsCutoff(args: {
  admin: SupabaseClient;
  title: string;
  message: string;
  type: string;
  entityId?: string;
}) {
  try {
    const { data: admins } = await args.admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "super_admin"])
      .eq("status", "active");
    for (const a of admins ?? []) {
      await sendPushNotification({
        userId: a.id,
        title: args.title,
        message: args.message,
        type: args.type,
        targetUrl: "/admin/hr-payroll/monthly-payroll",
        entityType: "payroll_cutoff",
        entityId: args.entityId ?? null,
        priority: "high",
      });
    }
  } catch {
    /* ignore */
  }
}

export async function notifyAdminsPendingReview(args: {
  admin: SupabaseClient;
  year: number;
  month: number;
  periodId: string;
}) {
  try {
    const { data: admins } = await args.admin
      .from("profiles")
      .select("id")
      .in("role", ["admin", "super_admin"])
      .eq("status", "active");
    for (const a of admins ?? []) {
      await sendPushNotification({
        userId: a.id,
        title: "Payroll pending review",
        message: `Payroll for ${args.month}/${args.year} is waiting for review.`,
        type: "hr_payroll_pending_review",
        targetUrl: `/admin/hr-payroll/monthly-payroll`,
        entityType: "payroll_period",
        entityId: args.periodId,
        priority: "high",
      });
    }
  } catch {
    /* ignore */
  }
}

export async function notifyLateCheckIn(args: {
  employeeId: string;
  attendanceDate: string;
  checkInTimeLabel: string;
  portalAttendanceHref: string;
  pushTitle?: string;
  pushMessage?: string;
}) {
  try {
    await sendPushNotification({
      userId: args.employeeId,
      title: args.pushTitle || "Attendance notice — delayed arrival",
      message:
        args.pushMessage ||
        `Your check-in on ${args.attendanceDate} at ${args.checkInTimeLabel} was after the allowed reporting time. Please review your attendance in AJ OS.`,
      type: "hr_attendance_late",
      targetUrl: args.portalAttendanceHref,
      entityType: "attendance_late",
      entityId: `${args.employeeId}_${args.attendanceDate}`,
      priority: "high",
    });
  } catch {
    /* ignore */
  }
}
