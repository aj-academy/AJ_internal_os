import Link from "next/link";
import { AppLogo } from "@/components/branding/AppLogo";
import { CalendarClock, CalendarDays, ClipboardList, GraduationCap, MessageCircle, Shield, User } from "lucide-react";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { createClient } from "@/lib/supabase/server";
import { EmployeeTaskPreview } from "@/components/employee/EmployeeTaskPreview";
import { formatTimeIST, todayDateIST } from "@/lib/datetime";

export default async function StudentDashboardPage() {
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
  let counsellingUpcoming = 0;
  let mentorName: string | null = null;
  const course = profile?.course?.trim() || null;
  const batch = profile?.department?.trim() || null;

  if (uid) {
    const mentorId = (profile as { assigned_mentor_id?: string | null })?.assigned_mentor_id ?? null;

    const [
      attRes,
      totalRes,
      openRes,
      dueRes,
      overdueRes,
      leaveRes,
      permRes,
      polRes,
      counselRes,
      mentorRes,
    ] = await Promise.all([
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
        .from("counselling_sessions")
        .select("id", { count: "exact", head: true })
        .eq("student_id", uid)
        .eq("status", "scheduled")
        .gte("session_at", new Date().toISOString()),
      mentorId
        ? supabase.from("profiles").select("full_name,email").eq("id", mentorId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    todayAttendance = attRes.data ?? null;
    totalTasks = totalRes.count ?? 0;
    openTasks = openRes.count ?? 0;
    dueTodayTasks = dueRes.count ?? 0;
    overdueTasks = overdueRes.count ?? 0;
    leavePending = leaveRes.count ?? 0;
    permissionPending = permRes.count ?? 0;
    policyCount = polRes.count ?? 0;
    counsellingUpcoming = counselRes.count ?? 0;
    if (mentorRes.data) {
      mentorName = mentorRes.data.full_name || mentorRes.data.email || null;
    }
  }

  const attLabel = todayAttendance?.status?.trim() || "No check-in yet";
  const punchLine =
    todayAttendance?.check_in_time || todayAttendance?.check_out_time
      ? `${formatTimeIST(todayAttendance.check_in_time)} → ${formatTimeIST(todayAttendance.check_out_time)}`
      : "Record attendance from My Attendance";

  const firstName = (profile?.full_name ?? "Student").split(" ")[0];

  const shortcuts = [
    {
      title: "My Attendance",
      description: "Check in, check out, GPS location, and work summary — same as employee flow.",
      href: "/student/attendance",
      icon: CalendarClock,
    },
    {
      title: "Leave & Permission",
      description: "Submit permission requests and view leave history.",
      href: "/student/leave",
      icon: CalendarDays,
    },
    {
      title: "My Tasks",
      description: "View and complete work assigned by mentors and admins.",
      href: "/student/my-tasks",
      icon: ClipboardList,
    },
    {
      title: "My Counselling",
      description: "Upcoming and past counselling sessions.",
      href: "/student/counselling",
      icon: MessageCircle,
    },
    {
      title: "Company Policies",
      description: "Read and acknowledge policies published by admin.",
      href: "/student/policies",
      icon: Shield,
    },
    {
      title: "My Profile",
      description: "Update your contact details and academic information.",
      href: "/student/profile",
      icon: User,
    },
  ];

  return (
    <section className="space-y-8 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div className="flex flex-col gap-2 border-b border-[#e8edf5] pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#64748b]">Student workspace</p>
          <h2 className="mt-1 flex items-center gap-3 text-3xl font-semibold text-[#0f172a]">
            <AppLogo size={40} className="h-10 w-10 rounded-xl border border-[#dbe6f3] bg-white shadow-sm" priority />
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, {firstName}
          </h2>
          <p className="mt-1 text-sm text-[#64748b]">
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" })} · Attendance,
            tasks, counselling, and requests in one place.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/student/leave"
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#d4deea] bg-white px-5 text-sm font-medium text-[#334155] hover:bg-[#f8fbff]"
          >
            Leave & permission
          </Link>
          <Link
            href="/student/my-tasks"
            className="inline-flex h-10 items-center justify-center rounded-full bg-[#2563eb] px-5 text-sm font-medium text-white hover:bg-[#1d4ed8]"
          >
            My tasks
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-[20px] border border-[#dbe6f3] bg-gradient-to-br from-[#f8fbff] to-white p-5 shadow-sm sm:col-span-2 xl:col-span-2">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#eff6ff] text-[#2563eb]">
              <GraduationCap className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">Course & batch</p>
              <p className="mt-1 text-lg font-semibold text-[#0f172a]">{course || "Course not assigned"}</p>
              <p className="mt-1 text-sm text-[#64748b]">
                Batch / department: <span className="font-medium text-[#334155]">{batch || "—"}</span>
                {mentorName ? (
                  <>
                    {" "}
                    · Mentor: <span className="font-medium text-[#334155]">{mentorName}</span>
                  </>
                ) : null}
              </p>
            </div>
          </div>
        </article>
        <article className="rounded-[20px] border border-[#dbe6f3] bg-gradient-to-br from-[#f8fbff] to-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">Today&apos;s status</p>
          <p className="mt-2 text-2xl font-semibold capitalize text-[#0f172a]">{attLabel}</p>
          <p className="mt-1 text-xs text-[#64748b]">{punchLine}</p>
        </article>
        <article className="rounded-[20px] border border-[#dbe6f3] bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">Counselling</p>
          <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{counsellingUpcoming}</p>
          <p className="mt-1 text-xs text-[#64748b]">Upcoming scheduled sessions</p>
        </article>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <article className="rounded-[20px] border border-[#dbe6f3] bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">Quick link</p>
          <Link href="/student/counselling" className="mt-2 inline-block text-sm font-semibold text-[#2563eb] hover:underline">
            View counselling history →
          </Link>
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

      <EmployeeTaskPreview tasksHref="/student/my-tasks" />
    </section>
  );
}
