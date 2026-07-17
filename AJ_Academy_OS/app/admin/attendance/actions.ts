"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/auth/getUserProfile";

export type AttendanceActionResult = { ok: true } | { ok: false; error: string };

async function createAttendanceSupabaseClient() {
  try {
    return createAdminClient();
  } catch {
    return await createClient();
  }
}

async function requireAdmin() {
  const { profile } = await getUserProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
    throw new Error("Unauthorized");
  }
  return profile;
}

function parseIds(formData: FormData): string[] {
  return formData
    .getAll("ids")
    .map((value) => String(value).trim())
    .filter(Boolean);
}

/** Remove attendance rows after clearing linked work_summaries (FK: work_summaries_attendance_id_fkey). */
async function deleteAttendanceRecordsByIds(
  supabase: Awaited<ReturnType<typeof createAttendanceSupabaseClient>>,
  ids: string[],
): Promise<AttendanceActionResult> {
  const { error: summaryError } = await supabase.from("work_summaries").delete().in("attendance_id", ids);
  if (summaryError) return { ok: false, error: summaryError.message };

  const { error } = await supabase.from("attendance_records").delete().in("id", ids);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export async function handlePermissionAction(formData: FormData): Promise<AttendanceActionResult> {
  try {
    const profile = await requireAdmin();

    const id = String(formData.get("id") ?? "");
    const action = String(formData.get("action") ?? "");
    const rejectionReason = String(formData.get("rejection_reason") ?? "").trim();
    if (!id || !action) return { ok: false, error: "Missing request id or action." };

    const supabase = await createAttendanceSupabaseClient();
    const payload: {
      status: string;
      approved_by: string;
      approved_at: string;
      rejection_reason?: string;
    } = {
      status: action,
      approved_by: profile.id,
      approved_at: new Date().toISOString(),
    };

    if (action === "rejected") {
      payload.rejection_reason = rejectionReason || "Rejected by admin";
    } else {
      payload.rejection_reason = "";
    }

    const { error } = await supabase.from("permission_requests").update(payload).eq("id", id);
    if (error) return { ok: false, error: error.message };

    // Non-blocking FCM — approval already succeeded
    try {
      const { sendPushNotification } = await import("@/lib/push/sendPushNotification");
      const { data: row } = await supabase
        .from("permission_requests")
        .select("employee_id,status")
        .eq("id", id)
        .maybeSingle();
      if (row?.employee_id) {
        const approved = String(row.status || "").toLowerCase().includes("approv");
        void sendPushNotification({
          userId: row.employee_id,
          title: approved ? "Leave Request Approved" : "Leave Request Updated",
          message: "Open AJ OS to view the updated request.",
          type: approved ? "leave_approved" : "leave_rejected",
          targetUrl: "/employee/leave",
          entityType: "permission_request",
          entityId: id,
          priority: "high",
        });
      }
    } catch {
      /* push must not fail the approval */
    }

    revalidatePath("/admin/attendance");
    revalidatePath("/employee/leave");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Permission action failed." };
  }
}

export async function deletePermissionRequest(formData: FormData): Promise<AttendanceActionResult> {
  try {
    await requireAdmin();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, error: "Missing record id." };

    const supabase = await createAttendanceSupabaseClient();
    const { error } = await supabase.from("permission_requests").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/attendance");
    revalidatePath("/admin/attendance");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}

export async function bulkDeletePermissionRequests(formData: FormData): Promise<AttendanceActionResult> {
  try {
    await requireAdmin();
    const ids = parseIds(formData);
    if (!ids.length) return { ok: false, error: "Select at least one row." };

    const supabase = await createAttendanceSupabaseClient();
    const { error } = await supabase.from("permission_requests").delete().in("id", ids);
    if (error) return { ok: false, error: error.message };

    revalidatePath("/admin/attendance");
    revalidatePath("/admin/attendance");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bulk delete failed." };
  }
}

export async function deleteAttendanceRecord(formData: FormData): Promise<AttendanceActionResult> {
  try {
    await requireAdmin();
    const id = String(formData.get("id") ?? "").trim();
    if (!id) return { ok: false, error: "Missing record id." };

    const supabase = await createAttendanceSupabaseClient();
    const result = await deleteAttendanceRecordsByIds(supabase, [id]);
    if (!result.ok) return result;

    revalidatePath("/admin/attendance");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}

export async function bulkDeleteAttendanceRecords(formData: FormData): Promise<AttendanceActionResult> {
  try {
    await requireAdmin();
    const ids = parseIds(formData);
    if (!ids.length) return { ok: false, error: "Select at least one row." };

    const supabase = await createAttendanceSupabaseClient();
    const result = await deleteAttendanceRecordsByIds(supabase, ids);
    if (!result.ok) return result;

    revalidatePath("/admin/attendance");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bulk delete failed." };
  }
}
