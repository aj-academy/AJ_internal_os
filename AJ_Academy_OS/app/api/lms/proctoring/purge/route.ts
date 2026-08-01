import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

const BUCKET = "test-proctoring";

/** Admin: list expired media, delete storage objects, then delete DB rows. */
export async function POST() {
  const gate = await verifySessionRole(new Set<UserRole>(["admin", "super_admin"]));
  if (gate.response) return gate.response;

  const supabase = await createClient();
  const { data: expired, error } = await supabase.rpc("lms_list_expired_proctoring_media", {
    p_limit: 200,
  });
  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run AJ_Academy_SB/lms_11_proctoring_media.sql." },
      { status: 500 },
    );
  }

  const rows = (expired ?? []) as { media_id: string; storage_path: string }[];
  if (!rows.length) {
    return NextResponse.json({ deleted: 0, storageRemoved: 0 });
  }

  const admin = createAdminClient();
  const paths = rows.map((r) => r.storage_path).filter(Boolean);
  let storageRemoved = 0;
  if (paths.length) {
    const { data: removed, error: rmError } = await admin.storage.from(BUCKET).remove(paths);
    if (rmError) {
      return NextResponse.json({ error: rmError.message, listed: rows.length }, { status: 500 });
    }
    storageRemoved = removed?.length ?? paths.length;
  }

  const { data: deleted, error: delError } = await supabase.rpc("lms_delete_proctoring_media_rows", {
    p_media_ids: rows.map((r) => r.media_id),
  });
  if (delError) {
    return NextResponse.json({ error: delError.message, storageRemoved }, { status: 500 });
  }

  return NextResponse.json({ deleted: deleted ?? rows.length, storageRemoved });
}
