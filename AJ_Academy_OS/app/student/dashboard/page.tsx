import Link from "next/link";
import { CalendarClock, ClipboardList } from "lucide-react";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { createClient } from "@/lib/supabase/server";
import { EmployeeTaskPreview } from "@/components/employee/EmployeeTaskPreview";
import { formatTimeIST, todayDateIST } from "@/lib/datetime";

export default async function StudentDashboardPage() {
  const { profile, user } = await getUserProfile();
  const supabase = await createClient();
  const uid = user?.id;
  const today = todayDateIST();

  let todayAttendance: {
    status: string | null;
    check_in_time: string | null;
    check_out_time: string | null;
  } | null = null;
  let openTasks = 0;

  if (uid) {
    const [attRes, openRes] = await Promise.all([
      supabase
        .from("attendance_records")
        .select("status,check_in_time,check_out_time")
        .eq("employee_id", uid)
        .eq("attendance_date", today)
        .maybeSingle(),
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", uid)
        .neq("status", "Completed"),
    ]);
    todayAttendance = attRes.data ?? null;
    openTasks = openRes.count ?? 0;
  }

  const firstName = (profile?.full_name ?? "Student").split(" ")[0];
  const attLabel = todayAttendance?.status?.trim() || "Not checked in yet";
  const punchLine =
    todayAttendance?.check_in_time || todayAttendance?.check_out_time
      ? `${formatTimeIST(todayAttendance.check_in_time)} → ${formatTimeIST(todayAttendance.check_out_time)}`
      : "Mark attendance from My Attendance";

  return (
    <div className="dashboard-section space-y-6">
      <header className="rounded-[24px] border border-[#e8dcc8] bg-gradient-to-br from-[#fffdf8] to-[#faf3e3] p-6 shadow-sm">
        <p className="text-sm font-medium text-[#a68b2e]">AJ Academy</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#3d3428] sm:text-3xl">
          Welcome, {firstName}
        </h1>
        <p className="mt-2 text-sm text-[#6b5d4d]">
          Track attendance and complete tasks assigned by your mentors and admins.
        </p>
      </header>

      <div className="stat-cards-grid">
        <article className="rounded-2xl border border-[#e8dcc8] bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#a68b2e]">Today attendance</p>
          <p className="mt-2 text-lg font-semibold capitalize text-[#3d3428]">{attLabel}</p>
          <p className="mt-1 text-sm text-[#6b5d4d]">{punchLine}</p>
        </article>
        <article className="rounded-2xl border border-[#e8dcc8] bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#a68b2e]">Open tasks</p>
          <p className="mt-2 text-3xl font-semibold text-[#3d3428]">{openTasks}</p>
        </article>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/student/attendance"
          className="flex items-start gap-3 rounded-2xl border border-[#e8dcc8] bg-white p-5 transition hover:border-[#c9a227]"
        >
          <CalendarClock className="mt-0.5 h-6 w-6 text-[#c9a227]" />
          <div>
            <h2 className="font-semibold text-[#3d3428]">My Attendance</h2>
            <p className="mt-1 text-sm text-[#6b5d4d]">Check in and check out for today.</p>
          </div>
        </Link>
        <Link
          href="/student/my-tasks"
          className="flex items-start gap-3 rounded-2xl border border-[#e8dcc8] bg-white p-5 transition hover:border-[#c9a227]"
        >
          <ClipboardList className="mt-0.5 h-6 w-6 text-[#c9a227]" />
          <div>
            <h2 className="font-semibold text-[#3d3428]">My Tasks</h2>
            <p className="mt-1 text-sm text-[#6b5d4d]">View and complete assigned work.</p>
          </div>
        </Link>
      </div>

      <section className="rounded-[24px] border border-[#e8dcc8] bg-white p-5">
        <h2 className="text-lg font-semibold text-[#3d3428]">Recent tasks</h2>
        <div className="mt-4">
          <EmployeeTaskPreview />
        </div>
      </section>
    </div>
  );
}
