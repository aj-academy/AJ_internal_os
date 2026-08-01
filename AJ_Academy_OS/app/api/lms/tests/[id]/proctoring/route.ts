import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Mentor/admin: attempts + proctoring events/media for a test */
export async function GET(_request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(new Set<UserRole>(["mentor", "admin", "super_admin"]));
  if (gate.response || !gate.user) return gate.response!;

  const { id } = await ctx.params;
  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();

  const { data: test, error: testError } = await supabase.from("lms_tests").select("*").eq("id", id).maybeSingle();
  if (testError || !test) {
    return NextResponse.json({ error: testError?.message || "Test not found." }, { status: testError ? 500 : 404 });
  }

  if (role === "mentor" && test.assigned_by !== gate.user.id) {
    const { data: allowed } = await supabase.rpc("lms_mentor_has_active_allocation", {
      p_mentor_id: gate.user.id,
      p_department_id: test.department_id,
      p_course_id: test.course_id,
      p_batch_id: test.batch_id,
      p_module_id: test.module_id,
    });
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
  }

  const { data: attempts } = await supabase
    .from("lms_test_attempts")
    .select("*")
    .eq("test_id", id)
    .order("started_at", { ascending: false })
    .limit(200);

  const attemptIds = (attempts ?? []).map((a) => a.id);
  const studentIds = [...new Set((attempts ?? []).map((a) => a.student_id))];

  const [{ data: events }, { data: media }, { data: profiles }] = await Promise.all([
    attemptIds.length
      ? supabase
          .from("lms_test_proctoring_events")
          .select("*")
          .in("attempt_id", attemptIds)
          .order("created_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    attemptIds.length
      ? supabase
          .from("lms_test_proctoring_media")
          .select("*")
          .in("attempt_id", attemptIds)
          .order("captured_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    studentIds.length
      ? supabase.from("profiles").select("id,full_name,email").in("id", studentIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
  ]);

  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]));

  return NextResponse.json({
    test,
    attempts: (attempts ?? []).map((a) => ({ ...a, student_name: nameMap.get(a.student_id) })),
    events: events ?? [],
    media: media ?? [],
  });
}
