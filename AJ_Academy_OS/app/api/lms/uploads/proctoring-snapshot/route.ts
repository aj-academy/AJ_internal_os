import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

const BUCKET = "test-proctoring";
const MAX_BYTES = 3 * 1024 * 1024;

export async function POST(request: Request) {
  const gate = await verifySessionRole(new Set<UserRole>(["student"]));
  if (gate.response || !gate.user) return gate.response!;

  const form = await request.formData();
  const file = form.get("file");
  const attemptId = String(form.get("attempt_id") || "");
  const captureReason = String(form.get("capture_reason") || "periodic_snapshot");
  const eventIdRaw = String(form.get("event_id") || "").trim();
  const eventId = eventIdRaw || null;

  if (!(file instanceof File) || !attemptId) {
    return NextResponse.json({ error: "file and attempt_id are required." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Snapshot must be between 1 byte and 3 MB." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: attempt } = await supabase
    .from("lms_test_attempts")
    .select("id, test_id, student_id, status")
    .eq("id", attemptId)
    .eq("student_id", gate.user.id)
    .maybeSingle();
  if (!attempt) {
    return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  }

  const path = `tests/${attempt.test_id}/attempts/${attemptId}/${gate.user.id}/${Date.now()}-${captureReason}.jpg`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json(
      {
        error: uploadError.message,
        hint: "Run lms_08_submissions_proctoring.sql for test-proctoring bucket.",
      },
      { status: 500 },
    );
  }

  const { data: mediaId, error: regError } = await supabase.rpc("lms_register_proctoring_media", {
    p_attempt_id: attemptId,
    p_storage_path: path,
    p_capture_reason: captureReason,
    p_event_id: eventId,
    p_mime_type: file.type || "image/jpeg",
    p_byte_size: file.size,
  });

  if (regError) {
    return NextResponse.json(
      {
        error: regError.message,
        path,
        hint: "Run AJ_Academy_SB/lms_11_proctoring_media.sql.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ mediaId, path, bucket: BUCKET });
}
