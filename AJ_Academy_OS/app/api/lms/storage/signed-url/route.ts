import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

const ALLOWED_BUCKETS = new Set([
  "assignment-submissions",
  "project-submissions",
  "assignment-resources",
  "study-materials",
  "query-attachments",
  "test-proctoring",
]);

type Kind = "assignment_submission" | "project_submission" | "study_material" | "proctoring_media";

function filesContainPath(files: unknown, path: string): boolean {
  if (!Array.isArray(files)) return false;
  return files.some((f) => {
    if (!f || typeof f !== "object") return false;
    const rec = f as Record<string, unknown>;
    return String(rec.path || "") === path;
  });
}

export async function POST(request: Request) {
  const gate = await verifySessionRole(
    new Set<UserRole>(["student", "mentor", "admin", "super_admin"]),
  );
  if (gate.response || !gate.user) return gate.response!;

  const body = (await request.json().catch(() => ({}))) as {
    kind?: Kind;
    bucket?: string;
    path?: string;
    fileName?: string;
    submission_id?: string;
    material_id?: string;
    media_id?: string;
    download?: boolean;
  };

  const kind = body.kind;
  const path = String(body.path || "").trim();
  const bucket = String(body.bucket || "").trim();
  if (!kind || !path || !bucket) {
    return NextResponse.json({ error: "kind, bucket, and path are required." }, { status: 400 });
  }
  if (!ALLOWED_BUCKETS.has(bucket)) {
    return NextResponse.json({ error: "Bucket not allowed." }, { status: 400 });
  }
  if (path.includes("..") || path.startsWith("/")) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }

  const role = String(gate.profile?.role || "").toLowerCase();
  const isStaff = role === "mentor" || role === "admin" || role === "super_admin";
  const supabase = await createClient();

  if (kind === "assignment_submission") {
    if (!body.submission_id) {
      return NextResponse.json({ error: "submission_id is required." }, { status: 400 });
    }
    const { data: sub } = await supabase
      .from("lms_assignment_submissions")
      .select("id, student_id, assignment_id, files")
      .eq("id", body.submission_id)
      .maybeSingle();
    if (!sub || !filesContainPath(sub.files, path)) {
      return NextResponse.json({ error: "File not found on submission." }, { status: 404 });
    }
    if (role === "student" && sub.student_id !== gate.user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (role === "mentor") {
      const { data: a } = await supabase.from("lms_assignments").select("assigned_by,department_id,course_id,batch_id,module_id").eq("id", sub.assignment_id).maybeSingle();
      if (!a) return NextResponse.json({ error: "Assignment not found." }, { status: 404 });
      if (a.assigned_by !== gate.user.id) {
        const { data: allowed } = await supabase.rpc("lms_mentor_has_active_allocation", {
          p_mentor_id: gate.user.id,
          p_department_id: a.department_id,
          p_course_id: a.course_id,
          p_batch_id: a.batch_id,
          p_module_id: a.module_id,
        });
        if (!allowed) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }
    if (bucket !== "assignment-submissions") {
      return NextResponse.json({ error: "Bucket mismatch." }, { status: 400 });
    }
  } else if (kind === "project_submission") {
    if (!body.submission_id) {
      return NextResponse.json({ error: "submission_id is required." }, { status: 400 });
    }
    const { data: sub } = await supabase
      .from("lms_project_submissions")
      .select("id, student_id, project_id, files")
      .eq("id", body.submission_id)
      .maybeSingle();
    if (!sub || !filesContainPath(sub.files, path)) {
      return NextResponse.json({ error: "File not found on submission." }, { status: 404 });
    }
    if (role === "student" && sub.student_id !== gate.user.id) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (role === "mentor") {
      const { data: p } = await supabase
        .from("lms_projects")
        .select("assigned_by,guide_mentor_id,department_id,course_id,batch_id,module_id")
        .eq("id", sub.project_id)
        .maybeSingle();
      if (!p) return NextResponse.json({ error: "Project not found." }, { status: 404 });
      if (p.assigned_by !== gate.user.id && p.guide_mentor_id !== gate.user.id) {
        const { data: allowed } = await supabase.rpc("lms_mentor_has_active_allocation", {
          p_mentor_id: gate.user.id,
          p_department_id: p.department_id,
          p_course_id: p.course_id,
          p_batch_id: p.batch_id,
          p_module_id: p.module_id,
        });
        if (!allowed) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }
    if (bucket !== "project-submissions") {
      return NextResponse.json({ error: "Bucket mismatch." }, { status: 400 });
    }
  } else if (kind === "study_material") {
    if (!body.material_id) {
      return NextResponse.json({ error: "material_id is required." }, { status: 400 });
    }
    const { data: mat } = await supabase
      .from("lms_study_materials")
      .select("id, file_path, assigned_by, department_id, course_id, batch_id, module_id")
      .eq("id", body.material_id)
      .maybeSingle();
    if (!mat) return NextResponse.json({ error: "Material not found." }, { status: 404 });
    const materialPath = String(mat.file_path || "");
    if (!materialPath || materialPath !== path) {
      return NextResponse.json({ error: "Path does not match material." }, { status: 400 });
    }
    if (role === "student") {
      const { data: recip } = await supabase
        .from("lms_study_material_recipients")
        .select("id")
        .eq("material_id", body.material_id)
        .eq("student_id", gate.user.id)
        .maybeSingle();
      if (!recip) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    } else if (role === "mentor") {
      if (mat.assigned_by !== gate.user.id) {
        const { data: allowed } = await supabase.rpc("lms_mentor_has_active_allocation", {
          p_mentor_id: gate.user.id,
          p_department_id: mat.department_id,
          p_course_id: mat.course_id,
          p_batch_id: mat.batch_id,
          p_module_id: mat.module_id,
        });
        if (!allowed) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }
    if (bucket !== "study-materials") {
      return NextResponse.json({ error: "Bucket mismatch." }, { status: 400 });
    }
  } else if (kind === "proctoring_media") {
    if (!body.media_id) {
      return NextResponse.json({ error: "media_id is required." }, { status: 400 });
    }
    if (role === "student") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    const { data: media } = await supabase
      .from("lms_test_proctoring_media")
      .select("id, storage_path, test_id")
      .eq("id", body.media_id)
      .maybeSingle();
    if (!media || media.storage_path !== path) {
      return NextResponse.json({ error: "Media not found." }, { status: 404 });
    }
    if (role === "mentor") {
      const { data: t } = await supabase.from("lms_tests").select("assigned_by").eq("id", media.test_id).maybeSingle();
      if (!t || t.assigned_by !== gate.user.id) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
    }
    if (bucket !== "test-proctoring") {
      return NextResponse.json({ error: "Bucket mismatch." }, { status: 400 });
    }
  } else {
    return NextResponse.json({ error: "Unsupported kind." }, { status: 400 });
  }

  if (!isStaff && role !== "student" && role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = createAdminClient();
  const fileName = body.fileName?.trim() || path.split("/").pop() || "download";
  const { data: signed, error: signError } = await admin.storage.from(bucket).createSignedUrl(
    path,
    120,
    body.download ? { download: fileName } : undefined,
  );
  if (signError || !signed?.signedUrl) {
    return NextResponse.json({ error: signError?.message || "Could not create signed URL." }, { status: 400 });
  }

  return NextResponse.json({ url: signed.signedUrl, expiresIn: 120, fileName });
}
