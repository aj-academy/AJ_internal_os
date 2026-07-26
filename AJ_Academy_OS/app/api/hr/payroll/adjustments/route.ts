import { NextResponse } from "next/server";
import { requireAdminApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";
import {
  ADDITION_TYPES,
  DEDUCTION_TYPES,
  directionForType,
  type AdjustmentType,
} from "@/lib/hr/salaryAdjustments";
import { isRecalculable } from "@/lib/hr/payrollWorkflow";

export const dynamic = "force-dynamic";

const ALL_TYPES = [...ADDITION_TYPES, ...DEDUCTION_TYPES] as AdjustmentType[];

// GET /api/hr/payroll/adjustments?year=&month=&status=&employeeId=
export async function GET(request: Request) {
  const { response } = await requireAdminApiSession();
  if (response) return response;

  const url = new URL(request.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;
  const status = url.searchParams.get("status");
  const employeeId = url.searchParams.get("employeeId");

  const admin = createAdminClient();
  let query = admin
    .from("salary_adjustments")
    .select("*")
    .eq("year", year)
    .eq("month", month)
    .order("created_at", { ascending: false });
  if (status) query = query.eq("status", status);
  if (employeeId) query = query.eq("employee_id", employeeId);

  const [{ data, error }, { data: employees }] = await Promise.all([
    query,
    admin
      .from("profiles")
      .select("id, full_name, email")
      .eq("role", "employee")
      .eq("status", "active")
      .order("full_name"),
  ]);

  if (error) {
    if (/does not exist/i.test(error.message)) {
      return NextResponse.json({
        year,
        month,
        adjustments: [],
        employees: employees ?? [],
        migrationRequired: "hr_payroll_08_10_workflow_adjustments.sql",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ year, month, adjustments: data ?? [], employees: employees ?? [] });
}

// POST — create pending adjustment
export async function POST(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response || !profile) return response!;

  let body: {
    employeeId?: string;
    year?: number;
    month?: number;
    adjustmentType?: string;
    amount?: number;
    reason?: string;
    supportingDocumentUrl?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const employeeId = body.employeeId?.trim();
  const adjustmentType = body.adjustmentType as AdjustmentType | undefined;
  const amount = Number(body.amount);
  const reason = body.reason?.trim();
  const year = Number(body.year);
  const month = Number(body.month);

  if (!employeeId) return NextResponse.json({ error: "employeeId is required" }, { status: 400 });
  if (!adjustmentType || !ALL_TYPES.includes(adjustmentType)) {
    return NextResponse.json({ error: "Valid adjustmentType is required" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be greater than zero" }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: "reason is required" }, { status: 400 });
  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "Valid year and month are required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Block new adjustments against locked/paid periods
  const { data: period } = await admin
    .from("payroll_periods")
    .select("id, status")
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();
  if (period && !isRecalculable(period.status) && period.status !== "pending_adjustments") {
    // pending_adjustments and recalculable statuses OK; approved/locked/paid not OK
    if (["approved", "locked", "paid"].includes(period.status)) {
      return NextResponse.json(
        { error: `Payroll is ${period.status}. Reopen before adding adjustments.` },
        { status: 409 },
      );
    }
  }

  const { data, error } = await admin
    .from("salary_adjustments")
    .insert({
      employee_id: employeeId,
      payroll_period_id: period?.id ?? null,
      year,
      month,
      adjustment_type: adjustmentType,
      direction: directionForType(adjustmentType),
      amount,
      reason,
      supporting_document_url: body.supportingDocumentUrl?.trim() || null,
      status: "pending",
      created_by: profile.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(admin, {
    actorId: profile.id,
    action: "salary_adjustment_created",
    targetTable: "salary_adjustments",
    targetId: data.id,
    newData: data,
  });

  return NextResponse.json({ ok: true, adjustment: data });
}

// PATCH — approve / reject / cancel
export async function PATCH(request: Request) {
  const { response, profile } = await requireAdminApiSession();
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
  const { data: row, error: loadErr } = await admin
    .from("salary_adjustments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Adjustment not found" }, { status: 404 });
  if (row.status !== "pending") {
    return NextResponse.json({ error: `Adjustment already ${row.status}` }, { status: 409 });
  }

  // Approving against locked payroll is blocked
  if (action === "approve") {
    const { data: period } = await admin
      .from("payroll_periods")
      .select("status")
      .eq("year", row.year)
      .eq("month", row.month)
      .maybeSingle();
    if (period && ["approved", "locked", "paid"].includes(period.status)) {
      return NextResponse.json(
        { error: `Cannot approve adjustment: payroll is ${period.status}. Reopen first.` },
        { status: 409 },
      );
    }
  }

  const nowIso = new Date().toISOString();
  const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "cancelled";
  const { data: updated, error } = await admin
    .from("salary_adjustments")
    .update({
      status,
      approved_by: action === "approve" || action === "reject" ? profile.id : row.approved_by,
      approved_at: action === "approve" || action === "reject" ? nowIso : row.approved_at,
      review_remarks: body.remarks?.trim() || null,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(admin, {
    actorId: profile.id,
    action: `salary_adjustment_${action}d`,
    targetTable: "salary_adjustments",
    targetId: id,
    oldData: { status: "pending" },
    newData: { status, remarks: body.remarks ?? null },
  });

  return NextResponse.json({
    ok: true,
    adjustment: updated,
    note:
      action === "approve"
        ? "Approved. Recalculate the payroll period so this adjustment is included in net salary."
        : undefined,
  });
}
