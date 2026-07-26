import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";
import {
  createPayrollSettingsVersion,
  resolvePayrollSettingsForDate,
  type PayrollSettingsInput,
} from "@/lib/hr/payrollSettings";
import type { SalaryDayMethod } from "@/lib/hr/attendanceStatus";
import type { RoundingMethod } from "@/lib/hr/payrollSettings";

export const dynamic = "force-dynamic";

// GET /api/hr/payroll/settings
export async function GET() {
  const { response } = await requireAdminApiSession();
  if (response) return response;

  const admin = createAdminClient();
  try {
    const [{ data: rows }, active] = await Promise.all([
      admin.from("payroll_settings").select("*").order("effective_from", { ascending: false }),
      resolvePayrollSettingsForDate(admin, new Date().toISOString().slice(0, 10)),
    ]);
    return NextResponse.json({ settings: rows ?? [], active });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load";
    if (/does not exist|PGRST/i.test(message)) {
      return NextResponse.json({
        settings: [],
        active: null,
        migrationRequired: "hr_payroll_06_payroll_settings.sql",
      });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — publish new version
export async function POST(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response || !profile) return response!;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input: PayrollSettingsInput = {
    name: typeof body.name === "string" ? body.name : "Payroll settings",
    effectiveFrom:
      typeof body.effectiveFrom === "string" ? body.effectiveFrom : new Date().toISOString().slice(0, 10),
    companyName: String(body.companyName || "AJ Academy"),
    companyAddress: typeof body.companyAddress === "string" ? body.companyAddress : null,
    companyLogoUrl: typeof body.companyLogoUrl === "string" ? body.companyLogoUrl : null,
    currency: typeof body.currency === "string" ? body.currency : "INR",
    periodStartDay: Number(body.periodStartDay) || 1,
    salaryPaymentDay: Number(body.salaryPaymentDay) || 1,
    salaryDayMethod: (body.salaryDayMethod as SalaryDayMethod) || "fixed_30",
    configuredPayrollDays:
      body.configuredPayrollDays == null || body.configuredPayrollDays === ""
        ? null
        : Number(body.configuredPayrollDays),
    roundingMethod: (body.roundingMethod as RoundingMethod) || "nearest_rupee",
    attendanceCutoffDay: Number(body.attendanceCutoffDay) || 0,
    leaveCutoffDay: Number(body.leaveCutoffDay) || 0,
    adjustmentCutoffDay: Number(body.adjustmentCutoffDay) || 0,
    payslipNumberPrefix: typeof body.payslipNumberPrefix === "string" ? body.payslipNumberPrefix : "PSL",
    payslipNumberFormat:
      typeof body.payslipNumberFormat === "string"
        ? body.payslipNumberFormat
        : "{PREFIX}-{YYYY}{MM}-{SEQ4}",
    requireAttendanceReviewClearance: body.requireAttendanceReviewClearance !== false,
    autoReleasePayslipsOnLock: !!body.autoReleasePayslipsOnLock,
    notifyEmployeesOnRelease: body.notifyEmployeesOnRelease !== false,
    statutoryEnabled: !!body.statutoryEnabled,
    statutoryLabel: typeof body.statutoryLabel === "string" ? body.statutoryLabel : "not_verified",
    statutoryRules:
      body.statutoryRules && typeof body.statutoryRules === "object"
        ? (body.statutoryRules as Record<string, unknown>)
        : {},
    notes: typeof body.notes === "string" ? body.notes : null,
  };

  const admin = createAdminClient();
  try {
    const created = await createPayrollSettingsVersion(admin, input, profile.id);
    await writeAuditLog(admin, {
      actorId: profile.id,
      action: "payroll_settings_created",
      targetTable: "payroll_settings",
      targetId: created.id,
      newData: created,
    });
    return NextResponse.json({ ok: true, settings: created });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save settings" },
      { status: 400 },
    );
  }
}
