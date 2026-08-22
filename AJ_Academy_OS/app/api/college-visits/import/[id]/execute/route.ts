import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { buildCollegeVisitPayload } from "@/components/college-visits/collegeVisitsHelpers";
import type { CollegeVisitFormValue } from "@/components/college-visits/collegeVisitsHelpers";
import { COLLEGE_IMPORT_EXECUTE_CHUNK } from "@/lib/collegeVisitsImport";
import { insertCollegeVisitsBulk } from "@/lib/collegeVisitInsert";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: batch, error: batchError } = await admin
    .from("college_visit_import_batches")
    .select("id,status,file_name,created_count")
    .eq("id", id)
    .maybeSingle();

  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 400 });
  if (!batch) return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  if (batch.status === "completed" || batch.status === "completed_with_errors") {
    if ((batch.created_count ?? 0) > 0) {
      return NextResponse.json({ error: "This import was already executed." }, { status: 400 });
    }
  }

  await admin
    .from("college_visit_import_batches")
    .update({ status: "importing", error_message: null })
    .eq("id", id);

  const { data: pendingRows, error: rowsError } = await admin
    .from("college_visit_import_rows")
    .select("id,row_number,payload,status")
    .eq("batch_id", id)
    .eq("status", "pending")
    .order("row_number", { ascending: true });

  if (rowsError) {
    await admin
      .from("college_visit_import_batches")
      .update({ status: "failed", error_message: rowsError.message })
      .eq("id", id);
    return NextResponse.json({ error: rowsError.message }, { status: 400 });
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;
  let lastInsertError: string | null = null;
  const activityRows: { college_visit_id: string; activity_type: string; notes: string; created_by: string }[] = [];

  const toInsert = (pendingRows ?? []).map((row) => {
    const form = row.payload as CollegeVisitFormValue;
    const payload = buildCollegeVisitPayload(form, { userId: auth.user!.id, isDbAdmin: true });
    return {
      importRowId: row.id as string,
      insert: {
        ...payload,
        assigned_to: auth.user!.id,
        assigned_by: auth.user!.id,
        created_by: auth.user!.id,
        import_batch_id: id,
        source_reference: form.source_reference?.trim() || batch.file_name,
      },
    };
  });

  for (let i = 0; i < toInsert.length; i += COLLEGE_IMPORT_EXECUTE_CHUNK) {
    const slice = toInsert.slice(i, i + COLLEGE_IMPORT_EXECUTE_CHUNK);
    const { results, lastError } = await insertCollegeVisitsBulk(
      admin,
      slice.map((s) => s.insert),
    );

    if (lastError) lastInsertError = lastError;

    for (let j = 0; j < slice.length; j += 1) {
      const result = results[j];
      const importRowId = slice[j]?.importRowId;
      if (result?.id) {
        created += 1;
        activityRows.push({
          college_visit_id: result.id,
          activity_type: "College Created",
          notes: `Import batch ${batch.file_name}`,
          created_by: auth.user!.id,
        });
        if (importRowId) {
          await admin.from("college_visit_import_rows").update({ status: "imported" }).eq("id", importRowId);
        }
      } else {
        failed += 1;
        if (importRowId) {
          await admin
            .from("college_visit_import_rows")
            .update({ status: "failed", error_message: lastError ?? "Insert failed." })
            .eq("id", importRowId);
        }
      }
    }
  }

  await admin
    .from("college_visit_import_rows")
    .update({ status: "skipped" })
    .eq("batch_id", id)
    .eq("status", "duplicate");

  const { count: skippedCount } = await admin
    .from("college_visit_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("batch_id", id)
    .eq("status", "skipped");

  skipped = skippedCount ?? 0;

  if (activityRows.length) {
    for (let i = 0; i < activityRows.length; i += 100) {
      await admin.from("college_visit_activities").insert(activityRows.slice(i, i + 100));
    }
  }

  const finalStatus = failed > 0 && created === 0 ? "completed_with_errors" : failed > 0 ? "completed_with_errors" : "completed";
  await admin
    .from("college_visit_import_batches")
    .update({
      status: created > 0 ? finalStatus : failed > 0 ? "completed_with_errors" : "completed",
      created_count: created,
      skipped_count: skipped,
      failed_count: failed,
      error_message: failed > 0 ? lastInsertError : null,
    })
    .eq("id", id);

  return NextResponse.json({
    created,
    skipped,
    failed,
    status: created > 0 ? finalStatus : failed > 0 ? "completed_with_errors" : "completed",
    error: failed > 0 ? lastInsertError : undefined,
  });
}
