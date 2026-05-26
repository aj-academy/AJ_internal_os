import Link from "next/link";
import { CalendarClock, ClipboardList, ListTodo } from "lucide-react";
import { AttendanceLocationBlock } from "@/components/attendance/AttendanceLocationBlock";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { createClient } from "@/lib/supabase/server";
import { formatTimeIST, todayDateIST } from "@/lib/datetime";

export default async function FreelancerDashboardPage() {
  const { profile, user } = await getUserProfile();
  const supabase = await createClient();
  const uid = user?.id;
  const today = todayDateIST();

  let todayAttendance: {
    status: string | null;
    check_in_time: string | null;
    check_out_time: string | null;
    check_in_selfie_url: string | null;
    check_in_address: string | null;
    check_out_address: string | null;
    check_in_latitude: number | null;
    check_in_longitude: number | null;
    check_out_latitude: number | null;
    check_out_longitude: number | null;
  } | null = null;

  let assignedByMe = 0;

  if (uid) {
    const [attRes, assignedRes] = await Promise.all([
      supabase
        .from("attendance_records")
        .select(
          "status,check_in_time,check_out_time,check_in_selfie_url,check_in_address,check_out_address,check_in_latitude,check_in_longitude,check_out_latitude,check_out_longitude",
        )
        .eq("employee_id", uid)
        .eq("attendance_date", today)
        .maybeSingle(),
      supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assigned_by", uid),
    ]);
    todayAttendance = attRes.data ?? null;
    assignedByMe = assignedRes.count ?? 0;
  }

  const firstName = (profile?.full_name ?? "Freelancer").split(" ")[0];
  const department = profile?.department?.trim();

  return (
    <div className="dashboard-section space-y-6">
      <header className="rounded-[24px] border border-[#e8dcc8] bg-gradient-to-br from-[#fffdf8] to-[#faf3e3] p-6 shadow-sm">
        <p className="text-sm font-medium text-[#a68b2e]">AJ Academy</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#3d3428] sm:text-3xl">
          Welcome, {firstName}
        </h1>
        <p className="mt-2 text-sm text-[#6b5d4d]">
          Check in with selfie and GPS, assign tasks to students in your department, and complete work
          assigned to you.
        </p>
        {department ? (
          <p className="mt-1 text-xs font-medium text-[#a68b2e]">Department: {department}</p>
        ) : (
          <p className="mt-1 text-xs text-amber-800">
            Ask admin to set your department in User Master to assign tasks to students.
          </p>
        )}
      </header>

      <article className="rounded-2xl border border-[#e8dcc8] bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-[#a68b2e]">Today&apos;s attendance</p>
        <p className="mt-2 text-lg font-semibold capitalize text-[#3d3428]">
          {todayAttendance?.status?.trim() || "Not checked in"}
        </p>
        {todayAttendance?.check_in_time ? (
          <p className="mt-1 text-sm text-[#6b5d4d]">
            {formatTimeIST(todayAttendance.check_in_time)} →{" "}
            {formatTimeIST(todayAttendance.check_out_time)}
          </p>
        ) : null}
        {todayAttendance?.check_in_time ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <AttendanceLocationBlock
              label="Check-in location"
              address={todayAttendance.check_in_address}
              latitude={todayAttendance.check_in_latitude}
              longitude={todayAttendance.check_in_longitude}
            />
            <AttendanceLocationBlock
              label="Check-out location"
              address={todayAttendance.check_out_address}
              latitude={todayAttendance.check_out_latitude}
              longitude={todayAttendance.check_out_longitude}
            />
          </div>
        ) : null}
        {todayAttendance?.check_in_selfie_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={todayAttendance.check_in_selfie_url}
            alt="Today's check-in selfie"
            className="mt-4 max-h-40 rounded-lg border border-[#ede4d4]"
          />
        ) : null}
      </article>

      <div className="stat-cards-grid">
        <article className="rounded-2xl border border-[#e8dcc8] bg-white p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-[#a68b2e]">Tasks I assigned</p>
          <p className="mt-2 text-3xl font-semibold text-[#3d3428]">{assignedByMe}</p>
        </article>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href="/freelancer/attendance"
          className="flex items-start gap-3 rounded-2xl border border-[#e8dcc8] bg-white p-5 transition hover:border-[#c9a227]"
        >
          <CalendarClock className="mt-0.5 h-6 w-6 text-[#c9a227]" />
          <div>
            <h2 className="font-semibold text-[#3d3428]">My Attendance</h2>
            <p className="mt-1 text-sm text-[#6b5d4d]">Selfie check-in, check-in/out GPS, work summary.</p>
          </div>
        </Link>
        <Link
          href="/freelancer/assign-tasks"
          className="flex items-start gap-3 rounded-2xl border border-[#e8dcc8] bg-white p-5 transition hover:border-[#c9a227]"
        >
          <ClipboardList className="mt-0.5 h-6 w-6 text-[#c9a227]" />
          <div>
            <h2 className="font-semibold text-[#3d3428]">Assign Tasks</h2>
            <p className="mt-1 text-sm text-[#6b5d4d]">
              Assign work to students in {department || "your department"}.
            </p>
          </div>
        </Link>
        <Link
          href="/freelancer/my-tasks"
          className="flex items-start gap-3 rounded-2xl border border-[#e8dcc8] bg-white p-5 transition hover:border-[#c9a227] sm:col-span-2"
        >
          <ListTodo className="mt-0.5 h-6 w-6 text-[#c9a227]" />
          <div>
            <h2 className="font-semibold text-[#3d3428]">My Tasks</h2>
            <p className="mt-1 text-sm text-[#6b5d4d]">Tasks others assigned to you — update progress and complete.</p>
          </div>
        </Link>
      </div>
    </div>
  );
}
