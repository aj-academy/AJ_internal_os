import { NextResponse } from "next/server";
import { requireAdminApiSession, requireStaffApiSession } from "@/lib/security";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/hr/auditLog";

export const dynamic = "force-dynamic";

// GET /api/hr/holidays?year=YYYY — any staff member can read the calendar
export async function GET(request: Request) {
  const { response } = await requireStaffApiSession();
  if (response) return response;

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year")) || new Date().getFullYear();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("holidays")
    .select("*")
    .gte("holiday_date", `${year}-01-01`)
    .lte("holiday_date", `${year}-12-31`)
    .order("holiday_date");

  if (error) {
    if (/does not exist/i.test(error.message)) {
      return NextResponse.json({
        year,
        holidays: [],
        migrationRequired: "hr_payroll_03_holidays.sql",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ year, holidays: data ?? [] });
}

// POST /api/hr/holidays — admin adds a holiday
export async function POST(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response) return response;

  let body: { holidayDate?: string; name?: string; holidayType?: string; isPaid?: boolean; description?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const holidayDate = body.holidayDate?.trim();
  const name = body.name?.trim();
  if (!holidayDate || !/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) {
    return NextResponse.json({ error: "holidayDate (YYYY-MM-DD) is required" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const holidayType = ["public", "company", "optional"].includes(body.holidayType ?? "")
    ? body.holidayType
    : "public";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("holidays")
    .insert({
      holiday_date: holidayDate,
      name,
      holiday_type: holidayType,
      is_paid: body.isPaid !== false,
      description: body.description?.trim() || null,
      created_by: profile?.id ?? null,
      updated_by: profile?.id ?? null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `A holiday already exists on ${holidayDate}.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(admin, {
    actorId: profile?.id ?? null,
    action: "holiday_created",
    targetTable: "holidays",
    targetId: data.id,
    newData: data,
  });

  return NextResponse.json({ ok: true, holiday: data });
}

// PATCH /api/hr/holidays — admin edits a holiday
export async function PATCH(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response) return response;

  let body: {
    id?: string;
    holidayDate?: string;
    name?: string;
    holidayType?: string;
    isPaid?: boolean;
    description?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = body.id?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: before } = await admin.from("holidays").select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Holiday not found" }, { status: 404 });

  const patch: Record<string, unknown> = { updated_by: profile?.id ?? null };
  if (body.holidayDate && /^\d{4}-\d{2}-\d{2}$/.test(body.holidayDate)) patch.holiday_date = body.holidayDate;
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (body.holidayType && ["public", "company", "optional"].includes(body.holidayType)) {
    patch.holiday_type = body.holidayType;
  }
  if (typeof body.isPaid === "boolean") patch.is_paid = body.isPaid;
  if (body.description !== undefined) patch.description = body.description;

  const { data, error } = await admin.from("holidays").update(patch).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(admin, {
    actorId: profile?.id ?? null,
    action: "holiday_updated",
    targetTable: "holidays",
    targetId: id,
    oldData: before,
    newData: data,
  });

  return NextResponse.json({ ok: true, holiday: data });
}

// DELETE /api/hr/holidays?id=…
export async function DELETE(request: Request) {
  const { response, profile } = await requireAdminApiSession();
  if (response) return response;

  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const admin = createAdminClient();
  const { data: before } = await admin.from("holidays").select("*").eq("id", id).maybeSingle();
  if (!before) return NextResponse.json({ error: "Holiday not found" }, { status: 404 });

  const { error } = await admin.from("holidays").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(admin, {
    actorId: profile?.id ?? null,
    action: "holiday_deleted",
    targetTable: "holidays",
    targetId: id,
    oldData: before,
  });

  return NextResponse.json({ ok: true });
}
