import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { AdminAttendanceAutoRefresh } from "@/components/attendance/AdminAttendanceAutoRefresh";

/**
 * Prefer service role on this admin-only route so attendance + work_summaries
 * always load even if session RLS policies are misaligned in Supabase.
 */
async function createAttendanceSupabaseClient() {
  try {
    return createAdminClient();
  } catch {
    return await createClient();
  }
}

type AttendanceRecord = {
  id: string;
  employee_id: string;
  attendance_date: string;
  check_in_time: string | null;
  check_out_time: string | null;
  check_in_latitude: number | null;
  check_in_longitude: number | null;
  check_out_latitude: number | null;
  check_out_longitude: number | null;
  check_in_address?: string | null;
  check_out_address?: string | null;
  status: string | null;
  location_type: string | null;
  total_working_minutes: number | null;
};

type ProfileMini = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  designation: string | null;
};

type EmployeeDetailMini = {
  employee_id?: string | null;
  profile_id?: string | null;
  id?: string | null;
  user_id?: string | null;
  employee_code: string | null;
  full_name?: string | null;
  email?: string | null;
};

type PermissionRequest = {
  id: string;
  employee_id: string;
  permission_date: string;
  from_time: string | null;
  to_time: string | null;
  permission_type: string | null;
  reason: string | null;
  description: string | null;
  status: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

type WorkSummary = {
  id: string;
  employee_id: string;
  attendance_id: string | null;
  summary_date: string | null;
  completed_work: string | null;
  pending_work: string | null;
  challenges: string | null;
  tomorrow_plan: string | null;
  status: string | null;
  manager_remarks: string | null;
  created_at: string;
};

interface AdminAttendancePageProps {
  searchParams: Promise<{
    tab?: string;
    date?: string;
    department?: string;
    status?: string;
    location?: string;
    month?: string;
    employee?: string;
    q?: string;
  }>;
}

const VALID_TABS = new Set(["overview", "logs", "permission", "summary", "monthly"]);


function getTodayLocalDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  return `${year}-${month}`;
}

function getLastNDates(count: number) {
  const dates: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString();
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
  });
}

function formatTime(value: string | null) {
  if (!value) return "-";
  const minutes = parseTimeToMinutes(value);
  if (minutes === null) return value;
  const hour24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${String(hour12).padStart(2, "0")}:${String(mins).padStart(2, "0")} ${period}`;
}

function formatDateTimeAsTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function formatHoursFromMinutes(minutes: number | null) {
  if (minutes === null || minutes < 0) return "-";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hrs}h ${mins}m`;
}

function getWorkingMinutes(row: AttendanceRecord) {
  if (typeof row.total_working_minutes === "number" && row.total_working_minutes > 0) {
    return row.total_working_minutes;
  }
  if (row.check_in_time && row.check_out_time) {
    const inMs = new Date(row.check_in_time).getTime();
    const outMs = new Date(row.check_out_time).getTime();
    if (!Number.isNaN(inMs) && !Number.isNaN(outMs) && outMs > inMs) {
      return Math.max(1, Math.ceil((outMs - inMs) / 60000));
    }
  }
  return row.total_working_minutes;
}

function toHours(minutes: number) {
  return (minutes / 60).toFixed(1);
}

function calcPermissionHours(fromTime: string | null, toTime: string | null) {
  if (!fromTime || !toTime) return 0;
  const fromMinutes = parseTimeToMinutes(fromTime);
  const toMinutes = parseTimeToMinutes(toTime);
  if (fromMinutes === null || toMinutes === null) return 0;
  const diff = (toMinutes - fromMinutes) / 60;
  return diff > 0 ? diff : 0;
}

