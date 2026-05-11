import Link from "next/link";
import { CalendarClock, ClipboardCheck, ClipboardList, LayoutDashboard, Mail, Shield, User } from "lucide-react";
import { getUserProfile } from "@/lib/auth/getUserProfile";
import { createClient } from "@/lib/supabase/server";
import { EmployeeTaskPreview } from "@/components/employee/EmployeeTaskPreview";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateOnly(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
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

export default async function EmployeeDashboardPage() {
  const { profile, user } = await getUserProfile();
  const supabase = await createClient();

  const uid = user?.id;
  const today = todayISO();

  let todayAttendance: { status: string | null; check_in_time: string | null; check_out_time: string | null } | null = null;
  let totalTasks = 0;
  let openTasks = 0;
  let dueTodayTasks = 0;
  let overdueTasks = 0;
  let leavePending = 0;
  let permissionPending = 0;
  let policyCount = 0;
  let employeeCode: string | null = null;
  let workPhone: string | null = null;
  let joinedAt: string | null = null;
  let managerName: string | null = null;
  let managerEmail: string | null = null;

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
        <Link
          href="/employee/my-tasks"
          className="inline-flex h-10 items-center justify-center rounded-full bg-[#2563eb] px-5 text-sm font-medium text-white hover:bg-[#1d4ed8]"
        >
          Go to My Tasks
        </Link>
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
        <div className="mt-3 grid gap-4 md:grid-cols-2">
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

      <section className="scroll-mt-24 rounded-[22px] border border-[#dbe6f3] bg-white p-5 shadow-sm" id="my-leave">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Time off</p>
            <h3 className="mt-1 text-lg font-semibold text-[#0f172a]">My leave</h3>
            <p className="mt-1 text-sm text-[#64748b]">
              You have <strong className="text-[#0f172a]">{leavePending}</strong> leave request(s) waiting for approval. Submit new requests from
              your HR or attendance flow when your org enables it.
            </p>
          </div>
          <CalendarClock className="h-10 w-10 shrink-0 text-[#94a3b8]" />
        </div>
      </section>

      <EmployeeTaskPreview />

      <section className="scroll-mt-24 rounded-[22px] border border-[#dbe6f3] bg-[#f8fbff] p-5 shadow-sm" id="my-profile">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white text-lg font-semibold text-[#2563eb] ring-1 ring-[#dbe6f3]">
              {(profile?.full_name ?? "E")
                .split(" ")
                .map((s) => s[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">My profile</p>
              <h3 className="mt-1 text-xl font-semibold text-[#0f172a]">{profile?.full_name ?? "Employee"}</h3>
              <p className="mt-1 flex items-center gap-2 text-sm text-[#64748b]">
                <Mail className="h-4 w-4 shrink-0" />
                {user?.email ?? profile?.email ?? "—"}
              </p>
              <p className="mt-2 text-xs text-[#94a3b8]">
                Account ID: <span className="font-mono text-[#475569]">{uid ?? "—"}</span>
              </p>
            </div>
          </div>
        </div>

        <dl className="mt-6 grid gap-4 text-sm text-[#334155] sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-[#e8edf5] bg-white/80 p-3">
            <dt className="text-xs font-medium text-[#94a3b8]">Employee code</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">{employeeCode ?? "—"}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white/80 p-3">
            <dt className="text-xs font-medium text-[#94a3b8]">Department</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">{profile?.department ?? "—"}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white/80 p-3">
            <dt className="text-xs font-medium text-[#94a3b8]">Designation</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">{profile?.designation ?? "—"}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white/80 p-3">
            <dt className="text-xs font-medium text-[#94a3b8]">Work phone</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">{workPhone ?? "—"}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white/80 p-3">
            <dt className="text-xs font-medium text-[#94a3b8]">Joined company</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">{formatDateOnly(joinedAt)}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white/80 p-3">
            <dt className="text-xs font-medium text-[#94a3b8]">Profile created</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">{formatDateOnly(profile?.created_at)}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white/80 p-3 sm:col-span-2 lg:col-span-3">
            <dt className="text-xs font-medium text-[#94a3b8]">Reporting manager</dt>
            <dd className="mt-1 font-semibold text-[#0f172a]">
              {managerName ?? "—"}
              {managerEmail ? <span className="mt-0.5 block text-sm font-normal text-[#64748b]">{managerEmail}</span> : null}
            </dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white/80 p-3">
            <dt className="text-xs font-medium text-[#94a3b8]">Employment status</dt>
            <dd className="mt-1 font-semibold capitalize text-[#0f172a]">{profile?.status ?? "—"}</dd>
          </div>
          <div className="rounded-xl border border-[#e8edf5] bg-white/80 p-3">
            <dt className="text-xs font-medium text-[#94a3b8]">Access role</dt>
            <dd className="mt-1 font-semibold capitalize text-[#0f172a]">{profile?.role ?? "employee"}</dd>
          </div>
        </dl>

        <p className="mt-4 flex items-start gap-2 rounded-lg border border-[#dbe6f3] bg-white/60 px-3 py-2 text-xs text-[#64748b]">
          <User className="mt-0.5 h-4 w-4 shrink-0 text-[#94a3b8]" />
          To change legal name, department, or manager, contact HR or an administrator — employee self-service edits depend on your company
          policy.
        </p>
      </section>
    </section>
  );
}
