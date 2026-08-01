import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(new Set<UserRole>(["mentor", "admin", "super_admin"]));
  if (gate.response || !gate.user) return gate.response!;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    student_ids?: string[];
    idempotency_key?: string;
  };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lms_publish_assignment", {
    p_assignment_id: id,
    p_student_ids: body.student_ids?.length ? body.student_ids : null,
    p_idempotency_key: body.idempotency_key || `publish-${id}-${Date.now()}`,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ result: data });
}
