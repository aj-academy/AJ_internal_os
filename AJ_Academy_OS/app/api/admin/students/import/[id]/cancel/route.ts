import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { writeAuditLog } from "@/lib/hr/auditLog";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** POST cancel an in-progress / ready import (not completed). */
export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;
  const { id } = await ctx.params;
  const admin = createAdminClient();

  const { data: batch } = await admin.from("student_import_batches").select("*").eq("id", id).maybeSingle();
  if (!batch) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (["completed", "completed_with_errors", "cancelled"].includes(batch.status)) {
    return NextResponse.json({ error: "Completed or cancelled imports cannot be cancelled again." }, { status: 400 });
  }
  if (batch.status === "importing") {
    return NextResponse.json({ error: "Import already running; wait for completion." }, { status: 409 });
  }

  const { data, error } = await admin
    .from("student_import_batches")
    .update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await writeAuditLog(admin, {
    actorId: auth.user.id,
    action: "student_import.cancel",
    module: "student_import",
    targetTable: "student_import_batches",
    targetId: id,
  }).catch(() => undefined);

  return NextResponse.json({ batch: data });
}
