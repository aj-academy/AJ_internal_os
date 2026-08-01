import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(new Set<UserRole>(["student"]));
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as { activity_type?: string };
  const activityType = String(body.activity_type || "open");

  const supabase = await createClient();
  const { error } = await supabase.rpc("lms_track_material_activity", {
    p_material_id: id,
    p_activity_type: activityType,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
