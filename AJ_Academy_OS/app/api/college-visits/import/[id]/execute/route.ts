import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { buildCollegeVisitPayload } from "@/components/college-visits/collegeVisitsHelpers";
import type { CollegeVisitFormValue } from "@/components/college-visits/collegeVisitsHelpers";
import { COLLEGE_IMPORT_EXECUTE_CHUNK } from "@/lib/collegeVisitsImport";
import { insertCollegeVisitsBulk, updateCollegeVisitFromImport } from "@/lib/collegeVisitInsert";
import {
  parseDuplicateResolutions,
  resolutionForRow,
} from "@/lib/collegeVisitsImportResolutions";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: RouteParams) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: batch, error: batchError } = await admin
    .from("college_visit_import_batches")
    .select("id,status,file_name,created_count,meta")
    .eq("id", id)
    .maybeSingle();

  if (batchError) return NextResponse.json({ error: batchError.message }, { status: 400 });
  if (!batch) return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  if (batch.status === "completed" || batch.status === "completed_with_errors") {
    if ((batch.created_count ?? 0) > 0) {
      return NextResponse.json({ error: "This import was already executed." }, { status: 400 });
    }
  }

  const duplicateResolutions = parseDuplicateResolutions(batch.meta);

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
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let lastInsertError: string | null = null;
  const activityRows: { college_visit_id: string; activity_type: string; notes: string; created_by: string }[] = [];

  const buildInsert = (form: CollegeVisitFormValue) => {
    const payload = buildCollegeVisitPayload(form, { userId: auth.user!.id, isDbAdmin: true });
    return {
      ...payload,
      assigned_to: auth.user!.id,
      assigned_by: auth.user!.id,
      created_by: auth.user!.id,
      import_batch_id: id,
      source_reference: form.source_reference?.trim() || batch.file_name,
    };
  };

  const toInsert = (pendingRows ?? []).map((row) => ({
    importRowId: row.id as string,
    insert: buildInsert(row.payload as CollegeVisitFormValue),
  }));

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

  const { data: duplicateRows, error: dupError } = await admin
    .from("college_visit_import_rows")
    .select("id,row_number,payload,status,duplicate_of")
    .eq("batch_id", id)
    .eq("status", "duplicate")
    .order("row_number", { ascending: true });

  if (dupError) {
    lastInsertError = dupError.message;
  } else {
    for (const row of duplicateRows ?? []) {
      const importRowId = row.id as string;
      const resolution = resolutionForRow(duplicateResolutions, importRowId);
      const form = row.payload as CollegeVisitFormValue;

      if (resolution === "skip") {
        skipped += 1;
        await admin.from("college_visit_import_rows").update({ status: "skipped" }).eq("id", importRowId);
        continue;
      }

      if (resolution === "add") {
        const { results, lastError } = await insertCollegeVisitsBulk(admin, [buildInsert(form)]);
        if (lastError) lastInsertError = lastError;
        const result = results[0];
        if (result?.id) {
          created += 1;
          activityRows.push({
            college_visit_id: result.id,
            activity_type: "College Created",
            notes: `Import batch ${batch.file_name} (duplicate added as new)`,
            created_by: auth.user!.id,
          });
          await admin.from("college_visit_import_rows").update({ status: "imported" }).eq("id", importRowId);
        } else {
          failed += 1;
          await admin
            .from("college_visit_import_rows")
            .update({ status: "failed", error_message: lastError ?? "Insert failed." })
            .eq("id", importRowId);
        }
        continue;
      }

      const targetId = row.duplicate_of as string | null;
      if (!targetId) {
        skipped += 1;
        await admin
          .from("college_visit_import_rows")
          .update({ status: "skipped", error_message: "No existing college to update." })
          .eq("id", importRowId);
        continue;
      }

      const fullPayload = buildInsert(form);
      const { created_by: _c, assigned_to: _a, assigned_by: _b, ...updatePayload } = fullPayload;
      const upd = await updateCollegeVisitFromImport(admin, targetId, updatePayload);
      if (upd.error || !upd.id) {
        failed += 1;
        lastInsertError = upd.error ?? lastInsertError;
        await admin
          .from("college_visit_import_rows")
          .update({ status: "failed", error_message: upd.error ?? "Update failed." })
          .eq("id", importRowId);
      } else {
        updated += 1;
        activityRows.push({
          college_visit_id: upd.id,
          activity_type: "College Updated",
          notes: `Updated from import batch ${batch.file_name}`,
          created_by: auth.user!.id,
        });
        await admin.from("college_visit_import_rows").update({ status: "imported" }).eq("id", importRowId);
      }
    }
  }

  if (activityRows.length) {
    for (let i = 0; i < activityRows.length; i += 100) {
      await admin.from("college_visit_activities").insert(activityRows.slice(i, i + 100));
    }
  }

  const finalStatus = failed > 0 && created === 0 && updated === 0 ? "completed_with_errors" : failed > 0 ? "completed_with_errors" : "completed";
  const meta =
    batch.meta && typeof batch.meta === "object" && !Array.isArray(batch.meta)
      ? { ...(batch.meta as Record<string, unknown>), updated_count: updated }
      : { updated_count: updated };

  await admin
    .from("college_visit_import_batches")
    .update({
      status: created > 0 || updated > 0 ? finalStatus : failed > 0 ? "completed_with_errors" : "completed",
      created_count: created,
      skipped_count: skipped,
      failed_count: failed,
      error_message: failed > 0 ? lastInsertError : null,
      meta,
    })
    .eq("id", id);

  return NextResponse.json({
    created,
    updated,
    skipped,
    failed,
    status: created > 0 || updated > 0 ? finalStatus : failed > 0 ? "completed_with_errors" : "completed",
    error: failed > 0 ? lastInsertError ?? "One or more rows could not be inserted." : undefined,
    ok: created > 0 || updated > 0 || failed === 0,
  });
}
