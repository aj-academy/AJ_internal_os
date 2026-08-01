import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { writeAuditLog } from "@/lib/hr/auditLog";
import type { ColumnMapping } from "@/lib/students/importMapping";
import {
  loadBatchSpreadsheet,
  loadExistingStudentIndex,
  loadImportCatalog,
  normalizeImportMode,
} from "@/lib/students/importBatchService";
import { validateImportRows, type ValidatedImportRow } from "@/lib/students/importValidate";
import { executeStudentImport } from "@/lib/students/importExecute";

export const runtime = "nodejs";
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** POST confirm import — creates/updates students server-side in batches. */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;
  const { id } = await ctx.params;
  const admin = createAdminClient();

  let body: { mode?: string; confirmUpdateExisting?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    /* optional */
  }

  try {
    const { data: batch, error } = await admin.from("student_import_batches").select("*").eq("id", id).maybeSingle();
    if (error || !batch) throw new Error(error?.message || "Import batch not found.");
    if (!batch.storage_path) throw new Error("No stored file for this batch.");
    if (!batch.mapping_confirmed_at) {
      return NextResponse.json({ error: "Confirm column mapping first." }, { status: 400 });
    }

    const mode = normalizeImportMode(body.mode || batch.import_mode);
    const confirmUpdateExisting =
      body.confirmUpdateExisting === true || batch.confirm_update_existing === true;

    if ((mode === "update_only" || mode === "create_and_update") && !confirmUpdateExisting) {
      return NextResponse.json(
        { error: "Updating existing students requires confirmUpdateExisting: true." },
        { status: 400 },
      );
    }

    // Fingerprint idempotency: same hash+mode already completed
    const { data: completedPrior } = await admin
      .from("student_import_batches")
      .select("id,batch_number")
      .eq("file_hash", batch.file_hash)
      .eq("import_mode", mode)
      .in("status", ["completed", "completed_with_errors"])
      .neq("id", id)
      .limit(1)
      .maybeSingle();

    if (completedPrior?.id) {
      return NextResponse.json(
        {
          error: `This file appears already imported as ${completedPrior.batch_number}. Cancel or upload a corrected file.`,
          priorBatchId: completedPrior.id,
        },
        { status: 409 },
      );
    }

    await admin
      .from("student_import_batches")
      .update({
        status: "importing",
        import_mode: mode,
        confirm_update_existing: confirmUpdateExisting,
        started_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", id);

    const { rows } = await loadBatchSpreadsheet(admin, batch);
    const catalogBundle = await loadImportCatalog(admin);
    const existing = await loadExistingStudentIndex(admin);
    const { validated } = validateImportRows({
      rows,
      mapping: batch.column_mapping as ColumnMapping,
      catalog: catalogBundle.catalog,
      existing,
      mode,
    });

    const exec = await executeStudentImport({
      admin,
      actorId: auth.user.id,
      mode,
      confirmUpdateExisting,
      rows: validated as ValidatedImportRow[],
      catalog: catalogBundle,
    });

    // Persist row results
    for (const rr of exec.rowResults) {
      await admin
        .from("student_import_rows")
        .update({
          result_status: rr.resultStatus,
          result_profile_id: rr.profileId ?? null,
          result_message: rr.message ?? null,
        })
        .eq("batch_id", id)
        .eq("row_number", rr.rowNumber);
    }

    const finalStatus =
      exec.failed > 0 && exec.created + exec.updated > 0
        ? "completed_with_errors"
        : exec.failed > 0 && exec.created + exec.updated === 0
          ? "failed"
          : "completed";

    const { data: updated } = await admin
      .from("student_import_batches")
      .update({
        status: finalStatus,
        created_count: exec.created,
        updated_count: exec.updated,
        skipped_count: exec.skipped,
        failed_count: exec.failed,
        completed_at: new Date().toISOString(),
        error_message: finalStatus === "failed" ? "All eligible rows failed." : null,
      })
      .eq("id", id)
      .select("*")
      .single();

    // Notify admin
    try {
      await admin.from("in_app_notifications").insert({
        user_id: auth.user.id,
        type: "student_import",
        title: finalStatus === "completed" ? "Student import completed" : "Student import finished with issues",
        body: `${batch.batch_number}: created ${exec.created}, updated ${exec.updated}, skipped ${exec.skipped}, failed ${exec.failed}.`,
        link_path: "/admin/students/bulk-import",
        meta: { batchId: id, status: finalStatus },
      });
    } catch {
      /* optional */
    }

    await writeAuditLog(admin, {
      actorId: auth.user.id,
      action: "student_import.execute",
      module: "student_import",
      targetTable: "student_import_batches",
      targetId: id,
      newData: {
        created: exec.created,
        updated: exec.updated,
        skipped: exec.skipped,
        failed: exec.failed,
        status: finalStatus,
      },
    }).catch(() => undefined);

    return NextResponse.json({
      batch: updated,
      result: {
        created: exec.created,
        updated: exec.updated,
        skipped: exec.skipped,
        failed: exec.failed,
      },
      allocateMentorsNext: exec.created + exec.updated > 0,
    });
  } catch (e) {
    try {
      await admin
        .from("student_import_batches")
        .update({
          status: "failed",
          error_message: e instanceof Error ? e.message : "Import failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", id);
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import failed." },
      { status: 500 },
    );
  }
}
