import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
  const admin = createAdminClient();
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

  // Use service-role reads for review payload so mentors/admins can always
  // see real attempts/events/media after passing the explicit authz checks above.
  const { data: attempts, error: attemptsError } = await admin
    .from("lms_test_attempts")
    .select("id,test_id,student_id,status,score,max_score,started_at,submitted_at,server_started_at,attempt_number,result_status")
    .eq("test_id", id)
    .order("submitted_at", { ascending: false, nullsFirst: false })
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(500);

  const { data: recipients, error: recipientsError } = await admin
    .from("lms_test_recipients")
    .select("id,student_id,status,attempts_used,updated_at")
    .eq("test_id", id)
    .order("updated_at", { ascending: false })
    .limit(1000);

  if (attemptsError || recipientsError) {
    return NextResponse.json(
      {
        error: attemptsError?.message || recipientsError?.message || "Could not load scores.",
        hint: "Check service role key and that lms_test_attempts / lms_test_recipients exist.",
      },
      { status: 500 },
    );
  }

  const attemptRows = attempts ?? [];
  const recipientRows = recipients ?? [];
  const attemptIds = attemptRows.map((a) => a.id);
  const studentIds = [
    ...new Set([...attemptRows.map((a) => a.student_id), ...recipientRows.map((r) => r.student_id)]),
  ];

  const [{ data: events }, { data: media }, { data: profiles }] = await Promise.all([
    attemptIds.length
      ? admin
          .from("lms_test_proctoring_events")
          .select("*")
          .in("attempt_id", attemptIds)
          .order("created_at", { ascending: false })
          .limit(1000)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    attemptIds.length
      ? admin
          .from("lms_test_proctoring_media")
          .select("*")
          .in("attempt_id", attemptIds)
          .order("captured_at", { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    studentIds.length
      ? admin.from("profiles").select("id,full_name,email").in("id", studentIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; email: string | null }[] }),
  ]);

  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]));

  const latestAttemptByStudent = new Map<
    string,
    { score: number | null; max_score: number | null; status: string | null; submitted_at: string | null }
  >();
  for (const a of attemptRows) {
    if (!a.student_id || latestAttemptByStudent.has(a.student_id)) continue;
    latestAttemptByStudent.set(a.student_id, {
      score: a.score != null ? Number(a.score) : null,
      max_score: a.max_score != null ? Number(a.max_score) : null,
      status: a.status ?? null,
      submitted_at: a.submitted_at ?? null,
    });
  }

  return NextResponse.json({
    test,
    recipients: recipientRows.map((r) => {
      const latest = latestAttemptByStudent.get(r.student_id);
      return {
        ...r,
        student_name: nameMap.get(r.student_id),
        latest_score: latest?.score ?? null,
        latest_max_score: latest?.max_score ?? null,
        latest_attempt_status: latest?.status ?? null,
        latest_submitted_at: latest?.submitted_at ?? null,
      };
    }),
    attempts: attemptRows.map((a) => ({ ...a, student_name: nameMap.get(a.student_id) })),
    events: events ?? [],
    media: media ?? [],
  });
}
