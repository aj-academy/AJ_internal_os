import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const { id } = await params;
  const admin = createAdminClient();

  const { data: batch, error: batchError } = await admin
    .from("college_visit_import_batches")
    .select(
      "id,batch_number,file_name,file_hash,row_count,new_count,duplicate_count,invalid_count,created_count,skipped_count,failed_count,status,uploaded_at,error_message,meta",
    )
    .eq("id", id)
    .maybeSingle();

  if (batchError) {
    return NextResponse.json({ error: batchError.message }, { status: 400 });
  }
  if (!batch) {
    return NextResponse.json({ error: "Import batch not found." }, { status: 404 });
  }

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
