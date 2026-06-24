import Link from "next/link";
import { CalendarClock, ClipboardList, MessageCircle, UserCircle } from "lucide-react";
import { MentorStudentRoster } from "@/components/mentor/MentorStudentRoster";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { createClient } from "@/lib/supabase/server";
import { formatTimeIST, todayDateIST } from "@/lib/datetime";

export default async function MentorDashboardPage() {
  const { profile, user } = await getUserProfile();
  const supabase = await createClient();
  const uid = user?.id;
  const today = todayDateIST();
  const department = profile?.department?.trim() || null;

  let openTasks = 0;
  let assignedTasks = 0;
  let todayAttendance: { status: string | null; check_in_time: string | null; check_out_time: string | null } | null =
    null;

  if (uid) {
    const [openRes, assignedRes, attRes] = await Promise.all([
      supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assigned_to", uid)
        .neq("status", "Completed"),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_by", uid),
      supabase
        .from("attendance_records")
        .select("status,check_in_time,check_out_time")
        .eq("employee_id", uid)
        .eq("attendance_date", today)
        .maybeSingle(),
    ]);
    openTasks = openRes.count ?? 0;
    assignedTasks = assignedRes.count ?? 0;
    todayAttendance = attRes.data ?? null;
  }

  const firstName = (profile?.full_name ?? "Mentor").split(" ")[0];
  const attLabel = todayAttendance?.status?.trim() || "Not checked in";
  const punchLine =
    todayAttendance?.check_in_time || todayAttendance?.check_out_time
      ? `${formatTimeIST(todayAttendance.check_in_time)} → ${formatTimeIST(todayAttendance.check_out_time)}`
      : "Record attendance from My Attendance";

  return (
    <div className="dashboard-section space-y-6">
      <header className="rounded-[24px] border border-[#e8dcc8] bg-gradient-to-br from-[#fffdf8] to-[#faf3e3] p-6 shadow-sm">
        <p className="text-sm font-medium text-[#a68b2e]">AJ Academy</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#3d3428] sm:text-3xl">Welcome, {firstName}</h1>
        <p className="mt-2 text-sm text-[#6b5d4d]">
          Attendance, tasks assigned to you, student assignments, and counselling in one place.
        </p>
        {department ? (
          <p className="mt-1 text-xs font-medium text-[#a68b2e]">Department: {department}</p>
        ) : (
          <p className="mt-1 text-xs text-amber-800">
            Ask admin to set your department in User Master to assign tasks and view your batch roster.
          </p>
        )}
      </header>

      <div className="stat-cards-grid">
        <article className="rounded-2xl border border-[#e8dcc8] bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#a68b2e]">Today&apos;s attendance</p>
          <p className="mt-2 text-lg font-semibold capitalize text-[#3d3428]">{attLabel}</p>
          <p className="mt-1 text-xs text-[#6b5d4d]">{punchLine}</p>
        </article>
        <article className="rounded-2xl border border-[#e8dcc8] bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#a68b2e]">My open tasks</p>
          <p className="mt-2 text-3xl font-semibold text-[#3d3428]">{openTasks}</p>
          <p className="mt-1 text-xs text-[#6b5d4d]">Assigned to you by admins</p>
        </article>
        <article className="rounded-2xl border border-[#e8dcc8] bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#a68b2e]">Tasks I assigned</p>
          <p className="mt-2 text-3xl font-semibold text-[#3d3428]">{assignedTasks}</p>
          <p className="mt-1 text-xs text-[#6b5d4d]">Work you gave to students</p>
        </article>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          href="/mentor/attendance"
          className="flex items-start gap-3 rounded-2xl border border-[#e8dcc8] bg-white p-5 transition hover:border-[#c9a227]"
        >
          <CalendarClock className="mt-0.5 h-6 w-6 text-[#c9a227]" />
          <div>
            <h2 className="font-semibold text-[#3d3428]">My Attendance</h2>
            <p className="mt-1 text-sm text-[#6b5d4d]">Check in, check out, GPS, and work summary.</p>
          </div>
        </Link>
        <Link
          href="/mentor/assign-tasks"
          className="flex items-start gap-3 rounded-2xl border border-[#e8dcc8] bg-white p-5 transition hover:border-[#c9a227]"
        >
          <ClipboardList className="mt-0.5 h-6 w-6 text-[#c9a227]" />
          <div>
            <h2 className="font-semibold text-[#3d3428]">Assign Tasks</h2>
            <p className="mt-1 text-sm text-[#6b5d4d]">Assign work to students in your department.</p>
          </div>
        </Link>
        <Link
          href="/mentor/counselling"
          className="flex items-start gap-3 rounded-2xl border border-[#e8dcc8] bg-white p-5 transition hover:border-[#c9a227]"
        >
          <MessageCircle className="mt-0.5 h-6 w-6 text-[#c9a227]" />
          <div>
            <h2 className="font-semibold text-[#3d3428]">Counselling</h2>
            <p className="mt-1 text-sm text-[#6b5d4d]">View scheduled counselling sessions.</p>
          </div>
        </Link>
        <Link
          href="/mentor/profile"
          className="flex items-start gap-3 rounded-2xl border border-[#e8dcc8] bg-white p-5 transition hover:border-[#c9a227]"
        >
          <UserCircle className="mt-0.5 h-6 w-6 text-[#c9a227]" />
          <div>
            <h2 className="font-semibold text-[#3d3428]">My Profile</h2>
            <p className="mt-1 text-sm text-[#6b5d4d]">Update your profile details and documents.</p>
          </div>
        </Link>
      </div>

      {uid ? <MentorStudentRoster mentorId={uid} department={department} /> : null}
    </div>
  );
}
