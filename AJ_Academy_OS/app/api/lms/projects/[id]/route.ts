import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(
    new Set<UserRole>(["student", "mentor", "admin", "super_admin"]),
  );
  if (gate.response || !gate.user) return gate.response!;

  const { id } = await ctx.params;
  const supabase = await createClient();
  const role = String(gate.profile?.role || "").toLowerCase();

  const { data: project, error } = await supabase.from("lms_projects").select("*").eq("id", id).maybeSingle();
  if (error || !project) {
    return NextResponse.json({ error: error?.message || "Project not found." }, { status: error ? 500 : 404 });
  }

  const { data: milestones } = await supabase
    .from("lms_project_milestones")
    .select("*")
    .eq("project_id", id)
    .order("sort_order", { ascending: true });

  if (role === "student") {
    const { data: recipient } = await supabase
      .from("lms_project_recipients")
      .select("*")
      .eq("project_id", id)
      .eq("student_id", gate.user.id)
      .maybeSingle();
    if (!recipient) {
      return NextResponse.json({ error: "You are not assigned this project." }, { status: 403 });
    }
    const { data: submissions } = await supabase
      .from("lms_project_submissions")
      .select("*")
      .eq("project_id", id)
      .eq("student_id", gate.user.id)
      .order("submitted_at", { ascending: false });
    return NextResponse.json({
      project,
      recipient,
      milestones: milestones ?? [],
      submissions: submissions ?? [],
    });
  }

  const { data: recipients } = await supabase
    .from("lms_project_recipients")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });
  const { data: submissions } = await supabase
    .from("lms_project_submissions")
    .select("*")
    .eq("project_id", id)
    .order("submitted_at", { ascending: false });

  const studentIds = [
    ...new Set([
      ...(recipients ?? []).map((r) => r.student_id),
      ...(submissions ?? []).map((s) => s.student_id),
    ]),
  ];
  const { data: profiles } = studentIds.length
    ? await supabase.from("profiles").select("id,full_name,email").in("id", studentIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name || p.email || p.id.slice(0, 8)]));

  return NextResponse.json({
    project,
    milestones: milestones ?? [],
    recipients: (recipients ?? []).map((r) => ({ ...r, student_name: nameMap.get(r.student_id) })),
    submissions: (submissions ?? []).map((s) => ({ ...s, student_name: nameMap.get(s.student_id) })),
  });
}

export async function POST(request: Request, ctx: Ctx) {
  const gate = await verifySessionRole(new Set<UserRole>(["student"]));
  if (gate.response) return gate.response;

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as {
    milestone_id?: string;
    text_response?: string;
    github_url?: string;
    demo_url?: string;
    files?: unknown[];
  };

  if (!body.milestone_id) {
    return NextResponse.json({ error: "milestone_id is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("lms_submit_project_milestone", {
    p_project_id: id,
    p_milestone_id: body.milestone_id,
    p_text_response: body.text_response?.trim() || null,
    p_github_url: body.github_url?.trim() || null,
    p_demo_url: body.demo_url?.trim() || null,
    p_files: body.files ?? [],
  });

  if (error) {
    return NextResponse.json(
      { error: error.message, hint: "Run AJ_Academy_SB/lms_project_milestones.sql." },
      { status: 500 },
    );
  }
  return NextResponse.json({ result: data });
}
