import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPayslipPdfBuffer } from "@/lib/hr/payslipPdf";
import { formatPayslipNumber, MONTH_NAMES } from "@/lib/hr/payslipFormat";
import { resolvePayrollSettingsForDate } from "@/lib/hr/payrollSettings";

export const PAYSLIPS_BUCKET = "payslips";

type GenResult = {
  employeeId: string;
  payslipId: string | null;
  payslipNumber: string | null;
  status: "generated" | "skipped" | "failed";
  error?: string;
};

export async function generatePayslipsForPeriod(
  admin: SupabaseClient,
  periodId: string,
  actorId: string | null,
  options?: { release?: boolean; employeeIds?: string[] },
): Promise<{ results: GenResult[]; generated: number; failed: number; skipped: number }> {
  const { data: period, error: periodErr } = await admin
    .from("payroll_periods")
    .select("*")
    .eq("id", periodId)
    .maybeSingle();
  if (periodErr) throw new Error(periodErr.message);
  if (!period) throw new Error("Payroll period not found.");
  if (!["approved", "locked", "paid"].includes(period.status)) {
    throw new Error(
      `Payslips can only be generated after payroll is approved/locked (current status: ${period.status}).`,
    );
  }

  const settings =
    (period.settings_snapshot as Record<string, unknown> | null) ??
    (await resolvePayrollSettingsForDate(admin, period.period_end));
  if (!settings) throw new Error("Payroll settings missing for this period.");

  let itemsQuery = admin
    .from("payroll_items")
    .select("*")
    .eq("payroll_period_id", periodId)
    .in("status", ["calculated", "approved", "locked", "paid"]);
  if (options?.employeeIds?.length) {
    itemsQuery = itemsQuery.in("employee_id", options.employeeIds);
  }
  const { data: items, error: itemsErr } = await itemsQuery;
  if (itemsErr) throw new Error(itemsErr.message);

  const employeeIds = [...new Set((items ?? []).map((i) => i.employee_id as string))];
  const [{ data: profiles }, { data: details }, { data: empDetails }] = await Promise.all([
    admin.from("profiles").select("id, full_name, department, designation").in("id", employeeIds),
    admin
      .from("employee_profile_details")
      .select(
        "profile_id, bank_name, account_number, ifsc_code, pan_number, uan_number, esi_number, account_holder_name",
      )
      .in("profile_id", employeeIds),
    admin.from("employee_details").select("profile_id, joined_at, employment_type").in("profile_id", employeeIds),
  ]);

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
  const detailsMap = new Map((details ?? []).map((d) => [d.profile_id, d]));
  const empDetailsMap = new Map((empDetails ?? []).map((d) => [d.profile_id, d]));

  // Sequence baseline: count existing payslips for this year/month
  const { count: existingCount } = await admin
    .from("payslips")
    .select("id", { count: "exact", head: true })
    .eq("year", period.year)
    .eq("month", period.month);
  let seq = (existingCount ?? 0) + 1;

  const prefix = String((settings as { payslip_number_prefix?: string }).payslip_number_prefix || "PSL");
  const format = String(
    (settings as { payslip_number_format?: string }).payslip_number_format || "{PREFIX}-{YYYY}{MM}-{SEQ4}",
  );
  const companyName = String((settings as { company_name?: string }).company_name || "AJ Academy");
  const companyAddress = ((settings as { company_address?: string | null }).company_address as string | null) ?? null;
  const companyLogo = ((settings as { company_logo_url?: string | null }).company_logo_url as string | null) ?? null;
  const currency = String((settings as { currency?: string }).currency || "INR");

  const results: GenResult[] = [];
  let generated = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of items ?? []) {
    if (item.status === "error" || item.status === "excluded") {
      skipped += 1;
      results.push({
        employeeId: item.employee_id,
        payslipId: null,
        payslipNumber: null,
        status: "skipped",
        error: `Item status is ${item.status}`,
      });
      continue;
    }

    const profile = profileMap.get(item.employee_id);
    const detail = detailsMap.get(item.employee_id);
    const ed = empDetailsMap.get(item.employee_id);
    const payslipNumber = formatPayslipNumber({
      prefix,
      format,
      year: period.year,
      month: period.month,
      seq,
    });
    seq += 1;

    try {
      const earnings = [
        { label: "Basic salary", amount: Number(item.earned_basic) || 0 },
        { label: "HRA", amount: Number(item.earned_hra) || 0 },
        { label: "Allowances", amount: Number(item.earned_allowances) || 0 },
        { label: "Incentive", amount: Number(item.incentives) || 0 },
        { label: "Bonus", amount: Number(item.bonus) || 0 },
        { label: "Overtime", amount: Number(item.overtime_amount) || 0 },
        { label: "Arrears", amount: Number(item.arrears) || 0 },
        { label: "Reimbursements", amount: Number(item.reimbursements) || 0 },
        { label: "Other earnings", amount: Number(item.other_earnings) || 0 },
      ];
      const deductions = [
        { label: "Loss of pay", amount: Number(item.loss_of_pay) || 0 },
        { label: "Absence deduction", amount: Number(item.absence_deduction) || 0 },
        { label: "Late deduction", amount: Number(item.late_deduction) || 0 },
        { label: "Fixed deductions", amount: Number(item.fixed_deductions) || 0 },
        { label: "Advance recovery", amount: Number(item.advance_recovery) || 0 },
        { label: "Loan recovery", amount: Number(item.loan_recovery) || 0 },
        { label: "Penalty", amount: Number(item.penalty) || 0 },
        { label: "Statutory deductions", amount: Number(item.statutory_deductions) || 0 },
        { label: "Other deductions", amount: Number(item.other_deductions) || 0 },
      ];

      const pdfInput = {
        payslipNumber,
        year: period.year as number,
        month: period.month as number,
        generatedAt: new Date().toISOString(),
        company: { name: companyName, address: companyAddress, logoUrl: companyLogo },
        employee: {
          name: profile?.full_name ?? "Employee",
          employeeId: item.employee_id,
          department: profile?.department ?? null,
          designation: profile?.designation ?? null,
          joinedAt: ed?.joined_at ?? null,
          employmentType: ed?.employment_type ?? null,
          bankName: detail?.bank_name ?? null,
          accountNumber: detail?.account_number ?? null,
          ifsc: detail?.ifsc_code ?? null,
          pan: detail?.pan_number ?? null,
          uan: (detail as { uan_number?: string | null } | undefined)?.uan_number ?? null,
          esi: (detail as { esi_number?: string | null } | undefined)?.esi_number ?? null,
        },
        attendance: {
          calendarDays: Number(item.calendar_days) || 0,
          workingDays: Number(item.working_days) || 0,
          presentDays: Number(item.present_days) || 0,
          paidLeave: Number(item.paid_leave_days) || 0,
          unpaidLeave: Number(item.unpaid_leave_days) || 0,
          weeklyOffs: Number(item.weekly_offs) || 0,
          holidays: Number(item.holidays) || 0,
          absentDays: Number(item.absent_days) || 0,
          halfDays: Number(item.half_days) || 0,
          payableDays: Number(item.payable_days) || 0,
        },
        earnings,
        deductions,
        gross: Number(item.gross_earnings) || 0,
        totalDeductions: Number(item.total_deductions) || 0,
        net: Number(item.net_salary) || 0,
        paymentStatus: period.status === "paid" ? "Paid" : period.status,
        paymentDate: period.paid_at ?? null,
        paymentReference: period.payment_reference ?? null,
        currency,
      };

      const pdfBuffer = await buildPayslipPdfBuffer(pdfInput);
      const storagePath = `${item.employee_id}/${period.year}-${String(period.month).padStart(2, "0")}/${payslipNumber}.pdf`;

      const { error: uploadErr } = await admin.storage.from(PAYSLIPS_BUCKET).upload(storagePath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });
      if (uploadErr) throw new Error(uploadErr.message);

      const releaseNow = !!options?.release || period.status === "paid";
      const row = {
        payroll_period_id: periodId,
        payroll_item_id: item.id,
        employee_id: item.employee_id,
        payslip_number: payslipNumber,
        year: period.year,
        month: period.month,
        storage_bucket: PAYSLIPS_BUCKET,
        storage_path: storagePath,
        file_size_bytes: pdfBuffer.byteLength,
        status: releaseNow ? "released" : "generated",
        generated_at: new Date().toISOString(),
        generated_by: actorId,
        released_at: releaseNow ? new Date().toISOString() : null,
        released_by: releaseNow ? actorId : null,
        generation_error: null,
        snapshot: {
          companyName,
          monthLabel: `${MONTH_NAMES[period.month as number]} ${period.year}`,
          net: pdfInput.net,
          gross: pdfInput.gross,
          employeeName: pdfInput.employee.name,
        },
      };

      const { data: existing } = await admin
        .from("payslips")
        .select("id")
        .eq("payroll_item_id", item.id)
        .maybeSingle();

      let payslipId: string;
      if (existing) {
        const { data: prior } = await admin
          .from("payslips")
          .select("status, released_at, released_by")
          .eq("id", existing.id)
          .maybeSingle();
        const wasReleased =
          !!prior?.released_at || prior?.status === "released" || prior?.status === "regenerated";
        const nextStatus = releaseNow ? "released" : wasReleased ? "regenerated" : "generated";
        const { data: updated, error: updErr } = await admin
          .from("payslips")
          .update({
            ...row,
            status: nextStatus,
            released_at: releaseNow ? row.released_at : prior?.released_at ?? null,
            released_by: releaseNow ? row.released_by : prior?.released_by ?? null,
          })
          .eq("id", existing.id)
          .select("id")
          .single();
        if (updErr) throw new Error(updErr.message);
        payslipId = updated.id;
      } else {
        const { data: inserted, error: insErr } = await admin.from("payslips").insert(row).select("id").single();
        if (insErr) throw new Error(insErr.message);
        payslipId = inserted.id;
      }

      generated += 1;
      results.push({
        employeeId: item.employee_id,
        payslipId,
        payslipNumber,
        status: "generated",
      });
    } catch (e) {
      failed += 1;
      const message = e instanceof Error ? e.message : "Generation failed";
      const { data: existingFail } = await admin
        .from("payslips")
        .select("id")
        .eq("payroll_item_id", item.id)
        .maybeSingle();
      if (existingFail) {
        await admin
          .from("payslips")
          .update({ status: "failed", generation_error: message, generated_by: actorId })
          .eq("id", existingFail.id);
      }
      results.push({
        employeeId: item.employee_id,
        payslipId: existingFail?.id ?? null,
        payslipNumber: null,
        status: "failed",
        error: message,
      });
    }
  }

  return { results, generated, failed, skipped };
}

export async function createPayslipSignedUrl(
  admin: SupabaseClient,
  storagePath: string,
  expiresInSeconds = 120,
): Promise<string> {
  const { data, error } = await admin.storage
    .from(PAYSLIPS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds, { download: true });
  if (error || !data?.signedUrl) throw new Error(error?.message || "Could not create signed URL");
  return data.signedUrl;
}
