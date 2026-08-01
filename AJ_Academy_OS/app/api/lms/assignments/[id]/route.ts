import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Student/mentor assignment detail + submissions */
export async function GET(_request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(
    new Set<UserRole>(["student", "mentor", "admin", "super_admin"]),
  );
  if (gate.response || !gate.user) return gate.response!;

  const { id } = await ctx.params;
  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();

  const { data: assignment, error } = await supabase.from("lms_assignments").select("*").eq("id", id).maybeSingle();
  if (error || !assignment) {
    return NextResponse.json({ error: error?.message || "Assignment not found." }, { status: error ? 500 : 404 });
  }

  if (role === "student") {
    await supabase.rpc("lms_mark_assignment_viewed", { p_assignment_id: id });
    const { data: recipient } = await supabase
      .from("lms_assignment_recipients")
      .select("*")
      .eq("assignment_id", id)
      .eq("student_id", gate.user.id)
      .maybeSingle();
    const { data: submissions } = await supabase
      .from("lms_assignment_submissions")
      .select("*")
      .eq("assignment_id", id)
      .eq("student_id", gate.user.id)
      .order("submitted_at", { ascending: false });
    const { data: evaluations } = await supabase
      .from("lms_assignment_evaluations")
      .select("*")
      .eq("assignment_id", id)
      .eq("student_id", gate.user.id)
      .order("evaluated_at", { ascending: false });
    return NextResponse.json({ assignment, recipient, submissions: submissions ?? [], evaluations: evaluations ?? [] });
  }

  const { data: recipients } = await supabase
    .from("lms_assignment_recipients")
    .select("*")
    .eq("assignment_id", id)
    .order("created_at", { ascending: false });
  const { data: submissions } = await supabase
    .from("lms_assignment_submissions")
    .select("*")
    .eq("assignment_id", id)
    .order("submitted_at", { ascending: false });

  const studentIds = [...new Set((recipients ?? []).map((r) => r.student_id))];
  const { data: profiles } = studentIds.length
    ? await supabase.from("profiles").select("id,full_name,email").in("id", studentIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]));

  return NextResponse.json({
    assignment,
    recipients: (recipients ?? []).map((r) => ({ ...r, student_name: nameMap.get(r.student_id) })),
    submissions: (submissions ?? []).map((s) => ({ ...s, student_name: nameMap.get(s.student_id) })),
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(new Set<UserRole>(["student"]));
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    text_response?: string;
    link_url?: string;
    files?: unknown[];
    declaration?: boolean;
  };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lms_submit_assignment", {
    p_assignment_id: id,
    p_text_response: body.text_response?.trim() || null,
    p_link_url: body.link_url?.trim() || null,
    p_files: body.files ?? [],
    p_declaration: Boolean(body.declaration),
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ result: data });
}
