import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(new Set<UserRole>(["student"]));
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lms_start_test_attempt", { p_test_id: id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const attemptId = (data as { attempt_id?: string })?.attempt_id;
  if (!attemptId) return NextResponse.json({ error: "Could not start attempt.", result: data }, { status: 500 });

  const { data: attempt } = await supabase.from("lms_test_attempts").select("*").eq("id", attemptId).single();
  const { data: aq } = await supabase
    .from("lms_test_attempt_questions")
    .select("sort_order, test_question_id, options_snapshot, lms_test_questions(id,question,question_type,marks,options)")
    .eq("attempt_id", attemptId)
    .order("sort_order");

  const questions = (aq ?? []).map((row) => {
    const q = row.lms_test_questions as unknown as {
      id: string;
      question: string;
      question_type: string;
      marks: number;
      options: { id: string; label: string }[];
    } | null;
    return {
      test_question_id: row.test_question_id,
      sort_order: row.sort_order,
      question: q?.question,
      question_type: q?.question_type,
      marks: q?.marks,
      options: (row.options_snapshot as { id: string; label: string }[])?.length
        ? row.options_snapshot
        : q?.options || [],
    };
  });

  return NextResponse.json({
    result: data,
    attempt,
    questions,
    serverNow: new Date().toISOString(),
  });
}
