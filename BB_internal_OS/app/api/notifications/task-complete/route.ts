import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { assignerDisplayFromProfile } from "@/lib/notifications/taskAssignmentEmail";
import { buildTaskCompletedEmailHtml } from "@/lib/notifications/taskCompletedEmail";

type Body = { taskId?: string; summary?: string };

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
  const summary = typeof body.summary === "string" ? body.summary.trim() : "";
  if (!taskId) return NextResponse.json({ error: "taskId is required." }, { status: 400 });
  if (summary.length < 3) {
    return NextResponse.json({ error: "Please enter a completion summary (at least a few characters)." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: task, error: taskError } = await supabase
    .from("tasks")
    .select("id,title,assigned_to,assigned_by,status,completion_summary")
    .eq("id", taskId)
    .maybeSingle();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found or you do not have access." }, { status: 404 });
  }

  if (task.assigned_to !== user.id) {
    return NextResponse.json({ error: "Only the assignee can complete this task from here." }, { status: 403 });
  }

  if (task.status === "Completed") {
    return NextResponse.json({ ok: true, skipped: true, reason: "Already completed" });
  }

  const { error: updateError } = await supabase
    .from("tasks")
    .update({
      status: "Completed",
      progress: 100,
      completion_summary: summary,
    })
    .eq("id", taskId)
    .eq("assigned_to", user.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  const assignerId = task.assigned_by as string | null | undefined;
  if (!assignerId || assignerId === user.id) {
    return NextResponse.json({ ok: true, notifySkipped: true });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: true, notifySkipped: true, reason: "RESEND_API_KEY not set" });
  }

  let assignerProfile: { full_name: string | null; email: string | null; role: string | null } | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin.from("profiles").select("email,full_name,role").eq("id", assignerId).maybeSingle();
    if (data) assignerProfile = data;
  } catch {
    const { data } = await supabase.from("profiles").select("email,full_name,role").eq("id", assignerId).maybeSingle();
    if (data) assignerProfile = data;
  }

  const assignerEmail = assignerProfile?.email?.trim().toLowerCase() || "";
  if (!assignerEmail.includes("@")) {
    return NextResponse.json({ ok: true, notifySkipped: true, reason: "Assigner has no email on profile" });
  }

  const { data: completer } = await supabase.from("profiles").select("full_name,email,role").eq("id", user.id).maybeSingle();
  const completerDisplay =
    assignerDisplayFromProfile(completer) || completer?.full_name?.trim() || completer?.email?.trim() || "Employee";
  const completerEmail = completer?.email?.trim() || user.email || "";

  const from = process.env.TASK_EMAIL_FROM?.trim() || "BB Internal OS <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";

  const html = buildTaskCompletedEmailHtml({
    completerName: completerDisplay,
    completerEmail: completerEmail || "—",
    taskTitle: String(task.title ?? "Task"),
    summary,
    appUrl: appUrl || "#",
  });

  const resend = new Resend(apiKey);
  const { error: sendError } = await resend.emails.send({
    from,
    to: [assignerEmail],
    subject: `Task completed: ${String(task.title ?? "Task").slice(0, 100)}`,
    html,
    replyTo: completerEmail.includes("@") ? completerEmail : undefined,
  });

  if (sendError) {
    return NextResponse.json(
      { error: sendError.message || "Email send failed.", taskUpdated: true },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
