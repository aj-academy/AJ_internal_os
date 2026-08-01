import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";
import { writeAuditLog } from "@/lib/hr/auditLog";
import { analyzeColumnMapping, validateManualMapping, type ColumnMapping } from "@/lib/students/importMapping";
import { loadBatchSpreadsheet } from "@/lib/students/importBatchService";
import { STUDENT_IMPORT_ALL_COLUMNS } from "@/lib/students/importTemplate";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

async function getBatch(admin: ReturnType<typeof createAdminClient>, id: string) {
  const { data, error } = await admin.from("student_import_batches").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Import batch not found.");
  return data;
}

/** GET mapping analysis + first 10 preview rows */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;
  const { id } = await ctx.params;
  const admin = createAdminClient();

  try {
    const batch = await getBatch(admin, id);
    const { headers, rows } = await loadBatchSpreadsheet(admin, batch);
    const analysis = analyzeColumnMapping(headers);
    const mapping = (batch.column_mapping && Object.keys(batch.column_mapping).length
      ? batch.column_mapping
      : analysis.autoMapping) as ColumnMapping;

    return NextResponse.json({
      batch: {
        id: batch.id,
        batch_number: batch.batch_number,
        status: batch.status,
        file_name: batch.file_name,
        data_row_count: batch.data_row_count,
        column_mapping: mapping,
        mapping_confirmed_at: batch.mapping_confirmed_at,
      },
      headers,
      analysis,
      targets: STUDENT_IMPORT_ALL_COLUMNS,
      previewRows: rows.slice(0, 10),
      totalRows: rows.length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Mapping load failed." },
      { status: 400 },
    );
  }
}

/** PUT confirm column mapping */
export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;
  const { id } = await ctx.params;
  const admin = createAdminClient();

  let body: { mapping?: ColumnMapping };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const mapping = body.mapping || {};
  const check = validateManualMapping(mapping);
  if (!check.ok) {
    return NextResponse.json({ error: check.errors.join(" "), missingRequired: check.missingRequired }, { status: 400 });
  }

  try {
    const batch = await getBatch(admin, id);
    const { data, error } = await admin
      .from("student_import_batches")
      .update({
        column_mapping: mapping,
        mapping_confirmed_at: new Date().toISOString(),
        mapping_confirmed_by: auth.user.id,
        status: batch.status === "uploaded" || batch.status === "validating" ? "ready_for_review" : batch.status,
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    await writeAuditLog(admin, {
      actorId: auth.user.id,
      action: "student_import.mapping_confirm",
      module: "student_import",
      targetTable: "student_import_batches",
      targetId: id,
      newData: { mapping },
    }).catch(() => undefined);

    return NextResponse.json({ batch: data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save mapping." },
      { status: 400 },
    );
  }
}
