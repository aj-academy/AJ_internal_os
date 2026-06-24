"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";

export type PermissionFormState = {
  status: "idle" | "success" | "error";
  message?: string;
};

const permissionTypes = new Set([
  "Late Coming",
  "Early Leaving",
  "Personal Permission",
  "Medical Permission",
  "Client Visit",
  "Half Day",
]);

export async function submitPermissionRequest(
  _prev: PermissionFormState,
  formData: FormData,
): Promise<PermissionFormState> {
  const { profile } = await requireRole(["employee", "student"]);
  const supabase = await createClient();

  const permissionDate = String(formData.get("permission_date") ?? "").trim();
  const fromTime = String(formData.get("from_time") ?? "").trim();
  const toTime = String(formData.get("to_time") ?? "").trim();
  const permissionType = String(formData.get("permission_type") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  if (!permissionDate || !permissionType || !reason) {
    return { status: "error", message: "Please fill required fields (date, type, reason)." };
  }

  if (!permissionTypes.has(permissionType)) {
    return { status: "error", message: "Please select a valid permission type." };
  }

  const duplicateWindow = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: recentDuplicate } = await supabase
    .from("permission_requests")
    .select("id")
    .eq("employee_id", profile.id)
    .eq("permission_date", permissionDate)
    .eq("permission_type", permissionType)
    .eq("status", "pending")
    .gte("created_at", duplicateWindow)
    .limit(1);

  if (recentDuplicate?.length) {
    return {
      status: "error",
      message: "A similar permission request was just submitted. Please wait before submitting again.",
    };
  }

  const { error } = await supabase.from("permission_requests").insert({
    employee_id: profile.id,
    permission_date: permissionDate,
    from_time: fromTime || null,
    to_time: toTime || null,
    permission_type: permissionType,
    reason,
    description: description || null,
    status: "pending",
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/employee/leave");
  revalidatePath("/employee/permission");
  revalidatePath("/student/leave");
  revalidatePath("/student/permission");
  revalidatePath("/admin/attendance");

  return { status: "success", message: "Permission request submitted successfully." };
}
