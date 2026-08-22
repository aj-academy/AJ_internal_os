import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminApiSession } from "@/lib/security/auth/requireAdminApi";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireAdminApiSession();
  if (auth.response || !auth.user) return auth.response!;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("college_visit_import_batches")
    .select(
      "id,batch_number,file_name,file_hash,row_count,new_count,duplicate_count,invalid_count,created_count,skipped_count,failed_count,status,uploaded_at,error_message",
    )
    .order("uploaded_at", { ascending: false })
    .limit(200);

  if (error) {
    const missing = error.message.toLowerCase().includes("college_visit_import_batches");
    return NextResponse.json(
      {
        batches: [],
        error: missing ? undefined : error.message,
        hint: missing ? "Run AJ_Academy_SB/college_visit_import_batches.sql in Supabase SQL Editor." : undefined,
      },
      { status: missing ? 200 : 400 },
    );
  }

  return NextResponse.json({ batches: data ?? [] });
}
