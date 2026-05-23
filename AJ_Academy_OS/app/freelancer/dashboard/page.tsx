import Link from "next/link";
import { CalendarClock } from "lucide-react";
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
  } | null = null;

  if (uid) {
    const { data } = await supabase
      .from("attendance_records")
      .select("status,check_in_time,check_out_time,check_in_selfie_url")
      .eq("employee_id", uid)
      .eq("attendance_date", today)
      .maybeSingle();
    todayAttendance = data ?? null;
  }

  const firstName = (profile?.full_name ?? "Freelancer").split(" ")[0];

  return (
    <div className="dashboard-section space-y-6">
      <header className="rounded-[24px] border border-[#e8dcc8] bg-gradient-to-br from-[#fffdf8] to-[#faf3e3] p-6 shadow-sm">
        <p className="text-sm font-medium text-[#a68b2e]">AJ Academy</p>
        <h1 className="mt-1 text-2xl font-semibold text-[#3d3428] sm:text-3xl">
          Welcome, {firstName}
        </h1>
        <p className="mt-2 text-sm text-[#6b5d4d]">
          Check in with a selfie and location, then submit your work summary on check-out.
        </p>
      </header>

      <article className="rounded-2xl border border-[#e8dcc8] bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-[#a68b2e]">Today</p>
        <p className="mt-2 text-lg font-semibold capitalize text-[#3d3428]">
          {todayAttendance?.status?.trim() || "Not checked in"}
        </p>
        {todayAttendance?.check_in_time ? (
          <p className="mt-1 text-sm text-[#6b5d4d]">
            {formatTimeIST(todayAttendance.check_in_time)} →{" "}
            {formatTimeIST(todayAttendance.check_out_time)}
          </p>
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

      <Link
        href="/freelancer/attendance"
        className="flex items-start gap-3 rounded-2xl border border-[#e8dcc8] bg-white p-5 transition hover:border-[#c9a227]"
      >
        <CalendarClock className="mt-0.5 h-6 w-6 text-[#c9a227]" />
        <div>
          <h2 className="font-semibold text-[#3d3428]">My Attendance</h2>
          <p className="mt-1 text-sm text-[#6b5d4d]">Selfie check-in, GPS, and work summary.</p>
        </div>
      </Link>
    </div>
  );
}
