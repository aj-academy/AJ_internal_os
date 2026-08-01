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
    marks?: number;
    feedback?: string;
    status?: string;
  };

  if (body.marks == null || Number.isNaN(Number(body.marks))) {
    return NextResponse.json({ error: "marks is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lms_evaluate_project_submission", {
    p_submission_id: id,
    p_marks: Number(body.marks),
    p_feedback: body.feedback?.trim() || null,
    p_status: body.status || "evaluated",
  });

  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run AJ_Academy_SB/lms_09_project_milestones.sql." },
      { status: 500 },
    );
  }
  return NextResponse.json({ result: data });
}
