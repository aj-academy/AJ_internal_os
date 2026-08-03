import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";
import { monthBounds, runPayrollCalculation } from "@/lib/hr/payrollEngine";

export const dynamic = "force-dynamic";

// GET /api/hr/payroll/calculate?year=&month= — list period + items
export async function GET(request: Request) {
  const { response } = await requireAdminApiSession();
  if (response) return response;

  const url = new URL(request.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;
  const admin = createAdminClient();

  const { data: period, error } = await admin
    .from("payroll_periods")
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (error) {
    if (/does not exist/i.test(error.message)) {
      return NextResponse.json({
        year,
        month,
        period: null,
        items: [],
        bounds: monthBounds(year, month),
        migrationRequired: "hr_payroll_07_payroll_engine.sql",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let items: unknown[] = [];
  if (period) {
    const { data: itemRows } = await admin
      .from("payroll_items")
      .select(
        "id, employee_id, status, payable_days, present_days, paid_leave_days, unpaid_leave_days, absent_days, gross_earnings, total_deductions, net_salary, error_message, salary_structure_id",
      )
      .eq("payroll_period_id", period.id)
      .order("employee_id");
    items = itemRows ?? [];

    // Attach employee names + bank/KYC readiness
    const ids = [...new Set(items.map((i) => (i as { employee_id: string }).employee_id))];
    if (ids.length) {
      const [{ data: profiles }, { data: bankRows }] = await Promise.all([
        admin.from("profiles").select("id, full_name, department, role").in("id", ids),
        admin
          .from("employee_profile_details")
          .select("profile_id, bank_name, account_holder_name, account_number, ifsc_code, pan_number")
          .in("profile_id", ids),
      ]);
      const map = new Map((profiles ?? []).map((p) => [p.id, p]));
      const bankMap = new Map(
        (bankRows ?? []).map((b) => [String((b as { profile_id: string }).profile_id), b as Record<string, unknown>]),
      );
      items = items.map((i) => {
        const row = i as { employee_id: string };
        const bank = bankMap.get(row.employee_id);
        const bankReady = Boolean(
          bank?.bank_name && bank?.account_holder_name && bank?.account_number && bank?.ifsc_code,
        );
        const panReady = Boolean(bank?.pan_number);
        return {
          ...row,
          employee: map.get(row.employee_id) ?? null,
          bank_ready: bankReady,
          ready_for_payout: bankReady && panReady,
        };
      });
    }
  }

  return NextResponse.json({
    year,
    month,
    period,
    items,
    bounds: monthBounds(year, month),
  });
}

// POST /api/hr/payroll/calculate { year, month } — run engine
export async function POST(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response || !profile) return response!;

  let body: { year?: number; month?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const now = new Date();
  const year = Number(body.year) || now.getFullYear();
  const month = Number(body.month) || now.getMonth() + 1;
  if (month < 1 || month > 12) {
    return NextResponse.json({ error: "month must be 1–12" }, { status: 400 });
  }

  const admin = createAdminClient();
  try {
    const result = await runPayrollCalculation(admin, year, month, profile.id);
    await writeAuditLog(admin, {
      actorId: profile.id,
      action: "payroll_calculated",
      targetTable: "payroll_periods",
      targetId: result.periodId,
      newData: { year, month, summary: result.summary },
    });
    return NextResponse.json({
      ok: true,
      periodId: result.periodId,
      status: result.status,
      summary: result.summary,
      // Return compact results (full detail is in DB)
      results: result.results.map((r) => ({
        employeeId: r.employeeId,
        status: r.status,
        errorMessage: r.errorMessage,
        payableDays: r.attendance.payableDays,
        gross: r.earnings.grossEarnings,
        deductions: r.deductions.totalDeductions,
        net: r.netSalary,
      })),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Calculation failed" },
      { status: 400 },
    );
  }
}
