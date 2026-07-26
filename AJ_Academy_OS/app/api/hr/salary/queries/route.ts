import { NextResponse } from "next/server";
import { requireAdminApiSession, requireStaffApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";

export const dynamic = "force-dynamic";

function isAdminRole(role: string | null | undefined) {
  return role === "admin" || role === "super_admin";
}

// GET /api/hr/salary/queries?status=
export async function GET(request: Request) {
  const { response, profile } = await requireStaffApiSession();
  if (response || !profile) return response!;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const isAdmin = isAdminRole(profile.role);
  const admin = createAdminClient();

  let query = admin.from("salary_queries").select("*").order("created_at", { ascending: false });
  if (!isAdmin) query = query.eq("employee_id", profile.id);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    if (/does not exist/i.test(error.message)) {
      return NextResponse.json({
        queries: [],
        migrationRequired: "hr_payroll_11_13_payslips_queries.sql",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let queries = data ?? [];
  if (isAdmin && queries.length) {
    const ids = [...new Set(queries.map((q) => q.employee_id))];
    const { data: profiles } = await admin.from("profiles").select("id, full_name, email").in("id", ids);
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    queries = queries.map((q) => ({ ...q, employee: map.get(q.employee_id) ?? null }));
  }

  return NextResponse.json({ queries });
}

// POST — employee raises query (or admin on behalf)
export async function POST(request: Request) {
  const { response, profile } = await requireStaffApiSession();
  if (response || !profile) return response!;

  let body: {
    year?: number;
    month?: number;
    category?: string;
    subject?: string;
    description?: string;
    attachmentUrl?: string;
    employeeId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const isAdmin = isAdminRole(profile.role);
  const employeeId = isAdmin && body.employeeId ? body.employeeId : profile.id;
  const year = Number(body.year);
  const month = Number(body.month);
  const subject = body.subject?.trim();
  const description = body.description?.trim();
  const category = body.category?.trim() || "other";

  if (!year || !month || month < 1 || month > 12) {
    return NextResponse.json({ error: "Valid year and month are required" }, { status: 400 });
  }
  if (!subject || !description) {
    return NextResponse.json({ error: "Subject and description are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("salary_queries")
    .insert({
      employee_id: employeeId,
      year,
      month,
      category,
      subject,
      description,
      attachment_url: body.attachmentUrl?.trim() || null,
      status: "open",
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(admin, {
    actorId: profile.id,
    action: "salary_query_created",
    targetTable: "salary_queries",
    targetId: data.id,
    newData: { employeeId, year, month, subject },
  });

  return NextResponse.json({ ok: true, query: data });
}

// PATCH — HR resolve / reject / under_review / close
export async function PATCH(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response || !profile) return response!;

  let body: {
    id?: string;
    status?: "under_review" | "resolved" | "rejected" | "closed";
    hrResponse?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id?.trim();
  const status = body.status;
  if (!id || !status) {
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: before } = await admin.from("salary_queries").select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Query not found" }, { status: 404 });

  const patch: Record<string, unknown> = { status };
  if (body.hrResponse !== undefined) patch.hr_response = body.hrResponse;
  if (status === "resolved" || status === "rejected") {
    patch.resolved_by = profile.id;
    patch.resolved_at = new Date().toISOString();
  }

  const { data, error } = await admin.from("salary_queries").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(admin, {
    actorId: profile.id,
    action: "salary_query_updated",
    targetTable: "salary_queries",
    targetId: id,
    oldData: { status: before.status },
    newData: { status, hrResponse: body.hrResponse ?? null },
  });

  if (["resolved", "rejected", "under_review", "closed"].includes(status)) {
    void import("@/lib/hr/payrollNotifications").then(({ notifySalaryQueryUpdated }) =>
      notifySalaryQueryUpdated({
        employeeId: before.employee_id,
        queryId: id,
        status,
      }),
    );
  }

  return NextResponse.json({ ok: true, query: data });
}
