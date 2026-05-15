"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/auth/getUserProfile";

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

export async function handlePermissionAction(formData: FormData) {
  const profile = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  const rejectionReason = String(formData.get("rejection_reason") ?? "").trim();
  if (!id || !action) return;

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

  await supabase.from("permission_requests").update(payload).eq("id", id);
  revalidatePath("/admin/attendance");
  revalidatePath("/employee/permission");
}

export async function deletePermissionRequest(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const supabase = await createAttendanceSupabaseClient();
  await supabase.from("permission_requests").delete().eq("id", id);
  revalidatePath("/admin/attendance");
  revalidatePath("/employee/permission");
}

export async function bulkDeletePermissionRequests(formData: FormData) {
  await requireAdmin();
  const ids = parseIds(formData);
  if (!ids.length) return;

  const supabase = await createAttendanceSupabaseClient();
  await supabase.from("permission_requests").delete().in("id", ids);
  revalidatePath("/admin/attendance");
  revalidatePath("/employee/permission");
}

export async function deleteAttendanceRecord(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const supabase = await createAttendanceSupabaseClient();
  await supabase.from("attendance_records").delete().eq("id", id);
  revalidatePath("/admin/attendance");
}

export async function bulkDeleteAttendanceRecords(formData: FormData) {
  await requireAdmin();
  const ids = parseIds(formData);
  if (!ids.length) return;

  const supabase = await createAttendanceSupabaseClient();
  await supabase.from("attendance_records").delete().in("id", ids);
  revalidatePath("/admin/attendance");
}
