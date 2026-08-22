import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

/** Reset a failed import batch so duplicate preview + Import can run again. */
export async function POST(_request: Request, { params }: RouteParams) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: batch, error: batchError } = await admin
    .from("college_visit_import_batches")
    .select("id,status,created_count,new_count")
    .eq("id", id)
    .maybeSingle();

  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 400 });
  if (!batch) return NextResponse.json({ error: "Import batch not found." }, { status: 404 });

  const created = batch.created_count ?? 0;
  const canReset =
    batch.status === "failed" ||
    (batch.status === "completed_with_errors" && created === 0) ||
    (batch.status === "completed" && created === 0 && (batch.new_count ?? 0) > 0);

  if (!canReset) {
    return NextResponse.json({ batch, reset: false });
  }

  await admin
    .from("college_visit_import_rows")
    .update({ status: "pending", error_message: null })
    .eq("batch_id", id)
    .in("status", ["failed", "imported"]);

  await admin
    .from("college_visit_import_batches")
    .update({
      status: "ready_for_review",
      failed_count: 0,
      created_count: 0,
      skipped_count: 0,
      error_message: null,
    })
    .eq("id", id);

  const { data: updated, error: reloadError } = await admin
    .from("college_visit_import_batches")
    .select(
      "id,batch_number,file_name,file_hash,row_count,new_count,duplicate_count,invalid_count,created_count,skipped_count,failed_count,status,uploaded_at,error_message",
    )
    .eq("id", id)
    .single();

  if (reloadError) return NextResponse.json({ error: reloadError.message }, { status: 400 });

  return NextResponse.json({ batch: updated, reset: true });
}
