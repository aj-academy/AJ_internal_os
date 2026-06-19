import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import { PermissionRequestForm } from "@/components/employee/PermissionRequestForm";
import {
  PermissionRequestsTable,
  type PermissionRequestRow,
} from "@/components/employee/PermissionRequestsTable";

export default async function EmployeePermissionPage() {
  const { profile } = await requireRole(["employee"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("permission_requests")
    .select(
      "id,permission_date,from_time,to_time,permission_type,reason,description,status,rejection_reason,created_at",
    )
    .eq("employee_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<PermissionRequestRow[]>();

  const rows = data ?? [];
  const errorMessage = (error?.message ?? "").toLowerCase();
  const tableMissing =
    Boolean(errorMessage) &&
    (errorMessage.includes("could not find the table") ||
      errorMessage.includes("relation") ||
      errorMessage.includes("permission_requests"));

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <header className="space-y-2">
        <h2 className="text-3xl font-semibold text-slate-900">My Permission Requests</h2>
        <p className="text-sm text-slate-600">
          Submit permission requests for admin approval. Times display in India (IST).
        </p>
      </header>

      {tableMissing ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          Permission module is not initialized in database. Run `permission_requests_schema.sql` in
          Supabase SQL Editor, then refresh.
        </div>
      ) : null}

      <PermissionRequestForm />
      <PermissionRequestsTable rows={rows} employeeId={profile.id} />
    </section>
  );
}
