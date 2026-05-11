import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { createClient } from "@/lib/supabase/server";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateOnly(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

function normalizeLeaveStatus(raw: string | null | undefined) {
  const v = (raw || "").toLowerCase();
  if (v.includes("pend")) return "pending";
  if (v.includes("approv")) return "approved";
  if (v.includes("reject")) return "rejected";
  return v || "other";
}

type LeaveRequestRow = {
  id: string;
  leave_type: string | null;
  from_date: string | null;
  to_date: string | null;
  total_days: number | null;
  status: string | null;
  reason: string | null;
  created_at: string;
};

export async function EmployeeMyLeaveContent({ showBackLink = false }: { showBackLink?: boolean }) {
  const { user } = await getUserProfile();
  const supabase = await createClient();
  const uid = user?.id;
  const today = todayISO();
  const yearBoundary = `${new Date().getFullYear()}-01-01T00:00:00.000Z`;

  let leavePending = 0;
  let leaveHistory: LeaveRequestRow[] = [];
  let leaveYtdApproved = 0;
  let leaveYtdRejected = 0;
  let upcomingApproved: LeaveRequestRow[] = [];

  if (uid) {
    const [leaveRes, leaveListRes, apprYtdRes, rejYtdRes] = await Promise.all([
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("employee_id", uid).ilike("status", "pending"),
      supabase
        .from("leave_requests")
        .select("id,leave_type,from_date,to_date,total_days,status,reason,created_at")
        .eq("employee_id", uid)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", uid)
        .gte("created_at", yearBoundary)
        .ilike("status", "%approved%"),
      supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", uid)
        .gte("created_at", yearBoundary)
        .ilike("status", "%reject%"),
    ]);

    leavePending = leaveRes.count ?? 0;
    leaveHistory = (leaveListRes.data ?? []) as LeaveRequestRow[];
    leaveYtdApproved = apprYtdRes.count ?? 0;
    leaveYtdRejected = rejYtdRes.count ?? 0;

    upcomingApproved = leaveHistory
      .filter((row) => {
        if (normalizeLeaveStatus(row.status) !== "approved") return false;
        const end = row.to_date || row.from_date;
        return end ? end >= today : false;
      })
      .sort((a, b) => (a.from_date || "").localeCompare(b.from_date || ""))
      .slice(0, 3);
  }

  return (
    <div className="rounded-[22px] border border-[#dbe6f3] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#e8edf5] pb-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-[#0f172a]">My leave</h1>
            <p className="text-sm text-[#64748b]">Your leave requests from the company system.</p>
          </div>
        </div>
        {showBackLink ? (
          <Link
            href={{ pathname: "/employee/dashboard" }}
            className="inline-flex items-center gap-2 rounded-full border border-[#d4deea] bg-white px-4 py-2 text-sm font-medium text-[#334155] hover:bg-[#f8fbff]"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-amber-800/90">Pending</p>
          <p className="mt-1 text-2xl font-semibold text-amber-950">{leavePending}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/90">Approved (YTD)</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-950">{leaveYtdApproved}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-rose-800/90">Rejected (YTD)</p>
          <p className="mt-1 text-2xl font-semibold text-rose-950">{leaveYtdRejected}</p>
        </div>
      </div>

      {upcomingApproved.length > 0 ? (
        <div className="mt-4 rounded-xl border border-[#e8edf5] bg-[#fbfdff] px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Next approved</p>
          <p className="mt-1 text-sm text-[#334155]">
            {upcomingApproved.map((row, index) => (
              <span key={row.id}>
                {index > 0 ? " · " : ""}
                {row.leave_type || "Leave"}: {formatDateOnly(row.from_date)}–{formatDateOnly(row.to_date)}
              </span>
            ))}
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        <p className="mb-2 text-sm font-semibold text-[#0f172a]">Requests</p>
        <div className="overflow-x-auto rounded-xl border border-[#e8edf5]">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[#f1f6fc] text-xs uppercase tracking-wide text-[#64748b]">
              <tr>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">From</th>
                <th className="px-3 py-2">To</th>
                <th className="px-3 py-2">Days</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2ff] text-[#334155]">
              {leaveHistory.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[#64748b]">
                    No leave requests yet.
                  </td>
                </tr>
              ) : (
                leaveHistory.map((row) => {
                  const s = normalizeLeaveStatus(row.status);
                  const badge =
                    s === "approved"
                      ? "bg-emerald-100 text-emerald-800"
                      : s === "rejected"
                        ? "bg-rose-100 text-rose-800"
                        : "bg-amber-100 text-amber-900";
                  const reason = row.reason?.trim() || "—";
                  const reasonShort = reason.length > 48 ? `${reason.slice(0, 48)}…` : reason;
                  return (
                    <tr key={row.id}>
                      <td className="px-3 py-2 font-medium text-[#0f172a]">{row.leave_type || "—"}</td>
                      <td className="px-3 py-2">{formatDateOnly(row.from_date)}</td>
                      <td className="px-3 py-2">{formatDateOnly(row.to_date)}</td>
                      <td className="px-3 py-2">{row.total_days ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${badge}`}>
                          {row.status || "Pending"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[#64748b]">{formatDateOnly(row.created_at)}</td>
                      <td className="max-w-[200px] truncate px-3 py-2 text-[#64748b]" title={reason !== "—" ? row.reason ?? undefined : undefined}>
                        {reasonShort}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
