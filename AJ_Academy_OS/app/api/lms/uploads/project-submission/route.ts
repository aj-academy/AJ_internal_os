import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

const BUCKET = "project-submissions";
const MAX_BYTES = 25 * 1024 * 1024;

function sanitize(name: string) {
  return name.trim().replace(/[^\w.\-()+ ]/g, "_").replace(/\s+/g, " ").slice(0, 160) || "file";
}

export async function POST(request: Request) {
  const gate = await verifySessionRole(new Set<UserRole>(["student"]));
  if (gate.response || !gate.user) return gate.response!;

  const form = await request.formData();
  const file = form.get("file");
  const projectId = String(form.get("project_id") || "");
  const milestoneId = String(form.get("milestone_id") || "");
  if (!(file instanceof File) || !projectId || !milestoneId) {
    return NextResponse.json({ error: "file, project_id, and milestone_id are required." }, { status: 400 });
  }
  if (file.size <= 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File must be between 1 byte and 25 MB." }, { status: 400 });
  }

  const lower = file.name.toLowerCase();
  const okExt =
    lower.endsWith(".pdf") ||
    lower.endsWith(".doc") ||
    lower.endsWith(".docx") ||
    lower.endsWith(".zip") ||
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".txt");
  if (!okExt) {
    return NextResponse.json({ error: "File type not allowed." }, { status: 400 });
  }

  const path = `projects/${projectId}/${milestoneId}/${gate.user.id}/${Date.now()}-${sanitize(file.name)}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) {
    return NextResponse.json(
      {
        error: error.message,
        hint: "Run lms_08_submissions_proctoring.sql to create project-submissions bucket.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    file: {
      name: file.name,
      path,
      mime: file.type || null,
      size: file.size,
      bucket: BUCKET,
    },
  });
}
