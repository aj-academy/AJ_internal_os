import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildTaskAssignmentEmailHtml, assignerDisplayFromProfile } from "@/lib/notifications/taskAssignmentEmail";

type Body = {
  taskId?: string;
  /** Set when updating a task so we only email on real reassignment; omit on create. */
  previousAssigneeId?: string | null;
};

async function loadProfilesByIds(assignerId: string, assigneeId: string) {
  const ids = Array.from(new Set([assignerId, assigneeId]));
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.from("profiles").select("id,email,full_name,role").in("id", ids);
    if (!error && data?.length) return data;
  } catch {
    /* missing SUPABASE_SERVICE_ROLE_KEY — fall back to session client */
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("id,email,full_name,role").in("id", ids);
  if (error) return [];
  return data ?? [];
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
  if (!taskId) {
    return NextResponse.json({ error: "taskId is required." }, { status: 400 });
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
    .select("id,title,description,due_date,assigned_to")
    .eq("id", taskId)
    .maybeSingle();

  if (taskError || !task) {
    return NextResponse.json({ error: "Task not found or you do not have access." }, { status: 404 });
  }

  const assigneeId = task.assigned_to as string;
  const prev =
    body.previousAssigneeId === undefined || body.previousAssigneeId === null
      ? null
      : String(body.previousAssigneeId).trim() || null;

  const shouldNotify =
    prev === null
      ? assigneeId !== user.id
      : prev !== assigneeId;

  if (!shouldNotify) {
    return NextResponse.json({ ok: true, skipped: true, reason: "no_reassignment_or_self_assign" });
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: true, skipped: true, reason: "RESEND_API_KEY not set" });
  }

  const rows = await loadProfilesByIds(user.id, assigneeId);
  const assigner = rows.find((r) => r.id === user.id);
  const assignee = rows.find((r) => r.id === assigneeId);
  const to = assignee?.email?.trim().toLowerCase();
  if (!to?.includes("@")) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Assignee has no email on profile" });
  }

  const assignerEmail = (assigner?.email?.trim() || user.email || "").trim();
  const assignerDisplayName =
    assignerDisplayFromProfile(assigner ?? null) || assignerEmail || user.email || "Teammate";
  const from =
    process.env.TASK_EMAIL_FROM?.trim() || "BB Internal OS <onboarding@resend.dev>";
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";

  const html = buildTaskAssignmentEmailHtml({
    assignerDisplayName,
    assignerEmail: assignerEmail || "—",
    taskTitle: String(task.title ?? "Task"),
    taskDescription: task.description ?? null,
    dueDate: task.due_date ?? null,
    appUrl: appUrl || "#",
  });

  const resend = new Resend(apiKey);
  const { error: sendError } = await resend.emails.send({
    from,
    to: [to],
    subject: `You were assigned a task: ${String(task.title ?? "Task").slice(0, 120)}`,
    html,
    replyTo: assignerEmail.includes("@") ? assignerEmail : undefined,
  });

  if (sendError) {
    return NextResponse.json({ error: sendError.message || "Email send failed." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
