import Link from "next/link";
import { ArrowLeft, Mail, User } from "lucide-react";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { createClient } from "@/lib/supabase/server";

function formatDateOnly(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

export default async function EmployeeProfilePage() {
  const { profile, user } = await getUserProfile();
  const supabase = await createClient();
  const uid = user?.id;

  let employeeCode: string | null = null;
  let workPhone: string | null = null;
  let joinedAt: string | null = null;
  let managerName: string | null = null;
  let managerEmail: string | null = null;

  if (uid) {
    const edRes = await supabase
      .from("employee_details")
      .select("employee_code, phone, joined_at, manager_id")
      .eq("employee_id", uid)
      .maybeSingle();
    if (!edRes.error && edRes.data) {
      const ed = edRes.data as {
        employee_code: string | null;
        phone: string | null;
        joined_at: string | null;
        manager_id: string | null;
      };
      employeeCode = ed.employee_code;
      workPhone = ed.phone;
      joinedAt = ed.joined_at;
      if (ed.manager_id) {
        const { data: mgr } = await supabase.from("profiles").select("full_name, email").eq("id", ed.manager_id).maybeSingle();
        managerName = (mgr?.full_name as string | null) ?? null;
        managerEmail = (mgr?.email as string | null) ?? null;
      }
    }
  }

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8edf5] pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">Employee record</p>
          <h1 className="mt-1 text-2xl font-semibold text-[#0f172a]">My profile</h1>
          <p className="mt-1 text-sm text-[#64748b]">HR and directory details for your account.</p>
        </div>
        <Link
          href="/employee/dashboard"
          className="inline-flex items-center gap-2 rounded-full border border-[#d4deea] bg-white px-4 py-2 text-sm font-medium text-[#334155] hover:bg-[#f8fbff]"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to dashboard
        </Link>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="flex gap-4 rounded-[20px] border border-[#dbe6f3] bg-[#f8fbff] p-5 lg:max-w-md lg:flex-1">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white text-xl font-semibold text-[#2563eb] ring-1 ring-[#dbe6f3]">
            {(profile?.full_name ?? "E")
              .split(" ")
              .map((s) => s[0])
              .join("")
              .slice(0, 2)
              .toUpperCase()}
          </span>
          <div>
            <h2 className="text-xl font-semibold text-[#0f172a]">{profile?.full_name ?? "Employee"}</h2>
            <p className="mt-2 flex items-center gap-2 text-sm text-[#64748b]">
              <Mail className="h-4 w-4 shrink-0" />
              {user?.email ?? profile?.email ?? "—"}
            </p>
            <p className="mt-3 text-xs text-[#94a3b8]">
              User ID <span className="font-mono text-[#475569]">{uid ?? "—"}</span>
            </p>
          </div>
        </div>

        <dl className="grid flex-1 gap-3 text-sm text-[#334155] sm:grid-cols-2">
          <div className="rounded-xl border border-[#e8edf5] bg-white p-4 shadow-sm">
            <dt className="text-xs font-medium text-[#94a3b8]">Employee code</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">{employeeCode ?? "—"}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white p-4 shadow-sm">
            <dt className="text-xs font-medium text-[#94a3b8]">Department</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">{profile?.department ?? "—"}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white p-4 shadow-sm">
            <dt className="text-xs font-medium text-[#94a3b8]">Designation</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">{profile?.designation ?? "—"}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white p-4 shadow-sm">
            <dt className="text-xs font-medium text-[#94a3b8]">Work phone</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">{workPhone ?? "—"}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white p-4 shadow-sm">
            <dt className="text-xs font-medium text-[#94a3b8]">Joined company</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">{formatDateOnly(joinedAt)}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white p-4 shadow-sm">
            <dt className="text-xs font-medium text-[#94a3b8]">Record since</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">{formatDateOnly(profile?.created_at)}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white p-4 shadow-sm sm:col-span-2">
            <dt className="text-xs font-medium text-[#94a3b8]">Reporting manager</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">
              {managerName ?? "—"}
              {managerEmail ? <span className="mt-0.5 block text-sm font-normal text-[#64748b]">{managerEmail}</span> : null}
            </dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white p-4 shadow-sm">
            <dt className="text-xs font-medium text-[#94a3b8]">Employment status</dt>
            <dd className="mt-1 font-semibold capitalize text-[#0f172a]">{profile?.status ?? "—"}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white p-4 shadow-sm">
            <dt className="text-xs font-medium text-[#94a3b8]">Portal role</dt>
            <dd className="mt-1 font-semibold capitalize text-[#0f172a]">{profile?.role ?? "employee"}</dd>
          </div>
        </dl>
      </div>

      <p className="flex items-start gap-2 rounded-xl border border-[#dbe6f3] bg-[#fbfdff] px-4 py-3 text-sm text-[#64748b]">
        <User className="mt-0.5 h-4 w-4 shrink-0 text-[#94a3b8]" />
        Updates to your legal name, department, manager, or employment status are done by HR or an administrator in Employee Master.
      </p>
    </section>
  );
}
