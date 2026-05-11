import { getUserProfile } from "@/lib/auth/getUserProfile";
import { ClientLeadMasterPage } from "@/components/client-lead/ClientLeadMasterPage";
import { TaskAssignmentPage } from "@/components/task/TaskAssignmentPage";

const sections = [
  { title: "My Attendance", value: "Present", subtitle: "Today attendance status" },
  { title: "Check In / Check Out", value: "09:04 / -", subtitle: "Latest punch details" },
  { title: "My Tasks", value: "7", subtitle: "Open assigned tasks" },
  { title: "My Leave Balance", value: "12", subtitle: "Remaining leave days" },
  { title: "My Expense Claims", value: "3", subtitle: "Pending expense claims" },
  { title: "Company Policies", value: "5", subtitle: "Recently updated policies" },
  { title: "My Profile", value: "View", subtitle: "Personal details and preferences" },
];

export default async function EmployeeDashboardPage() {
  const { profile, user } = await getUserProfile();

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div>
        <h2 className="text-3xl font-semibold text-[#0f172a]">Employee Dashboard</h2>
        <p className="mt-1 text-sm text-slate-600">Your attendance, tasks, leaves and personal work summary.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Employee</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{profile?.full_name ?? "Employee"}</p>
          <p className="text-sm text-slate-600">{user?.email ?? profile?.email ?? "-"}</p>
        </div>
        <div className="rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Department</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{profile?.department ?? "-"}</p>
        </div>
        <div className="rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Designation</p>
          <p className="mt-2 text-lg font-semibold text-slate-900">{profile?.designation ?? "-"}</p>
        </div>
        <div className="rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Status</p>
          <p className="mt-2 text-lg font-semibold capitalize text-slate-900">{profile?.status ?? "-"}</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {sections.map((section) => (
          <article
            key={section.title}
            className="rounded-[20px] border border-[#dbe6f3] bg-white p-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_26px_rgba(30,64,175,0.11)]"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{section.title}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{section.value}</p>
            <p className="mt-1 text-xs text-slate-600">{section.subtitle}</p>
          </article>
        ))}
      </div>

      {/* Same modules as dedicated routes — identical UI and Supabase behavior */}
      <ClientLeadMasterPage role="employee" />
      <TaskAssignmentPage role="employee" />
    </section>
  );
}