function parseTimeToMinutes(value: string) {
  const normalized = value.trim().toLowerCase();
  const amPmMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)$/);
  if (amPmMatch) {
    const hour = Number(amPmMatch[1]);
    const minute = Number(amPmMatch[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 1 || hour > 12 || minute < 0 || minute > 59) {
      return null;
    }
    const hour24 = (hour % 12) + (amPmMatch[3] === "pm" ? 12 : 0);
    return hour24 * 60 + minute;
  }

  const twentyFourMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourMatch) {
    const hour = Number(twentyFourMatch[1]);
    const minute = Number(twentyFourMatch[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    return hour * 60 + minute;
  }

  return null;
}

function getEmployeeName(profile: ProfileMini | undefined, employeeId: string) {
  const fullName = profile?.full_name?.trim();
  if (fullName) return fullName;
  const email = profile?.email?.trim();
  if (email && email.includes("@")) return email.split("@")[0];
  return "Unknown Employee";
}

function isWfh(locationType: string | null) {
  const value = (locationType ?? "").toLowerCase();
  return value === "remote" || value === "wfh" || value === "work from home";
}

function Badge({ value }: { value: string }) {
  const lowered = value.toLowerCase();
  const color =
    lowered === "approved" || lowered === "reviewed" || lowered === "completed"
      ? "bg-emerald-100 text-emerald-700"
      : lowered === "rejected"
        ? "bg-rose-100 text-rose-700"
        : lowered === "pending"
          ? "bg-amber-100 text-amber-700"
          : "bg-slate-100 text-slate-700";
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${color}`}>{value}</span>;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-[20px] border border-[#dbe6f3] bg-white p-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-[#0f172a]">{value}</p>
    </article>
  );
}

function AttendanceSubCategoryNav({ activeTab }: { activeTab: string }) {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "logs", label: "Check In / Check Out Logs" },
    { id: "permission", label: "Permission Requests" },
    { id: "summary", label: "Work Summary" },
    { id: "monthly", label: "Monthly Report" },
  ];

  return (
    <nav className="overflow-x-auto rounded-2xl border border-[#dbe7ff] bg-[#f8fbff] p-2">
      <div className="flex min-w-max gap-2">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Link
              key={tab.id}
              href={`/admin/attendance?tab=${tab.id}`}
              className={[
                "rounded-xl px-3 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-[#2563eb] text-white shadow-[0_8px_18px_rgba(37,99,235,0.24)]"
                  : "bg-white text-slate-700 hover:bg-[#eaf1ff]",
              ].join(" ")}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

async function handlePermissionAction(formData: FormData) {
  "use server";
  const { profile } = await getUserProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) return;

  const id = String(formData.get("id") ?? "");
  const action = String(formData.get("action") ?? "");
  const rejectionReason = String(formData.get("rejection_reason") ?? "").trim();
  if (!id || !action) return;

  const supabase = await createAttendanceSupabaseClient();
  const payload: {
    status: string;
    approved_by: string;
    approved_at: string;
    rejection_reason?: string;
  } = {
    status: action,
    approved_by: profile.id,
    approved_at: new Date().toISOString(),
  };

  if (action === "rejected") {
    payload.rejection_reason = rejectionReason || "Rejected by admin";
  } else {
    payload.rejection_reason = "";
  }

  await supabase.from("permission_requests").update(payload).eq("id", id);
}

async function handleSummaryReview(formData: FormData) {
  "use server";
  const { profile } = await getUserProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) return;

  const id = String(formData.get("id") ?? "");
  const remark = String(formData.get("remark") ?? "").trim();
  if (!id) return;

  const supabase = await createAttendanceSupabaseClient();
  await supabase
    .from("work_summaries")
    .update({
      status: "reviewed",
      manager_remarks: remark || "Reviewed by admin",
    })
    .eq("id", id);
}

export default async function AdminAttendancePage({ searchParams }: AdminAttendancePageProps) {
  const params = await searchParams;
  const selectedTab = (params.tab ?? "overview").toLowerCase();
  const removedTabs = new Set(["daily", "leave", "wfh", "settings"]);
  if (removedTabs.has(selectedTab)) {
    redirect("/admin/attendance?tab=overview");
  }
  if (!VALID_TABS.has(selectedTab)) {
    redirect("/admin/attendance?tab=overview");
  }

  const supabase = await createAttendanceSupabaseClient();
  const today = getTodayLocalDate();
  const queryFilter = (params.q ?? "").trim().toLowerCase();

  const [profilesRes, employeeDetailsRes] = await Promise.all([
    supabase.from("profiles").select("id,full_name,email,department,designation").returns<ProfileMini[]>(),
    supabase.from("employee_details").select("*").returns<EmployeeDetailMini[]>(),
  ]);
  const profileMap = new Map((profilesRes.data ?? []).map((row) => [row.id, row]));
  const employeeCodeMap = new Map<string, string>();
  const employeeNameFallbackMap = new Map<string, string>();
  const employeeEmailFallbackMap = new Map<string, string>();
  (employeeDetailsRes.data ?? []).forEach((row) => {
    const code = row.employee_code?.trim();
    const fullName = row.full_name?.trim();
    const email = row.email?.trim();
    if (!code) return;
    const keys = [row.employee_id, row.profile_id, row.user_id, row.id]
      .filter((key): key is string => Boolean(key && typeof key === "string"));
    keys.forEach((key) => {
      employeeCodeMap.set(key, code);
      if (fullName) employeeNameFallbackMap.set(key, fullName);
      if (email) employeeEmailFallbackMap.set(key, email);
    });
  });
  const departments = Array.from(new Set((profilesRes.data ?? []).map((p) => p.department).filter(Boolean))) as string[];

  if (selectedTab === "overview") {
    const weekDays = getLastNDates(7);
    const weekStart = weekDays[0];
    const weekEndExclusive = (() => {
      const d = new Date(`${weekDays[6]}T00:00:00`);
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    })();

    const [{ data: todayRecordsData }, { data: weekRecordsData }] = await Promise.all([
      supabase
        .from("attendance_records")
        .select("id,employee_id,attendance_date,check_in_time,check_out_time,status,location_type,total_working_minutes")
        .eq("attendance_date", today)
        .returns<AttendanceRecord[]>(),
      supabase
        .from("attendance_records")
        .select("id,employee_id,attendance_date,check_in_time,check_out_time,status,location_type,total_working_minutes")
        .gte("attendance_date", weekStart)
        .lt("attendance_date", weekEndExclusive)
        .returns<AttendanceRecord[]>(),
    ]);

    const todayRecords = todayRecordsData ?? [];
    const weekRecords = weekRecordsData ?? [];
    const weekBuckets = weekDays.map((day) => {
      const rows = weekRecords.filter((record) => record.attendance_date === day);
      return {
        day,
        checkIns: rows.filter((record) => Boolean(record.check_in_time)).length,
        checkOuts: rows.filter((record) => Boolean(record.check_out_time)).length,
      };
    });

    const maxBucket = Math.max(1, ...weekBuckets.map((b) => Math.max(b.checkIns, b.checkOuts)));

    const statusChartRaw = [
      { label: "Present", value: todayRecords.filter((r) => (r.status ?? "").toLowerCase() === "present" || (r.status ?? "").toLowerCase() === "completed").length, color: "bg-emerald-500" },
      { label: "Pending Checkout", value: todayRecords.filter((r) => r.check_in_time && !r.check_out_time).length, color: "bg-amber-500" },
      { label: "Remote", value: todayRecords.filter((r) => r.check_in_time && isWfh(r.location_type)).length, color: "bg-blue-500" },
      { label: "Absent", value: todayRecords.filter((r) => (r.status ?? "").toLowerCase() === "absent").length, color: "bg-rose-500" },
    ];
    const statusMax = Math.max(1, ...statusChartRaw.map((item) => item.value));

    const presentToday = todayRecords.filter((r) => (r.status ?? "").toLowerCase() === "present" || (r.status ?? "").toLowerCase() === "completed").length;
    const completedCheckout = todayRecords.filter((r) => Boolean(r.check_out_time)).length;
    const remoteToday = todayRecords.filter((r) => isWfh(r.location_type)).length;
    const pendingCheckout = todayRecords.filter((r) => r.check_in_time && !r.check_out_time).length;

    return (
      <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_22px_40px_rgba(30,64,175,0.09)] lg:p-8">
        <header className="space-y-2">
          <h2 className="text-3xl font-semibold text-slate-900">Attendance System</h2>
          <p className="text-sm text-slate-600">Overview of today's attendance status from real employee entries.</p>
          <p className="inline-flex rounded-full bg-[#e8f1ff] px-3 py-1 text-xs font-semibold text-[#1d4ed8]">
            Overview: Live today snapshot
          </p>
          <AdminAttendanceAutoRefresh />
          <AttendanceSubCategoryNav activeTab={selectedTab} />
        </header>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Check-ins Today" value={presentToday} />
          <StatCard label="Completed Check-outs Today" value={completedCheckout} />
          <StatCard label="Pending Check-outs" value={pendingCheckout} />
          <StatCard label="Remote Check-ins" value={remoteToday} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-2xl border border-[#d4deea] bg-white p-5">
            <h3 className="text-lg font-semibold text-slate-900">Today Status Distribution</h3>
            <p className="mt-1 text-xs text-slate-500">Quick comparison of attendance states for today</p>
            <div className="mt-4 space-y-3">
              {statusChartRaw.map((item) => (
                <div key={item.label}>
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-600">
                    <span>{item.label}</span>
                    <span>{item.value}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100">
                    <div
                      className={`h-2 rounded-full ${item.color}`}
                      style={{ width: `${Math.max(4, (item.value / statusMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-[#d4deea] bg-white p-5">
            <h3 className="text-lg font-semibold text-slate-900">Last 7 Days Trend</h3>
            <p className="mt-1 text-xs text-slate-500">Check-ins vs completed check-outs per day</p>
            <div className="mt-4 grid grid-cols-7 gap-2">
              {weekBuckets.map((bucket) => (
                <div key={bucket.day} className="flex flex-col items-center">
                  <div className="flex h-28 items-end gap-1">
                    <div
                      className="w-2 rounded-t bg-blue-500"
                      style={{ height: `${Math.max(4, (bucket.checkIns / maxBucket) * 100)}px` }}
                      title={`Check-ins: ${bucket.checkIns}`}
                    />
                    <div
                      className="w-2 rounded-t bg-emerald-500"
                      style={{ height: `${Math.max(4, (bucket.checkOuts / maxBucket) * 100)}px` }}
                      title={`Check-outs: ${bucket.checkOuts}`}
                    />
                  </div>
                  <p className="mt-2 text-[11px] text-slate-500">
                    {new Date(`${bucket.day}T00:00:00`).toLocaleDateString([], { weekday: "short" })}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-500" /> Check-ins</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Check-outs</span>
            </div>
          </section>
        </div>
      </section>
    );
  }

  if (selectedTab === "logs") {
    const dateFilter = params.date ?? "";
    const departmentFilter = params.department ?? "";
    const statusFilter = params.status ?? "";
    const locationFilter = params.location ?? "";

    let logsQuery = supabase
      .from("attendance_records")
      .select("id,employee_id,attendance_date,check_in_time,check_out_time,check_in_latitude,check_in_longitude,check_out_latitude,check_out_longitude,check_in_address,check_out_address,status,location_type,total_working_minutes")
      .order("attendance_date", { ascending: false })
      .limit(400);

    if (dateFilter) logsQuery = logsQuery.eq("attendance_date", dateFilter);
    if (statusFilter) logsQuery = logsQuery.eq("status", statusFilter.toLowerCase());
    if (locationFilter) logsQuery = logsQuery.eq("location_type", locationFilter);

    const { data: recordsData } = await logsQuery.returns<AttendanceRecord[]>();
    const records = (recordsData ?? []).filter((row) => {
      const profile = profileMap.get(row.employee_id);
      const department = (profile?.department ?? "").toLowerCase();
      const employeeCode = (employeeCodeMap.get(row.employee_id) ?? "").toLowerCase();
      const fullName = (profile?.full_name ?? employeeNameFallbackMap.get(row.employee_id) ?? "").toLowerCase();
      const email = (profile?.email ?? employeeEmailFallbackMap.get(row.employee_id) ?? "").toLowerCase();
      const matchesDept = departmentFilter ? department === departmentFilter.toLowerCase() : true;
      const matchesSearch = queryFilter ? fullName.includes(queryFilter) || email.includes(queryFilter) || employeeCode.includes(queryFilter) : true;
      return matchesDept && matchesSearch;
    });

    const todayRows = records.filter((r) => r.attendance_date === today);
    const totalCheckInToday = todayRows.filter((r) => Boolean(r.check_in_time)).length;
    const completedCheckoutToday = todayRows.filter((r) => Boolean(r.check_out_time)).length;
    const pendingCheckout = todayRows.filter((r) => r.check_in_time && !r.check_out_time).length;
    const remoteCheckins = todayRows.filter((r) => r.check_in_time && isWfh(r.location_type)).length;

    return (
      <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_22px_40px_rgba(30,64,175,0.09)] lg:p-8">
        <header className="space-y-2">
          <h2 className="text-3xl font-semibold text-slate-900">Check In / Check Out Logs</h2>
          <p className="text-sm text-slate-600">Real employee attendance logs from check-in and check-out submissions.</p>
          <AdminAttendanceAutoRefresh />
          <AttendanceSubCategoryNav activeTab={selectedTab} />
        </header>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Check-ins Today" value={totalCheckInToday} />
          <StatCard label="Completed Check-outs Today" value={completedCheckoutToday} />
          <StatCard label="Pending Check-outs" value={pendingCheckout} />
          <StatCard label="Remote Check-ins" value={remoteCheckins} />
        </div>

        <section className="rounded-2xl border border-[#d4deea] bg-[#f8fbff] p-4">
          <form method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input type="hidden" name="tab" value="logs" />
            <input name="date" type="date" defaultValue={dateFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm" />
            <select name="department" defaultValue={departmentFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm">
              <option value="">All Departments</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
            <select name="status" defaultValue={statusFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm">
              <option value="">All Status</option>
              <option value="present">Present</option>
              <option value="completed">Completed</option>
              <option value="late">Late</option>
              <option value="absent">Absent</option>
            </select>
            <select name="location" defaultValue={locationFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm">
              <option value="">All Location Types</option>
              <option value="Remote">Remote</option>
              <option value="Work From Home">Work From Home</option>
              <option value="Office">Office</option>
            </select>
            <input name="q" defaultValue={params.q ?? ""} placeholder="Search name/email/code" className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm" />
            <div className="xl:col-span-5 flex gap-2">
              <button className="rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white">Apply Filters</button>
              <Link href="/admin/attendance?tab=logs" className="rounded-xl border border-[#cfdceb] bg-white px-4 py-2 text-sm font-semibold text-slate-700">Reset</Link>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-[#d4deea] bg-white p-4">
          <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
            <table className="w-full min-w-[1500px] text-left text-sm">
              <thead className="bg-[#f1f6fc] text-[#64748b]">
                <tr>
                  {[
                    "Employee Code",
                    "Employee Name",
                    "Email",
                    "Department",
                    "Date",
                    "Check In Time",
                    "Check Out Time",
                    "Total Hours",
                    "Status",
                    "Location Type",
                    "Check In Location",
                    "Check Out Location",
                  ].map((h) => (
                    <th key={h} className="px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8edf5] text-slate-700">
                {records.map((row) => {
                  const profile = profileMap.get(row.employee_id);
                  const computedMinutes = getWorkingMinutes(row);
                  const displayName =
                    profile?.full_name ??
                    employeeNameFallbackMap.get(row.employee_id) ??
                    getEmployeeName(profile, row.employee_id);
                  const displayEmail =
                    profile?.email ?? employeeEmailFallbackMap.get(row.employee_id) ?? "-";
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3">{employeeCodeMap.get(row.employee_id) ?? "-"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{displayName}</td>
                      <td className="px-4 py-3">{displayEmail}</td>
                      <td className="px-4 py-3">{profile?.department ?? "-"}</td>
                      <td className="px-4 py-3">{formatDate(row.attendance_date)}</td>
                      <td className="px-4 py-3">{formatDateTimeAsTime(row.check_in_time)}</td>
                      <td className="px-4 py-3">{formatDateTimeAsTime(row.check_out_time)}</td>
                      <td className="px-4 py-3">{formatHoursFromMinutes(computedMinutes)}</td>
                      <td className="px-4 py-3"><Badge value={row.status ?? "pending"} /></td>
                      <td className="px-4 py-3">{row.location_type ?? "-"}</td>
                      <td className="max-w-[260px] px-4 py-3">{row.check_in_address ?? "-"}</td>
                      <td className="max-w-[260px] px-4 py-3">{row.check_out_address ?? "-"}</td>
                    </tr>
                  );
                })}
                {!records.length ? (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-slate-500">No check-in/check-out records found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    );
  }

  if (selectedTab === "permission") {
    const dateFilter = params.date ?? "";
    const departmentFilter = params.department ?? "";
    const statusFilter = params.status ?? "";

    let permissionQuery = supabase
      .from("permission_requests")
      .select("id,employee_id,permission_date,from_time,to_time,permission_type,reason,description,status,approved_by,approved_at,rejection_reason,created_at")
      .order("created_at", { ascending: false })
      .limit(400);

    if (dateFilter) permissionQuery = permissionQuery.eq("permission_date", dateFilter);
    if (statusFilter) permissionQuery = permissionQuery.eq("status", statusFilter);

    const { data: permissionData } = await permissionQuery.returns<PermissionRequest[]>();
    const rows = (permissionData ?? []).filter((row) => {
      const profile = profileMap.get(row.employee_id);
      const department = (profile?.department ?? "").toLowerCase();
      const employeeCode = (employeeCodeMap.get(row.employee_id) ?? "").toLowerCase();
      const fullName = (profile?.full_name ?? "").toLowerCase();
      const email = (profile?.email ?? "").toLowerCase();
      const matchesDept = departmentFilter ? department === departmentFilter.toLowerCase() : true;
      const matchesSearch = queryFilter ? fullName.includes(queryFilter) || email.includes(queryFilter) || employeeCode.includes(queryFilter) : true;
      return matchesDept && matchesSearch;
    });

    const pendingPermissions = rows.filter((r) => (r.status ?? "pending") === "pending").length;
    const approvedToday = rows.filter((r) => (r.status ?? "") === "approved" && r.approved_at?.startsWith(today)).length;
    const thisMonth = getCurrentMonth();
    const rejectedThisMonth = rows.filter((r) => (r.status ?? "") === "rejected" && r.created_at.startsWith(thisMonth)).length;
    const totalPermissionHours = rows.reduce((acc, row) => acc + calcPermissionHours(row.from_time, row.to_time), 0);

    return (
      <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_22px_40px_rgba(30,64,175,0.09)] lg:p-8">
        <header className="space-y-2">
          <h2 className="text-3xl font-semibold text-slate-900">Permission Requests</h2>
          <p className="text-sm text-slate-600">Review and take action on employee permission submissions.</p>
          <AdminAttendanceAutoRefresh />
          <AttendanceSubCategoryNav activeTab={selectedTab} />
        </header>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Pending Permissions" value={pendingPermissions} />
          <StatCard label="Approved Today" value={approvedToday} />
          <StatCard label="Rejected This Month" value={rejectedThisMonth} />
          <StatCard label="Total Permission Hours" value={totalPermissionHours.toFixed(1)} />
        </div>

        <section className="rounded-2xl border border-[#d4deea] bg-[#f8fbff] p-4">
          <form method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="tab" value="permission" />
            <input name="date" type="date" defaultValue={dateFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm" />
            <select name="department" defaultValue={departmentFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm">
              <option value="">All Departments</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
            <select name="status" defaultValue={statusFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm">
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
            <input name="q" defaultValue={params.q ?? ""} placeholder="Search name/email/code" className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm" />
            <div className="xl:col-span-4 flex gap-2">
              <button className="cursor-pointer rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white">Apply Filters</button>
              <Link href="/admin/attendance?tab=permission" className="rounded-xl border border-[#cfdceb] bg-white px-4 py-2 text-sm font-semibold text-slate-700">Reset</Link>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-[#d4deea] bg-white p-4">
          <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
            <table className="w-full min-w-[1700px] text-left text-sm">
              <thead className="bg-[#f1f6fc] text-[#64748b]">
                <tr>
                  {["Employee Code", "Employee Name", "Department", "Permission Date", "From Time", "To Time", "Total Hours", "Permission Type", "Reason", "Description", "Status", "Requested On", "Action"].map((h) => (
                    <th key={h} className="px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8edf5] text-slate-700">
                {rows.map((row) => {
                  const profile = profileMap.get(row.employee_id);
                  const totalHours = calcPermissionHours(row.from_time, row.to_time).toFixed(1);
                  const isPending = (row.status ?? "pending") === "pending";
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3">{employeeCodeMap.get(row.employee_id) ?? "-"}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{getEmployeeName(profile, row.employee_id)}</td>
                      <td className="px-4 py-3">{profile?.department ?? "-"}</td>
                      <td className="px-4 py-3">{formatDate(row.permission_date)}</td>
                      <td className="px-4 py-3">{formatTime(row.from_time)}</td>
                      <td className="px-4 py-3">{formatTime(row.to_time)}</td>
                      <td className="px-4 py-3">{totalHours}</td>
                      <td className="px-4 py-3">{row.permission_type ?? "-"}</td>
                      <td className="px-4 py-3">{row.reason ?? "-"}</td>
                      <td className="px-4 py-3 max-w-[240px]">{row.description ?? "-"}</td>
                      <td className="px-4 py-3"><Badge value={row.status ?? "pending"} /></td>
                      <td className="px-4 py-3">{formatDateTime(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex min-w-[260px] flex-col gap-2">
                          <details className="rounded-lg border border-[#dbe6f3] bg-white px-2 py-1">
                            <summary className="cursor-pointer text-xs text-slate-700">View Details</summary>
                            <p className="mt-1 text-xs text-slate-600">{row.description ?? "-"}</p>
                          </details>
                          {isPending ? (
                            <form action={handlePermissionAction} className="space-y-1">
                              <input type="hidden" name="id" value={row.id} />
                              <input name="rejection_reason" placeholder="Rejection reason (optional)" className="h-8 w-full rounded-md border border-[#cfdceb] px-2 text-xs" />
                              <div className="flex gap-2">
                                <button name="action" value="approved" className="cursor-pointer rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white">Approve</button>
                                <button name="action" value="rejected" className="cursor-pointer rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white">Reject</button>
                              </div>
                            </form>
                          ) : (
                            <p className="text-xs text-slate-500">Action completed</p>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr><td colSpan={13} className="px-4 py-8 text-center text-slate-500">No permission requests found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    );
  }

  if (selectedTab === "summary") {
    const dateFilter = params.date ?? "";
    const departmentFilter = params.department ?? "";
    const statusFilter = params.status ?? "";

    let summaryQuery = supabase
      .from("work_summaries")
      .select("id,employee_id,attendance_id,summary_date,completed_work,pending_work,challenges,tomorrow_plan,status,manager_remarks,created_at")
      .order("created_at", { ascending: false })
      .limit(400);

    if (dateFilter) summaryQuery = summaryQuery.eq("summary_date", dateFilter);
    if (statusFilter) summaryQuery = summaryQuery.eq("status", statusFilter.trim().toLowerCase());

    const { data: summaryData, error: summaryFetchError } = await summaryQuery.returns<WorkSummary[]>();
    if (summaryFetchError) {
      console.error("work_summaries fetch:", summaryFetchError.message);
    }
    const rows = (summaryData ?? []).filter((row) => {
      const profile = profileMap.get(row.employee_id);
      const department = (profile?.department ?? "").toLowerCase();
      const employeeCode = (employeeCodeMap.get(row.employee_id) ?? "").toLowerCase();
      const fullName = (profile?.full_name ?? "").toLowerCase();
      const email = (profile?.email ?? "").toLowerCase();
      const matchesDept = departmentFilter ? department === departmentFilter.toLowerCase() : true;
      const matchesSearch = queryFilter ? fullName.includes(queryFilter) || email.includes(queryFilter) || employeeCode.includes(queryFilter) : true;
      return matchesDept && matchesSearch;
    });

    const submittedToday = rows.filter((r) => (r.summary_date ?? "").startsWith(today)).length;
    const pendingToday = rows.filter((r) => (r.summary_date ?? "").startsWith(today) && (r.status ?? "submitted") !== "reviewed").length;
    const monthKey = getCurrentMonth();
    const reviewedThisMonth = rows.filter(
      (r) => (r.status ?? "").toLowerCase() === "reviewed" && (r.summary_date ?? "").startsWith(monthKey),
    ).length;
    const delayedSummaries = rows.filter((r) => (r.status ?? "submitted") !== "reviewed").length;

    return (
      <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_22px_40px_rgba(30,64,175,0.09)] lg:p-8">
        <header className="space-y-2">
          <h2 className="text-3xl font-semibold text-slate-900">Work Summary</h2>
          <p className="text-sm text-slate-600">Review checkout work summaries submitted by employees.</p>
          <AdminAttendanceAutoRefresh />
          <AttendanceSubCategoryNav activeTab={selectedTab} />
        </header>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Submitted Today" value={submittedToday} />
          <StatCard label="Pending Today" value={pendingToday} />
          <StatCard label="Reviewed This Month" value={reviewedThisMonth} />
          <StatCard label="Delayed Summaries" value={delayedSummaries} />
        </div>

        {summaryFetchError ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            Could not load work summaries: {summaryFetchError.message}. If the error mentions a missing column (for example{" "}
            <code className="rounded bg-white/80 px-1">manager_remarks</code>), run{" "}
            <code className="rounded bg-white/80 px-1">BB_internal_SB/fix_work_summaries_manager_remarks.sql</code> or re-run{" "}
            <code className="rounded bg-white/80 px-1">BB_internal_SB/attendance_schema.sql</code> in Supabase—older tables are not altered by{" "}
            <code className="rounded bg-white/80 px-1">CREATE TABLE IF NOT EXISTS</code> alone. For access errors, set{" "}
            <code className="rounded bg-white/80 px-1">SUPABASE_SERVICE_ROLE_KEY</code> on the server; for RLS issues, re-run{" "}
            <code className="rounded bg-white/80 px-1">BB_internal_SB/attendance_rls.sql</code>.
          </div>
        ) : null}

        <section className="rounded-2xl border border-[#d4deea] bg-[#f8fbff] p-4">
          <form method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="tab" value="summary" />
            <input name="date" type="date" defaultValue={dateFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm" />
            <select name="department" defaultValue={departmentFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm">
              <option value="">All Departments</option>
              {departments.map((department) => <option key={department} value={department}>{department}</option>)}
            </select>
            <select name="status" defaultValue={statusFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm">
              <option value="">All Status</option>
              <option value="submitted">Submitted</option>
              <option value="reviewed">Reviewed</option>
            </select>
            <input name="q" defaultValue={params.q ?? ""} placeholder="Search name or email" className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm" />
            <div className="xl:col-span-4 flex gap-2">
              <button className="cursor-pointer rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white">Apply Filters</button>
              <Link href="/admin/attendance?tab=summary" className="rounded-xl border border-[#cfdceb] bg-white px-4 py-2 text-sm font-semibold text-slate-700">Reset</Link>
            </div>
          </form>
        </section>

        <section className="rounded-2xl border border-[#d4deea] bg-white p-4">
          <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
            <table className="w-full min-w-[1200px] text-left text-sm">
              <thead className="bg-[#f1f6fc] text-[#64748b]">
                <tr>
                  {["Employee Name", "Department", "Date", "Completed Work", "Pending Work", "Challenges", "Tomorrow Plan", "Status", "Manager/Admin Remarks", "Action"].map((h) => (
                    <th key={h} className="px-4 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8edf5] text-slate-700">
                {rows.map((row) => {
                  const profile = profileMap.get(row.employee_id);
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{profile?.full_name ?? employeeNameFallbackMap.get(row.employee_id) ?? "—"}</td>
                      <td className="px-4 py-3">{profile?.department ?? "-"}</td>
                      <td className="px-4 py-3">{row.summary_date ? formatDate(row.summary_date) : "-"}</td>
                      <td className="px-4 py-3 max-w-[220px]">{row.completed_work ?? "-"}</td>
                      <td className="px-4 py-3 max-w-[220px]">{row.pending_work ?? "-"}</td>
                      <td className="px-4 py-3 max-w-[220px]">{row.challenges ?? "-"}</td>
                      <td className="px-4 py-3 max-w-[220px]">{row.tomorrow_plan ?? "-"}</td>
                      <td className="px-4 py-3"><Badge value={row.status ?? "submitted"} /></td>
                      <td className="px-4 py-3">{row.manager_remarks ?? "-"}</td>
                      <td className="px-4 py-3">
                        <div className="min-w-[220px] space-y-2">
                          <details className="rounded-lg border border-[#dbe6f3] bg-white px-2 py-1">
                            <summary className="cursor-pointer text-xs text-slate-700">View Full Summary</summary>
                            <p className="mt-1 text-xs text-slate-600">Completed: {row.completed_work ?? "-"}</p>
                            <p className="text-xs text-slate-600">Pending: {row.pending_work ?? "-"}</p>
                            <p className="text-xs text-slate-600">Challenges: {row.challenges ?? "-"}</p>
                            <p className="text-xs text-slate-600">Tomorrow: {row.tomorrow_plan ?? "-"}</p>
                          </details>
                          <form action={handleSummaryReview} className="space-y-1">
                            <input type="hidden" name="id" value={row.id} />
                            <input name="remark" defaultValue={row.manager_remarks ?? ""} placeholder="Add remark" className="h-8 w-full rounded-md border border-[#cfdceb] px-2 text-xs" />
                            <button className="cursor-pointer rounded-md bg-[#2563eb] px-2 py-1 text-xs font-semibold text-white">Mark as Reviewed</button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!rows.length ? (
                  <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-500">No work summaries found.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    );
  }

  const monthFilter = params.month ?? getCurrentMonth();
  const departmentFilter = params.department ?? "";
  const employeeFilter = params.employee ?? "";
  const statusFilter = params.status ?? "";

  const monthStart = `${monthFilter}-01`;
  const nextDate = new Date(`${monthStart}T00:00:00`);
  nextDate.setMonth(nextDate.getMonth() + 1);
  const monthEnd = nextDate.toISOString().slice(0, 10);

  let monthlyAttendanceQuery = supabase
    .from("attendance_records")
    .select("id,employee_id,attendance_date,status,location_type,total_working_minutes")
    .gte("attendance_date", monthStart)
    .lt("attendance_date", monthEnd);
  if (statusFilter) monthlyAttendanceQuery = monthlyAttendanceQuery.eq("status", statusFilter);
  const { data: monthlyAttendance } = await monthlyAttendanceQuery.returns<AttendanceRecord[]>();

  const { data: monthlyPermission } = await supabase
    .from("permission_requests")
    .select("employee_id,from_time,to_time,permission_date")
    .gte("permission_date", monthStart)
    .lt("permission_date", monthEnd);

  const { data: monthlySummary } = await supabase
    .from("work_summaries")
    .select("employee_id,summary_date,created_at")
    .gte("summary_date", monthStart)
    .lt("summary_date", monthEnd);

  const attendanceRows = monthlyAttendance ?? [];
  const permissionRows = monthlyPermission ?? [];
  const summaryRows = monthlySummary ?? [];

  const workingDays = new Set(attendanceRows.map((r) => r.attendance_date)).size;
  const byEmployee = new Map<string, {
    present: number;
    absent: number;
    late: number;
    wfh: number;
    minutes: number;
    summaries: number;
    permissionsHours: number;
  }>();

  attendanceRows.forEach((row) => {
    const current = byEmployee.get(row.employee_id) ?? { present: 0, absent: 0, late: 0, wfh: 0, minutes: 0, summaries: 0, permissionsHours: 0 };
    const status = (row.status ?? "").toLowerCase();
    if (status === "present" || status === "completed") current.present += 1;
    if (status === "absent") current.absent += 1;
    if (status === "late") current.late += 1;
    if (isWfh(row.location_type)) current.wfh += 1;
    current.minutes += row.total_working_minutes ?? 0;
    byEmployee.set(row.employee_id, current);
  });

  permissionRows.forEach((row: { employee_id: string; from_time: string | null; to_time: string | null }) => {
    const current = byEmployee.get(row.employee_id) ?? { present: 0, absent: 0, late: 0, wfh: 0, minutes: 0, summaries: 0, permissionsHours: 0 };
    current.permissionsHours += calcPermissionHours(row.from_time, row.to_time);
    byEmployee.set(row.employee_id, current);
  });

  summaryRows.forEach((row: { employee_id: string }) => {
    const current = byEmployee.get(row.employee_id) ?? { present: 0, absent: 0, late: 0, wfh: 0, minutes: 0, summaries: 0, permissionsHours: 0 };
    current.summaries += 1;
    byEmployee.set(row.employee_id, current);
  });

  const reportRows = Array.from(byEmployee.entries()).filter(([employeeId]) => {
    const profile = profileMap.get(employeeId);
    const code = employeeCodeMap.get(employeeId) ?? "";
    const matchesDepartment = departmentFilter ? (profile?.department ?? "").toLowerCase() === departmentFilter.toLowerCase() : true;
    const matchesEmployee = employeeFilter ? employeeId === employeeFilter : true;
    const matchesSearch = queryFilter ? `${profile?.full_name ?? ""} ${(profile?.email ?? "")} ${code}`.toLowerCase().includes(queryFilter) : true;
    return matchesDepartment && matchesEmployee && matchesSearch;
  });

  const totalLateDays = reportRows.reduce((acc, [, row]) => acc + row.late, 0);
  const totalPermissionHours = reportRows.reduce((acc, [, row]) => acc + row.permissionsHours, 0);
  const averageAttendance = reportRows.length
    ? (reportRows.reduce((acc, [, row]) => acc + (workingDays ? (row.present / workingDays) * 100 : 0), 0) / reportRows.length).toFixed(1)
    : "0.0";
  const totalWorkSummaryCompletion = reportRows.length
    ? (
        reportRows.reduce((acc, [, row]) => {
          const completion = row.present ? (row.summaries / row.present) * 100 : 0;
          return acc + completion;
        }, 0) / reportRows.length
      ).toFixed(1)
    : "0.0";

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_22px_40px_rgba(30,64,175,0.09)] lg:p-8">
      <header className="space-y-2">
        <h2 className="text-3xl font-semibold text-slate-900">Monthly Report</h2>
        <p className="text-sm text-slate-600">Employee-wise monthly attendance and productivity report.</p>
        <p className="inline-flex rounded-full bg-[#ecfeff] px-3 py-1 text-xs font-semibold text-[#0f766e]">
          Monthly Report: Aggregated month analytics
        </p>
        <AdminAttendanceAutoRefresh />
        <AttendanceSubCategoryNav activeTab={selectedTab} />
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Working Days" value={workingDays} />
        <StatCard label="Average Attendance %" value={`${averageAttendance}%`} />
        <StatCard label="Total Late Days" value={totalLateDays} />
        <StatCard label="Total Permission Hours" value={totalPermissionHours.toFixed(1)} />
        <StatCard label="Work Summary Completion %" value={`${totalWorkSummaryCompletion}%`} />
      </div>

      <section className="rounded-2xl border border-[#d4deea] bg-[#f8fbff] p-4">
        <form method="get" className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input type="hidden" name="tab" value="monthly" />
          <input name="month" type="month" defaultValue={monthFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm" />
          <select name="department" defaultValue={departmentFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm">
            <option value="">All Departments</option>
            {departments.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
          <select name="employee" defaultValue={employeeFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm">
            <option value="">All Employees</option>
            {(profilesRes.data ?? []).map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.full_name ?? profile.email ?? profile.id}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={statusFilter} className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm">
            <option value="">All Status</option>
            <option value="present">Present</option>
            <option value="completed">Completed</option>
            <option value="late">Late</option>
            <option value="absent">Absent</option>
          </select>
          <input name="q" defaultValue={params.q ?? ""} placeholder="Search name/email/code" className="h-9 rounded-xl border border-[#cfdceb] bg-white px-3 text-sm xl:col-span-2" />
          <div className="xl:col-span-2 flex gap-2">
              <button className="cursor-pointer rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white">Apply Filters</button>
            <Link href="/admin/attendance?tab=monthly" className="rounded-xl border border-[#cfdceb] bg-white px-4 py-2 text-sm font-semibold text-slate-700">Reset</Link>
          </div>
        </form>
      </section>

      <div className="flex gap-2">
        <button type="button" className="cursor-pointer rounded-xl bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white">Export Excel</button>
        <button type="button" className="cursor-pointer rounded-xl border border-[#cfdceb] bg-white px-4 py-2 text-sm font-semibold text-slate-700">Export PDF</button>
      </div>

      <section className="rounded-2xl border border-[#d4deea] bg-white p-4">
        <div className="overflow-x-auto rounded-xl border border-[#dbe6f3]">
          <table className="w-full min-w-[1700px] text-left text-sm">
            <thead className="bg-[#f1f6fc] text-[#64748b]">
              <tr>
                {["Employee Code", "Employee Name", "Department", "Present Days", "Absent Days", "Late Days", "Permission Hours", "WFH Days", "Total Working Hours", "Attendance %", "Work Summary Submitted", "Work Summary Pending"].map((h) => (
                  <th key={h} className="px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8edf5] text-slate-700">
              {reportRows.map(([employeeId, row]) => {
                const profile = profileMap.get(employeeId);
                const attendancePercent = workingDays ? ((row.present / workingDays) * 100).toFixed(1) : "0.0";
                const pending = Math.max(0, row.present - row.summaries);
                return (
                  <tr key={employeeId}>
                    <td className="px-4 py-3">{employeeCodeMap.get(employeeId) ?? "-"}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{profile?.full_name ?? "-"}</td>
                    <td className="px-4 py-3">{profile?.department ?? "-"}</td>
                    <td className="px-4 py-3">{row.present}</td>
                    <td className="px-4 py-3">{row.absent}</td>
                    <td className="px-4 py-3">{row.late}</td>
                    <td className="px-4 py-3">{row.permissionsHours.toFixed(1)}</td>
                    <td className="px-4 py-3">{row.wfh}</td>
                    <td className="px-4 py-3">{toHours(row.minutes)}</td>
                    <td className="px-4 py-3">{attendancePercent}%</td>
                    <td className="px-4 py-3">{row.summaries}</td>
                    <td className="px-4 py-3">{pending}</td>
                  </tr>
                );
              })}
              {!reportRows.length ? (
                <tr><td colSpan={12} className="px-4 py-8 text-center text-slate-500">No monthly report records found.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}
