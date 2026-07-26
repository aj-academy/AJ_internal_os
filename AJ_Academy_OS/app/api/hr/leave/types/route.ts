import { NextResponse } from "next/server";
import { requireAdminApiSession, requireStaffApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";

export const dynamic = "force-dynamic";

// GET /api/hr/leave/types — staff can read active leave types (admin sees inactive too)
export async function GET() {
  const { response, profile } = await requireStaffApiSession();
  if (response) return response;

  const admin = createAdminClient();
  let query = admin.from("leave_types").select("*").order("sort_order");
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  if (!isAdmin) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) {
    if (/does not exist/i.test(error.message)) {
      return NextResponse.json({ types: [], migrationRequired: "hr_payroll_04_leave_management.sql" });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ types: data ?? [] });
}

const NUMERIC_FIELDS = [
  ["annualEntitlement", "annual_entitlement"],
  ["monthlyAccrual", "monthly_accrual"],
  ["maxCarryForward", "max_carry_forward"],
  ["minNoticeDays", "min_notice_days"],
  ["sortOrder", "sort_order"],
] as const;

const BOOLEAN_FIELDS = [
  ["isPaid", "is_paid"],
  ["carryForwardAllowed", "carry_forward_allowed"],
  ["requiresDocument", "requires_document"],
  ["allowsHalfDay", "allows_half_day"],
  ["allowNegativeBalance", "allow_negative_balance"],
  ["countsAsPresence", "counts_as_presence"],
  ["isActive", "is_active"],
] as const;

// PATCH /api/hr/leave/types — admin updates a leave type's configuration
export async function PATCH(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: before } = await admin.from("leave_types").select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Leave type not found" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_by: profile?.id ?? null };
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  for (const [apiKey, col] of NUMERIC_FIELDS) {
    if (body[apiKey] !== undefined) {
      const n = Number(body[apiKey]);
      if (!Number.isFinite(n) || n < 0) {
        return NextResponse.json({ error: `${apiKey} must be a non-negative number` }, { status: 400 });
      }
      patch[col] = n;
    }
  }
  if (body.maxBalance !== undefined) {
    patch.max_balance =
      body.maxBalance === null || body.maxBalance === "" ? null : Math.max(0, Number(body.maxBalance) || 0);
  }
  for (const [apiKey, col] of BOOLEAN_FIELDS) {
    if (typeof body[apiKey] === "boolean") patch[col] = body[apiKey];
  }

  const { data, error } = await admin.from("leave_types").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(admin, {
    actorId: profile?.id ?? null,
    action: "leave_type_updated",
    targetTable: "leave_types",
    targetId: id,
    oldData: before,
    newData: data,
  });

  return NextResponse.json({ ok: true, type: data });
}

// POST /api/hr/leave/types — admin creates a custom leave type
export async function POST(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response) return response;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!code || !name) return NextResponse.json({ error: "code and name are required" }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leave_types")
    .insert({
      code,
      name,
      is_paid: body.isPaid !== false,
      created_by: profile?.id ?? null,
      updated_by: profile?.id ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `Leave type code ${code} already exists.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(admin, {
    actorId: profile?.id ?? null,
    action: "leave_type_created",
    targetTable: "leave_types",
    targetId: data.id,
    newData: data,
  });

  return NextResponse.json({ ok: true, type: data });
}
