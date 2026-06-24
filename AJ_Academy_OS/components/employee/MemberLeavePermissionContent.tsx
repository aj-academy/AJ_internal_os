import Link from "next/link";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { requireRole } from "@/lib/auth/requireRole";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types/profile";
import { EmployeeMyLeaveContent } from "@/components/employee/EmployeeMyLeaveContent";
import { PermissionRequestForm } from "@/components/employee/PermissionRequestForm";
import { PermissionRequestsTable, type PermissionRequestRow } from "@/components/employee/PermissionRequestsTable";

type MemberLeavePermissionContentProps = {
  role: Extract<UserRole, "employee" | "student">;
  dashboardHref: string;
};

export async function MemberLeavePermissionContent({
  role,
  dashboardHref,
}: MemberLeavePermissionContentProps) {
  const { profile } = await requireRole([role]);
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
    <section className="space-y-8 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8edf5] pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">Requests</p>
          <h2 className="mt-1 text-3xl font-semibold text-[#0f172a]">Leave &amp; Permission</h2>
          <p className="mt-1 text-sm text-[#64748b]">
            Submit permission requests and view leave summary in one place.
          </p>
        </div>
        <Link
          href={dashboardHref}
          className="inline-flex items-center gap-2 rounded-full border border-[#d4deea] bg-white px-4 py-2 text-sm font-medium text-[#334155] hover:bg-[#f8fbff]"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </header>

      <div id="permission" className="scroll-mt-24 space-y-6 rounded-[22px] border border-[#dbe6f3] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 border-b border-[#e8edf5] pb-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
            <ClipboardCheck className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-[#0f172a]">Permission requests</h3>
            <p className="text-sm text-[#64748b]">
              Request short permission for late coming, early leaving, and more. Times display in India (IST).
            </p>
          </div>
        </div>

        {tableMissing ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
            Permission module is not initialized in database. Run permission SQL in Supabase, then refresh.
          </div>
        ) : null}

        <PermissionRequestForm />
        <PermissionRequestsTable rows={rows} employeeId={profile.id} />
      </div>

      <div id="leave" className="scroll-mt-24">
        <EmployeeMyLeaveContent embedded dashboardHref={dashboardHref} />
      </div>
    </section>
  );
}
