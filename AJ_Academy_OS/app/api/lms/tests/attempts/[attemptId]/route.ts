import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ attemptId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(new Set<UserRole>(["student"]));
  if (gate.response) return gate.response;

  const { attemptId } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    test_question_id?: string;
    selected_answer?: string | null;
    text_answer?: string | null;
    action?: "save" | "submit" | "heartbeat";
    reason?: string;
  };

  const supabase = await createClient();

  if (body.action === "submit") {
    const { data, error } = await supabase.rpc("lms_submit_test_attempt", {
      p_attempt_id: attemptId,
      p_reason: body.reason || "manual",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ result: data });
  }

  if (body.action === "heartbeat") {
    const { error } = await supabase
      .from("lms_test_attempts")
      .update({ last_heartbeat_at: new Date().toISOString() })
      .eq("id", attemptId)
      .eq("student_id", gate.user!.id)
      .eq("locked", false);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, serverNow: new Date().toISOString() });
  }

  if (!body.test_question_id) {
    return NextResponse.json({ error: "test_question_id is required to save." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("lms_save_test_answer", {
    p_attempt_id: attemptId,
    p_test_question_id: body.test_question_id,
    p_selected_answer: body.selected_answer ?? null,
    p_text_answer: body.text_answer ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ result: data, serverNow: new Date().toISOString() });
}
