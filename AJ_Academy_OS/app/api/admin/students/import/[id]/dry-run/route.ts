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
import { validateImportRows } from "@/lib/students/importValidate";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST dry-run / validation — no profile writes.
 * body: { mode?, confirmUpdateExisting?, persist? }
 */
export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;
  const { id } = await ctx.params;
  const admin = createAdminClient();

  let body: { mode?: string; confirmUpdateExisting?: boolean; persist?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    /* optional body */
  }

  const mode = normalizeImportMode(body.mode);
  const persist = body.persist !== false;

  try {
    const { data: batch, error } = await admin.from("student_import_batches").select("*").eq("id", id).maybeSingle();
    if (error || !batch) throw new Error(error?.message || "Import batch not found.");
    if (!batch.mapping_confirmed_at || !batch.column_mapping || !Object.keys(batch.column_mapping).length) {
      return NextResponse.json({ error: "Confirm column mapping before dry run." }, { status: 400 });
    }

    // Idempotency warning
    const { data: prior } = await admin
      .from("student_import_batches")
      .select("id,batch_number,status,import_mode,uploaded_at")
      .eq("file_hash", batch.file_hash)
      .eq("import_mode", mode)
      .neq("id", id)
      .in("status", ["completed", "completed_with_errors", "importing"])
      .limit(5);

    await admin
      .from("student_import_batches")
      .update({ status: "validating", import_mode: mode })
      .eq("id", id);

    const { rows } = await loadBatchSpreadsheet(admin, batch);
    const { catalog } = await loadImportCatalog(admin);
    const existing = await loadExistingStudentIndex(admin);
    const { validated, summary } = validateImportRows({
      rows,
      mapping: batch.column_mapping as ColumnMapping,
      catalog,
      existing,
      mode,
    });

    if (persist) {
      await admin.from("student_import_rows").delete().eq("batch_id", id);
      const chunkSize = 200;
      for (let i = 0; i < validated.length; i += chunkSize) {
        const slice = validated.slice(i, i + chunkSize).map((r) => ({
          batch_id: id,
          row_number: r.rowNumber,
          raw: r.raw,
          mapped: r.mapped,
          severity: r.severity,
          issues: r.issues,
          action: r.action,
          idempotency_key: r.idempotencyKey,
          result_status: "pending",
        }));
        const { error: insErr } = await admin.from("student_import_rows").insert(slice);
        if (insErr) throw new Error(insErr.message);
      }

      await admin
        .from("student_import_batches")
        .update({
          status: "ready_for_review",
          import_mode: mode,
          dry_run_at: new Date().toISOString(),
          dry_run_summary: summary,
          confirm_update_existing: !!body.confirmUpdateExisting,
        })
        .eq("id", id);
    }

    await writeAuditLog(admin, {
      actorId: auth.user.id,
      action: "student_import.dry_run",
      module: "student_import",
      targetTable: "student_import_batches",
      targetId: id,
      newData: { mode, summary },
    }).catch(() => undefined);

    return NextResponse.json({
      summary,
      priorSameFingerprint: prior ?? [],
      rows: validated.slice(0, 100),
      totalValidated: validated.length,
      mode,
    });
  } catch (e) {
    try {
      await admin
        .from("student_import_batches")
        .update({ status: "failed", error_message: e instanceof Error ? e.message : "Dry run failed" })
        .eq("id", id);
    } catch {
      /* ignore */
    }
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "Dry run failed.",
        hint: "Run student_import_rows.sql if row table is missing.",
      },
      { status: 400 },
    );
  }
}
