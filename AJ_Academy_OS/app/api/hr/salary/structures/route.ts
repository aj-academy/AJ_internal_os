import { NextResponse } from "next/server";
import { requireAdminApiSession, requireHrSelfServiceApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";
import {
  createSalaryStructureVersion,
  resolveSalaryStructureForDate,
  sumComponents,
  type SalaryStructureInput,
  type SalaryType,
  type SalaryPayrollStatus,
} from "@/lib/hr/salaryStructure";

export const dynamic = "force-dynamic";

function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
}

// GET /api/hr/salary/structures?employeeId=&date=
export async function GET(request: Request) {
  const { response, profile } = await requireHrSelfServiceApiSession();
  if (response || !profile) return response!;

  const url = new URL(request.url);
  const isAdmin = isAdminRole(profile.role);
  const employeeId = isAdmin ? url.searchParams.get("employeeId") : profile.id;
  const date = url.searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const admin = createAdminClient();

  if (!employeeId && isAdmin) {
    // List employees + freelancers + whether they have an active structure + bank/KYC readiness
    const [{ data: employees }, { data: structures }, { data: bankRows }] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, email, department, designation, role")
        .in("role", ["employee", "freelancer"])
        .eq("status", "active")
        .order("full_name"),
      admin
        .from("employee_salary_structures")
        .select("id, employee_id, salary_type, payroll_status, effective_from, effective_to, monthly_gross, basic_salary")
        .is("effective_to", null)
        .order("effective_from", { ascending: false }),
      admin
        .from("employee_profile_details")
        .select(
          "profile_id, bank_name, account_holder_name, account_number, ifsc_code, pan_number, uan_number, esi_number, profile_completion",
        ),
    ]);

    const bankByProfile = new Map(
      (bankRows ?? []).map((b) => [String((b as { profile_id: string }).profile_id), b as Record<string, unknown>]),
    );
    const profileBank = (employees ?? []).map((e) => {
      const row = bankByProfile.get(e.id);
      const bankReady = Boolean(
        row?.bank_name && row?.account_holder_name && row?.account_number && row?.ifsc_code,
      );
      const panReady = Boolean(row?.pan_number);
      return {
        profile_id: e.id,
        bank_ready: bankReady,
        pan_ready: panReady,
        ready_for_payout: bankReady && panReady,
        has_uan: Boolean(row?.uan_number),
        has_esi: Boolean(row?.esi_number),
        profile_completion: Number(row?.profile_completion ?? 0),
        missing: [
          !row?.bank_name ? "Bank name" : null,
          !row?.account_holder_name ? "Account holder" : null,
          !row?.account_number ? "Account number" : null,
          !row?.ifsc_code ? "IFSC" : null,
          !row?.pan_number ? "PAN" : null,
        ].filter(Boolean),
      };
    });

    return NextResponse.json({
      employees: employees ?? [],
      openStructures: structures ?? [],
      profileBank,
    });
  }

  if (!employeeId) return NextResponse.json({ error: "employeeId required" }, { status: 400 });
  if (!isAdmin && employeeId !== profile.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: history, error } = await admin
    .from("employee_salary_structures")
    .select("*")
    .eq("employee_id", employeeId)
    .order("effective_from", { ascending: false });

  if (error) {
    if (/does not exist/i.test(error.message)) {
      return NextResponse.json({
        history: [],
        active: null,
        migrationRequired: "hr_payroll_05_salary_structures.sql",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let active = null;
  try {
    active = await resolveSalaryStructureForDate(admin, employeeId, date);
  } catch {
    active = null;
  }

  // UAN/ESI/bank from profile details when available
  let statutoryIds: {
    uan_number: string | null;
    esi_number: string | null;
    pan_number: string | null;
    bank_name: string | null;
    account_holder_name: string | null;
    account_number: string | null;
    ifsc_code: string | null;
  } | null = null;
  const { data: details } = await admin
    .from("employee_profile_details")
    .select("uan_number, esi_number, pan_number, bank_name, account_holder_name, account_number, ifsc_code")
    .eq("profile_id", employeeId)
    .maybeSingle();
  if (details) {
    const d = details as Record<string, string | null | undefined>;
    statutoryIds = {
      uan_number: d.uan_number ?? null,
      esi_number: d.esi_number ?? null,
      pan_number: d.pan_number ?? null,
      bank_name: d.bank_name ?? null,
      account_holder_name: d.account_holder_name ?? null,
      account_number: d.account_number ?? null,
      ifsc_code: d.ifsc_code ?? null,
    };
  }

  return NextResponse.json({ history: history ?? [], active, statutoryIds, date });
}

function parseInput(body: Record<string, unknown>, employeeId: string): SalaryStructureInput {
  const salaryType = (body.salaryType as SalaryType) || "monthly";
  const payrollStatus = (body.payrollStatus as SalaryPayrollStatus) || "active";
  return {
    employeeId,
    salaryType,
    payrollStatus,
    effectiveFrom: String(body.effectiveFrom || new Date().toISOString().slice(0, 10)),
    currency: typeof body.currency === "string" ? body.currency : "INR",
    monthlyGross: Number(body.monthlyGross) || 0,
    annualCtc: body.annualCtc == null || body.annualCtc === "" ? null : Number(body.annualCtc),
    basicSalary: Number(body.basicSalary) || 0,
    hra: Number(body.hra) || 0,
    specialAllowance: Number(body.specialAllowance) || 0,
    travelAllowance: Number(body.travelAllowance) || 0,
    communicationAllowance: Number(body.communicationAllowance) || 0,
    incentive: Number(body.incentive) || 0,
    otherAllowances: Number(body.otherAllowances) || 0,
    fixedDeductions: Number(body.fixedDeductions) || 0,
    dailyRate: body.dailyRate == null || body.dailyRate === "" ? null : Number(body.dailyRate),
    hourlyRate: body.hourlyRate == null || body.hourlyRate === "" ? null : Number(body.hourlyRate),
    changeReason: String(body.changeReason || ""),
    notes: typeof body.notes === "string" ? body.notes : null,
  };
}

// POST — create new effective-dated version (admin)
export async function POST(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response || !profile) return response!;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const employeeId = typeof body.employeeId === "string" ? body.employeeId.trim() : "";
  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });

  const input = parseInput(body, employeeId);
  // Auto-fill monthlyGross from components if blank
  if (!input.monthlyGross) {
    input.monthlyGross = sumComponents(input);
  }

  const admin = createAdminClient();
  try {
    const created = await createSalaryStructureVersion(admin, input, profile.id);
    await writeAuditLog(admin, {
      actorId: profile.id,
      action: "salary_structure_created",
      targetTable: "employee_salary_structures",
      targetId: created.id,
      newData: created,
    });

    // Optional UAN/ESI update on profile details
    if (body.uanNumber !== undefined || body.esiNumber !== undefined) {
      const patch: Record<string, unknown> = {};
      if (typeof body.uanNumber === "string") patch.uan_number = body.uanNumber.trim() || null;
      if (typeof body.esiNumber === "string") patch.esi_number = body.esiNumber.trim() || null;
      if (Object.keys(patch).length) {
        await admin.from("employee_profile_details").upsert(
          { profile_id: employeeId, ...patch, last_updated_by: profile.id },
          { onConflict: "profile_id" },
        );
      }
    }

    return NextResponse.json({ ok: true, structure: created });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save structure" },
      { status: 400 },
    );
  }
}
