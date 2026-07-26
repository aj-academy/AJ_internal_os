import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";
import { maskAccountNumber } from "@/lib/hr/payslipFormat";

export const dynamic = "force-dynamic";

export type ReportKind =
  | "payroll_register"
  | "employee_salary"
  | "attendance_payroll"
  | "leave_deduction"
  | "lop"
  | "incentive"
  | "bonus"
  | "deduction"
  | "reimbursement"
  | "department"
  | "bank_transfer"
  | "payment_status"
  | "payslip_generation"
  | "audit";

// GET /api/hr/payroll/reports?kind=&year=&month=&department=&maskBank=1
export async function GET(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response || !profile) return response!;

  const url = new URL(request.url);
  const kind = (url.searchParams.get("kind") || "payroll_register") as ReportKind;
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;
  const department = url.searchParams.get("department")?.trim() || "";
  const maskBank = url.searchParams.get("maskBank") !== "0";

  const admin = createAdminClient();

  const { data: period } = await admin
    .from("payroll_periods")
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (!period) {
    return NextResponse.json({
      year,
      month,
      kind,
      period: null,
      rows: [],
      warning: "No payroll period for this month. Calculate payroll first.",
    });
  }

  if (kind === "audit") {
    const { data: logs } = await admin
      .from("audit_logs")
      .select("*")
      .eq("module", "hr_payroll")
      .order("created_at", { ascending: false })
      .limit(200);
    await writeAuditLog(admin, {
      actorId: profile.id,
      action: "payroll_report_exported",
      targetTable: "audit_logs",
      newData: { kind, year, month },
    });
    return NextResponse.json({
      year,
      month,
      kind,
      period,
      rows: (logs ?? []).map((l) => ({
        created_at: l.created_at,
        action: l.action,
        actor_id: l.actor_id,
        target_table: l.target_table,
        target_id: l.target_id,
      })),
    });
  }

  if (kind === "payslip_generation") {
    const { data: slips } = await admin
      .from("payslips")
      .select("payslip_number, employee_id, status, generated_at, released_at, generation_error, download_count")
      .eq("year", year)
      .eq("month", month);
    const ids = [...new Set((slips ?? []).map((s) => s.employee_id))];
    const { data: profiles } = await admin.from("profiles").select("id, full_name").in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const map = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
    return NextResponse.json({
      year,
      month,
      kind,
      period,
      rows: (slips ?? []).map((s) => ({
        employee: map.get(s.employee_id) ?? s.employee_id,
        payslip_number: s.payslip_number,
        status: s.status,
        generated_at: s.generated_at,
        released_at: s.released_at,
        downloads: s.download_count,
        error: s.generation_error,
      })),
    });
  }

  const { data: items, error } = await admin
    .from("payroll_items")
    .select("*")
    .eq("payroll_period_id", period.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const empIds = [...new Set((items ?? []).map((i) => i.employee_id as string))];
  const [{ data: profiles }, { data: bankDetails }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name, email, department, designation")
      .in("id", empIds.length ? empIds : ["00000000-0000-0000-0000-000000000000"]),
    admin
      .from("employee_profile_details")
      .select("profile_id, bank_name, account_number, ifsc_code, account_holder_name")
      .in("profile_id", empIds.length ? empIds : ["00000000-0000-0000-0000-000000000000"]),
  ]);
  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const bankMap = new Map((bankDetails ?? []).map((b) => [b.profile_id, b]));

  let filtered = (items ?? []).filter((i) => {
    if (!department) return true;
    const p = profileMap.get(i.employee_id);
    return (p?.department || "").toLowerCase() === department.toLowerCase();
  });

  let rows: Record<string, unknown>[] = [];

  if (kind === "bank_transfer") {
    rows = filtered
      .filter((i) => i.status !== "excluded" && i.status !== "error")
      .map((i) => {
        const p = profileMap.get(i.employee_id);
        const b = bankMap.get(i.employee_id);
        return {
          employee_name: p?.full_name ?? "",
          employee_id: i.employee_id,
          bank_name: b?.bank_name ?? "",
          account_number: maskBank ? maskAccountNumber(b?.account_number) : b?.account_number ?? "",
          account_number_full: maskBank ? undefined : b?.account_number ?? "",
          ifsc: b?.ifsc_code ?? "",
          net_salary: Number(i.net_salary) || 0,
          payment_reference: period.payment_reference ?? "",
          payment_status: period.status === "paid" ? "Paid" : period.status,
        };
      });
    // Strip full account if masked
    if (maskBank) {
      rows = rows.map(({ account_number_full: _a, ...rest }) => rest);
    }
  } else if (kind === "department") {
    const byDept = new Map<string, { department: string; employees: number; gross: number; deductions: number; net: number }>();
    for (const i of filtered) {
      const dept = profileMap.get(i.employee_id)?.department || "Unassigned";
      const cur = byDept.get(dept) ?? { department: dept, employees: 0, gross: 0, deductions: 0, net: 0 };
      cur.employees += 1;
      cur.gross += Number(i.gross_earnings) || 0;
      cur.deductions += Number(i.total_deductions) || 0;
      cur.net += Number(i.net_salary) || 0;
      byDept.set(dept, cur);
    }
    rows = [...byDept.values()];
  } else {
    rows = filtered.map((i) => {
      const p = profileMap.get(i.employee_id);
      const base: Record<string, unknown> = {
        employee_name: p?.full_name ?? "",
        employee_id: i.employee_id,
        department: p?.department ?? "",
        designation: p?.designation ?? "",
        status: i.status,
        payable_days: i.payable_days,
        present_days: i.present_days,
        paid_leave_days: i.paid_leave_days,
        unpaid_leave_days: i.unpaid_leave_days,
        absent_days: i.absent_days,
        gross_earnings: i.gross_earnings,
        total_deductions: i.total_deductions,
        net_salary: i.net_salary,
        error_message: i.error_message,
      };
      if (kind === "lop" || kind === "leave_deduction") {
        base.loss_of_pay = i.loss_of_pay;
        base.unpaid_leave_days = i.unpaid_leave_days;
        base.absent_days = i.absent_days;
      }
      if (kind === "incentive") base.incentives = i.incentives;
      if (kind === "bonus") base.bonus = i.bonus;
      if (kind === "deduction") {
        base.fixed_deductions = i.fixed_deductions;
        base.advance_recovery = i.advance_recovery;
        base.loan_recovery = i.loan_recovery;
        base.penalty = i.penalty;
        base.statutory_deductions = i.statutory_deductions;
      }
      if (kind === "reimbursement") base.reimbursements = i.reimbursements;
      if (kind === "attendance_payroll") {
        base.working_days = i.working_days;
        base.weekly_offs = i.weekly_offs;
        base.holidays = i.holidays;
        base.half_days = i.half_days;
      }
      if (kind === "payment_status") {
        base.period_status = period.status;
        base.payment_reference = period.payment_reference;
        base.paid_at = period.paid_at;
      }
      return base;
    });
  }

  await writeAuditLog(admin, {
    actorId: profile.id,
    action: kind === "bank_transfer" ? "bank_report_exported" : "payroll_report_exported",
    targetTable: "payroll_periods",
    targetId: period.id,
    newData: { kind, year, month, department: department || null, rowCount: rows.length, maskBank },
  });

  return NextResponse.json({ year, month, kind, period, rows });
}
