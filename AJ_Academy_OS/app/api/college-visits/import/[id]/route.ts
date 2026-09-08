import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadImportBatchForActor, requireCollegeVisitImportActor } from "@/lib/college-visits/importAccess";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireCollegeVisitImportActor();
  if (auth.response || !auth.user) return auth.response!;

  const { id } = await params;
  const admin = createAdminClient();
  const loaded = await loadImportBatchForActor(admin, id, auth.user.id, auth.isAdmin);

  if (!loaded.batch) {
    return NextResponse.json({ error: loaded.error }, { status: loaded.status });
  }
  const batch = loaded.batch;

  const { data: rows, error: rowsError } = await admin
    .from("college_visit_import_rows")
    .select("id,row_number,payload,status,duplicate_of,error_message")
    .eq("batch_id", id)
    .order("row_number", { ascending: true });

  if (rowsError) {
    return NextResponse.json({ error: rowsError.message }, { status: 400 });
  }

  return NextResponse.json({ batch, rows: rows ?? [] });
}
