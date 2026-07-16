import Link from "next/link";
import { AppLogo } from "@/components/branding/AppLogo";
import { CalendarClock, CalendarDays, ClipboardList, Shield } from "lucide-react";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { createClient } from "@/lib/supabase/server";
import { EmployeeTaskPreview } from "@/components/employee/EmployeeTaskPreview";
import { TodaysRemindersWidget } from "@/components/reminders/TodaysRemindersWidget";
import { RedirectMyLeaveHash } from "@/components/employee/RedirectMyLeaveHash";
import { DashboardDefaultViewRedirect } from "@/components/settings/DashboardDefaultViewRedirect";
import { formatDisplayDate, formatTimeIST, todayDateIST } from "@/lib/datetime";

export default async function EmployeeDashboardPage() {
  const { profile, user } = await getUserProfile();
  const supabase = await createClient();

  const uid = user?.id;
  const today = todayDateIST();

  let todayAttendance: { status: string | null; check_in_time: string | null; check_out_time: string | null } | null = null;
  let totalTasks = 0;
  let openTasks = 0;
  let dueTodayTasks = 0;
  let overdueTasks = 0;
  let leavePending = 0;
  let permissionPending = 0;
  let policyCount = 0;

  if (uid) {
    const [attRes, totalRes, openRes, dueRes, overdueRes, leaveRes, permRes, polRes] = await Promise.all([
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
    ]);

    todayAttendance = attRes.data ?? null;
    totalTasks = totalRes.count ?? 0;
    openTasks = openRes.count ?? 0;
    dueTodayTasks = dueRes.count ?? 0;
    overdueTasks = overdueRes.count ?? 0;
    leavePending = leaveRes.count ?? 0;
    permissionPending = permRes.count ?? 0;
    policyCount = polRes.count ?? 0;
  }

  const attLabel = todayAttendance?.status?.trim() || "No check-in yet";
  const punchLine =
    todayAttendance?.check_in_time || todayAttendance?.check_out_time
      ? `${formatTimeIST(todayAttendance.check_in_time)} ΓåÆ ${formatTimeIST(todayAttendance.check_out_time)}`
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
      title: "Leave & Permission",
      description: "Submit permission requests and view leave history.",
      href: "/employee/leave",
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
    <section className="space-y-8 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <DashboardDefaultViewRedirect role="employee" />
      <RedirectMyLeaveHash />
      <div className="flex flex-col gap-2 border-b border-[#e8edf5] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">Workspace</p>
          <h2 className="mt-1 flex items-center gap-3 text-3xl font-semibold text-[#0f172a]">
            <AppLogo size={40} className="h-10 w-10 rounded-xl border border-[#dbe6f3] bg-white shadow-sm" priority />
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {firstName}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {formatDisplayDate(new Date().toISOString())} · One place for
            attendance, tasks, and requests.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={{ pathname: "/employee/leave" }}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#d4deea] bg-white px-5 text-sm font-medium text-[#334155] hover:bg-[#f8fbff]"
          >
            Leave & permission
          </Link>
          <Link
            href={{ pathname: "/employee/my-tasks" }}
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
              href={{ pathname: item.href }}
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

      <TodaysRemindersWidget href="/employee/reminders" />

      <EmployeeTaskPreview />
    </section>
  );
}
