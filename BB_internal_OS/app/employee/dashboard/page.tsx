import Link from "next/link";
import {
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  LayoutDashboard,
  Shield,
} from "lucide-react";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { createClient } from "@/lib/supabase/server";
import { EmployeeTaskPreview } from "@/components/employee/EmployeeTaskPreview";

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

function formatTime(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
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

export default async function EmployeeDashboardPage() {
  const { profile, user } = await getUserProfile();
  const supabase = await createClient();

  const uid = user?.id;
  const today = todayISO();
  const yearBoundary = `${new Date().getFullYear()}-01-01T00:00:00.000Z`;

  let todayAttendance: { status: string | null; check_in_time: string | null; check_out_time: string | null } | null = null;
  let totalTasks = 0;
  let openTasks = 0;
  let dueTodayTasks = 0;
  let overdueTasks = 0;
  let leavePending = 0;
  let permissionPending = 0;
  let policyCount = 0;
  let leaveHistory: LeaveRequestRow[] = [];
  let leaveYtdApproved = 0;
  let leaveYtdRejected = 0;
  let upcomingApproved: LeaveRequestRow[] = [];

  if (uid) {
    const [attRes, totalRes, openRes, dueRes, overdueRes, leaveRes, permRes, polRes, leaveListRes, apprYtdRes, rejYtdRes] = await Promise.all([
      supabase
        .from("attendance_records")
        .select("status,check_in_time,check_out_time")
        .eq("employee_id", uid)
        .eq("attendance_date", today)
        .maybeSingle(),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", uid),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_to", uid).neq("status", "Completed"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", uid)
        .eq("due_date", today)
        .neq("status", "Completed"),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", uid)
        .lt("due_date", today)
        .neq("status", "Completed"),
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("employee_id", uid).ilike("status", "pending"),
      supabase.from("permission_requests").select("id", { count: "exact", head: true }).eq("employee_id", uid).ilike("status", "pending"),
      supabase.from("company_policies").select("id", { count: "exact", head: true }),
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

    todayAttendance = attRes.data ?? null;
    totalTasks = totalRes.count ?? 0;
    openTasks = openRes.count ?? 0;
    dueTodayTasks = dueRes.count ?? 0;
    overdueTasks = overdueRes.count ?? 0;
    leavePending = leaveRes.count ?? 0;
    permissionPending = permRes.count ?? 0;
    policyCount = polRes.count ?? 0;
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

  const attLabel = todayAttendance?.status?.trim() || "No check-in yet";
  const punchLine =
    todayAttendance?.check_in_time || todayAttendance?.check_out_time
      ? `${formatTime(todayAttendance.check_in_time)} → ${formatTime(todayAttendance.check_out_time)}`
      : "Record attendance from My Attendance";

  const firstName = (profile?.full_name ?? "there").split(" ")[0];

  const shortcuts = [
    {
      title: "My Attendance",
      description: "Check in, check out, and daily status — same flow as dedicated attendance.",
      href: "/employee/attendance",
      icon: CalendarClock,
    },
    {
      title: "My Permission",
      description: "Request short leave from office; track approval status.",
      href: "/employee/permission",
      icon: ClipboardCheck,
    },
    {
      title: "My Leave",
      description: "Review requests, balances at a glance, and what is coming up next.",
      href: "/employee/dashboard#my-leave",
      icon: CalendarDays,
    },
    {
      title: "My Tasks",
      description: "Full task board: work assigned by admins appears when your user is the assignee.",
      href: "/employee/my-tasks",
      icon: ClipboardList,
    },
    {
      title: "Company Policies",
      description: "Read and acknowledge policies your company publishes.",
      href: "/employee/policies",
      icon: Shield,
    },
  ];

  return (
    <section className="space-y-8 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div className="flex flex-col gap-2 border-b border-[#e8edf5] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">Workspace</p>
          <h2 className="mt-1 flex items-center gap-2 text-3xl font-semibold text-[#0f172a]">
            <LayoutDashboard className="h-8 w-8 text-[#2563eb]" />
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {firstName}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · One place for
            attendance, tasks, and requests.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/employee/dashboard#my-leave"
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#d4deea] bg-white px-5 text-sm font-medium text-[#334155] hover:bg-[#f8fbff]"
          >
            Leave overview
          </Link>
          <Link
            href="/employee/my-tasks"
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#2563eb] px-5 text-sm font-medium text-white hover:bg-[#1d4ed8]"
          >
            My tasks
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[20px] border border-[#dbe6f3] bg-gradient-to-br from-[#f8fbff] to-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">Today&apos;s status</p>
          <p className="mt-2 text-2xl font-semibold capitalize text-[#0f172a]">{attLabel}</p>
          <p className="mt-1 text-xs text-[#64748b]">{punchLine}</p>
        </article>
        <article className="rounded-[20px] border border-[#dbe6f3] bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">Open tasks</p>
          <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{openTasks}</p>
          <p className="mt-1 text-xs text-[#64748b]">
            {totalTasks} total assigned · {dueTodayTasks} due today · {overdueTasks} overdue
          </p>
        </article>
        <article className="rounded-[20px] border border-[#dbe6f3] bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">Approvals</p>
          <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{leavePending + permissionPending}</p>
          <p className="mt-1 text-xs text-[#64748b]">
            {leavePending} leave pending · {permissionPending} permission pending
          </p>
        </article>
        <article className="rounded-[20px] border border-[#dbe6f3] bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">Policies</p>
          <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{policyCount}</p>
          <p className="mt-1 text-xs text-[#64748b]">Published company policies</p>
        </article>
      </div>

      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#64748b]">Quick navigation</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shortcuts.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="group flex gap-4 rounded-[20px] border border-[#dbe6f3] bg-[#fbfdff] p-4 shadow-sm transition hover:border-[#2563eb]/40 hover:shadow-md"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
                <item.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="font-semibold text-[#0f172a] group-hover:text-[#2563eb]">{item.title}</p>
                <p className="mt-1 text-sm text-[#64748b]">{item.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <section
        className="scroll-mt-24 overflow-hidden rounded-[22px] border border-[#dbe6f3] bg-gradient-to-br from-white to-[#f8fbff] shadow-sm"
        id="my-leave"
      >
        <div className="border-b border-[#e8edf5] bg-white/80 px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
                <CalendarDays className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Time off</p>
                <h3 className="mt-0.5 text-lg font-semibold text-[#0f172a]">My leave</h3>
                <p className="mt-1 max-w-2xl text-sm text-[#64748b]">
                  Track requests like in a typical HR dashboard: pipeline counts for this year, what is waiting on a manager, and your next
                  approved time away. Submit new leave through your company process (often HR or Attendance admin).
                </p>
              </div>
            </div>
            <Link
              href="/employee/permission"
              className="inline-flex h-9 items-center rounded-full border border-[#c9d8eb] bg-white px-4 text-sm font-medium text-[#1e3a8a] hover:bg-[#eff6ff]"
            >
              Permission & requests
            </Link>
          </div>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-800/90">Pending approval</p>
            <p className="mt-1 text-2xl font-semibold text-amber-950">{leavePending}</p>
            <p className="mt-1 text-xs text-amber-900/80">Open requests awaiting a decision</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/90">Approved (YTD)</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-950">{leaveYtdApproved}</p>
            <p className="mt-1 text-xs text-emerald-900/80">From requests submitted this calendar year</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/90 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-rose-800/90">Rejected (YTD)</p>
            <p className="mt-1 text-2xl font-semibold text-rose-950">{leaveYtdRejected}</p>
            <p className="mt-1 text-xs text-rose-900/80">Based on your recent request history</p>
          </div>
        </div>

        {upcomingApproved.length > 0 ? (
          <div className="border-t border-[#e8edf5] px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Upcoming approved leave</p>
            <ul className="mt-2 space-y-2">
              {upcomingApproved.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#dbe6f3] bg-white px-3 py-2 text-sm"
                >
                  <span className="font-medium text-[#0f172a]">{row.leave_type || "Leave"}</span>
                  <span className="text-[#64748b]">
                    {formatDateOnly(row.from_date)} → {formatDateOnly(row.to_date)}
                    {row.total_days != null ? ` · ${row.total_days} day(s)` : ""}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">Approved</span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="border-t border-[#e8edf5] px-5 py-4 text-sm text-[#64748b]">
            No upcoming approved leave in your recent records. Approved trips will appear here when end dates are today or later.
          </div>
        )}

        <div className="border-t border-[#e8edf5] px-5 pb-5 pt-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-[#0f172a]">Recent requests</p>
            <span className="text-xs text-[#64748b]">Newest first · last {leaveHistory.length} loaded</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-[#e8edf5] bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-[#f1f6fc] text-xs uppercase tracking-wide text-[#64748b]">
                <tr>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">From</th>
                  <th className="px-3 py-2">To</th>
                  <th className="px-3 py-2">Days</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eef2ff] text-[#334155]">
                {leaveHistory.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-[#64748b]">
                      No leave requests yet. When you submit time off, it will show here with live status.
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
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          {leaveHistory.some((r) => r.reason?.trim()) ? (
            <p className="mt-3 text-xs text-[#64748b]">Reasons are stored on each request; expand leave workflows in Attendance / HR admin when ready.</p>
          ) : null}
        </div>
      </section>

      <EmployeeTaskPreview />
    </section>
  );
}
