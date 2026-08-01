import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import {
  auditMentorAllocationChange,
  normalizeAllocationInput,
  validateAllocationInput,
} from "@/lib/lms/mentorAllocations";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const supabase = await createClient();
  const { data: existing, error: loadError } = await supabase
    .from("mentor_allocations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !existing) {
    return NextResponse.json({ error: "Allocation not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (typeof body.status === "string" && Object.keys(body).length <= 2) {
    const status = String(body.status);
    if (!["active", "inactive", "expired", "revoked"].includes(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("mentor_allocations")
      .update({ status, updated_by: auth.user.id })
      .eq("id", id)
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await auditMentorAllocationChange({
      actorId: auth.user.id,
      action: `mentor_allocation.status_${status}`,
      allocationId: id,
      oldData: existing,
      newData: data,
    });
    return NextResponse.json({ allocation: data });
  }

  const input = normalizeAllocationInput({
    mentor_id: (body.mentor_id as string) ?? existing.mentor_id,
    department_id: (body.department_id as string) ?? existing.department_id,
    course_id: (body.course_id as string | null | undefined) ?? existing.course_id,
    batch_id: (body.batch_id as string | null | undefined) ?? existing.batch_id,
    module_id: (body.module_id as string | null | undefined) ?? existing.module_id,
    start_date: (body.start_date as string) ?? existing.start_date,
    end_date: (body.end_date as string | null | undefined) ?? existing.end_date,
    is_primary: body.is_primary !== undefined ? Boolean(body.is_primary) : existing.is_primary,
    status: (body.status as never) ?? existing.status,
    notes: (body.notes as string | null | undefined) ?? existing.notes,
  });

  const validationError = validateAllocationInput(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("mentor_allocations")
    .update({
      mentor_id: input.mentor_id,
      department_id: input.department_id,
      course_id: input.course_id,
      batch_id: input.batch_id,
      module_id: input.module_id,
      start_date: input.start_date,
      end_date: input.end_date,
      is_primary: input.is_primary !== false,
      status: input.status ?? existing.status,
      notes: input.notes,
      updated_by: auth.user.id,
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await auditMentorAllocationChange({
    actorId: auth.user.id,
    action: "mentor_allocation.update",
    allocationId: id,
    oldData: existing,
    newData: data,
  });

  return NextResponse.json({ allocation: data });
}
