import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit, isValidUuid, requireStaffApiSession, trimString } from "@/lib/security";
import { sendPushNotification } from "@/lib/push/sendPushNotification";

export const runtime = "nodejs";

type Body = {
  type?: string;
  taskId?: string;
  visitId?: string;
  claimId?: string;
  permissionId?: string;
  leaveId?: string;
  userId?: string;
  title?: string;
  message?: string;
};

/**
 * Fire-and-forget push after a business action already succeeded.
 * Never rolls back the primary operation — errors are returned as soft failures.
 */
export async function POST(request: Request) {
  const limited = enforceRateLimit(request, "push:event", { limit: 60, windowMs: 60_000 });
  if (limited) return limited;

  const { response, user, profile } = await requireStaffApiSession();
  if (response || !user) return response!;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const type = trimString(body.type, 64);
  const role = String(profile?.role || "").toLowerCase();
  const isAdmin = role === "admin" || role === "super_admin";

  const supabase = await createClient();
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    admin = supabase;
  }

  try {
    if (type === "task_assigned" || type === "visit_assigned") {
      const taskId = trimString(body.taskId, 64);
      if (!isValidUuid(taskId)) {
        return NextResponse.json({ error: "Valid taskId required." }, { status: 400 });
      }
      const { data: task, error } = await admin
        .from("tasks")
        .select("id,title,assigned_to,assigned_by,assignment_type")
        .eq("id", taskId)
        .maybeSingle();
      if (error || !task?.assigned_to) {
        return NextResponse.json({ ok: false, skipped: true, error: error?.message || "Task not found." });
      }
      if (!isAdmin && task.assigned_by !== user.id) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      if (task.assigned_to === user.id) {
        return NextResponse.json({ ok: true, skipped: true });
      }

      const isCollege =
        type === "visit_assigned" ||
        String(task.assignment_type || "").toLowerCase().includes("college");

      const result = await sendPushNotification({
        userId: task.assigned_to,
        title: isCollege ? "New Customer Visit Assigned" : "New Task Assigned",
        message: isCollege
          ? "Open AJ OS to view the visit details."
          : "Open AJ OS to view the task details.",
        type: isCollege ? "visit_assigned" : "task_assigned",
        targetUrl: "/employee/my-tasks",
        entityType: "task",
        entityId: task.id,
        priority: "high",
        skipInAppInsert: true,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (type === "task_updated") {
      const taskId = trimString(body.taskId, 64);
      if (!isValidUuid(taskId)) {
        return NextResponse.json({ error: "Valid taskId required." }, { status: 400 });
      }
      const { data: task } = await admin
        .from("tasks")
        .select("id,assigned_to,assigned_by")
        .eq("id", taskId)
        .maybeSingle();
      if (!task?.assigned_to) {
        return NextResponse.json({ ok: false, skipped: true });
      }
      if (!isAdmin && task.assigned_by !== user.id && task.assigned_to !== user.id) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      if (task.assigned_to === user.id) {
        return NextResponse.json({ ok: true, skipped: true });
      }
      const result = await sendPushNotification({
        userId: task.assigned_to,
        title: "Task Updated",
        message: "One of your assigned tasks has been updated.",
        type: "task_updated",
        targetUrl: "/employee/my-tasks",
        entityType: "task",
        entityId: task.id,
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (type === "leave_approved" || type === "leave_rejected" || type === "permission_updated") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      const permissionId = trimString(body.permissionId || body.leaveId, 64);
      if (!isValidUuid(permissionId)) {
        return NextResponse.json({ error: "Valid permissionId required." }, { status: 400 });
      }
      const { data: row } = await admin
        .from("permission_requests")
        .select("id,employee_id,status")
        .eq("id", permissionId)
        .maybeSingle();
      if (!row?.employee_id) {
        return NextResponse.json({ ok: false, skipped: true });
      }
      const status = String(row.status || "").toLowerCase();
      const approved = status.includes("approv");
      const result = await sendPushNotification({
        userId: row.employee_id,
        title: approved ? "Leave Request Approved" : "Leave Request Updated",
        message: "Open AJ OS to view the updated request.",
        type: approved ? "leave_approved" : "leave_rejected",
        targetUrl: "/employee/leave",
        entityType: "permission_request",
        entityId: row.id,
        priority: "high",
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (type === "reimbursement_updated") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      const claimId = trimString(body.claimId, 64);
      if (!isValidUuid(claimId)) {
        return NextResponse.json({ error: "Valid claimId required." }, { status: 400 });
      }
      const { data: claim } = await admin
        .from("expense_claims")
        .select("id,employee_id,approval_status")
        .eq("id", claimId)
        .maybeSingle();
      if (!claim?.employee_id) {
        return NextResponse.json({ ok: false, skipped: true });
      }
      const result = await sendPushNotification({
        userId: claim.employee_id,
        title: "Reimbursement Request Updated",
        message: "Open AJ OS to view the latest status.",
        type: "reimbursement_updated",
        targetUrl: "/employee/reimbursement",
        entityType: "expense_claim",
        entityId: claim.id,
        priority: "high",
      });
      return NextResponse.json({ ok: true, ...result });
    }

    if (type === "announcement") {
      if (!isAdmin) {
        return NextResponse.json({ error: "Forbidden." }, { status: 403 });
      }
      const targetUserId = trimString(body.userId, 64);
      if (!isValidUuid(targetUserId)) {
        return NextResponse.json({ error: "Valid userId required for announcement." }, { status: 400 });
      }
      const title = trimString(body.title, 120) || "New Company Announcement";
      const message = trimString(body.message, 240) || "Open AJ OS to read the announcement.";
      const result = await sendPushNotification({
        userId: targetUserId,
        title,
        message,
        type: "announcement",
        targetUrl: "/employee/notifications",
        priority: "normal",
      });
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ error: "Unsupported event type." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : "Push event failed.",
    });
  }
}
