import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(new Set<UserRole>(["mentor", "admin", "super_admin"]));
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    awarded_marks?: number;
    feedback_text?: string;
    request_resubmission?: boolean;
  };

  if (body.awarded_marks == null || Number.isNaN(Number(body.awarded_marks))) {
    return NextResponse.json({ error: "awarded_marks is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lms_evaluate_assignment_submission", {
    p_submission_id: id,
    p_awarded_marks: Number(body.awarded_marks),
    p_feedback_text: body.feedback_text?.trim() || null,
    p_request_resubmission: Boolean(body.request_resubmission),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ result: data });
}
