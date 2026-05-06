import { StatCard } from "@/components/dashboard/StatCard";
import {
  Activity,
  BadgeDollarSign,
  BriefcaseBusiness,
  CalendarCheck2,
  Clock3,
  ReceiptText,
  TrendingUp,
  UserCheck2,
} from "lucide-react";

const stats = [
  { title: "Today’s Attendance", value: "7", trend: "+3.4%", icon: UserCheck2, description: "Employees marked present today." },
  { title: "Leave Requests", value: "14", trend: "+1.1%", icon: CalendarCheck2, description: "Awaiting approval this week.", variant: "rose" as const },
  { title: "Active Projects", value: "21", trend: "+2.7%", icon: BriefcaseBusiness, description: "Projects currently in execution." },
  { title: "Pending Tasks", value: "28", trend: "+5.2%", icon: Clock3, description: "Open tasks pending assignment." },
  { title: "Monthly Expenses", value: "35", trend: "-1.6%", icon: ReceiptText, description: "Expense entries this month." },
  { title: "Expense Approvals", value: "42", trend: "+4.3%", icon: BadgeDollarSign, description: "Claims pending review queue." },
  { title: "Revenue Summary", value: "49", trend: "+7.9%", icon: TrendingUp, description: "Revenue momentum from last month.", variant: "rose" as const },
  { title: "Work Summary", value: "56", trend: "+2.1%", icon: Activity, description: "Team productivity summary score." },
];

export default function AdminDashboardPage() {
  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">
            Internal Operations
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-[#0f172a]">Admin Dashboard</h2>
          <p className="mt-2 text-sm text-[#64748b]">
            Overview of attendance, projects, expenses and team activity.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button className="rounded-full border border-[#d4deea] bg-white px-4 py-2 text-sm font-medium text-[#334155]">
            This Month
          </button>
          <button className="rounded-full bg-[#2563eb] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8]">
            Generate Report
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <article className="rounded-[24px] border border-[#cfe0ff] bg-gradient-to-br from-[#f3f8ff] via-[#ebf3ff] to-[#e3edff] p-6 shadow-[0_8px_18px_rgba(37,99,235,0.12)] lg:col-span-6 xl:col-span-5">
          <p className="text-sm font-medium text-[#475569]">Operations Score</p>
          <div className="mt-2 flex items-end gap-3">
            <p className="text-5xl font-semibold leading-none text-[#0f172a]">87.4%</p>
            <span className="rounded-full border border-[#cfe0ff] bg-white/90 px-2.5 py-1 text-xs font-semibold text-[#1d4ed8]">
              +7.9%
            </span>
          </div>
          <p className="mt-2 text-sm text-[#64748b]">vs last month</p>
        </article>

        {[
          { label: "Present Today", value: "7" },
          { label: "Active Projects", value: "21" },
          { label: "Pending Tasks", value: "28" },
        ].map((metric) => (
          <article
            key={metric.label}
            className="rounded-[22px] border border-[#dbe6f3] bg-white p-5 shadow-[0_6px_16px_rgba(15,23,42,0.06)] lg:col-span-2 xl:col-span-2"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">{metric.label}</p>
            <p className="mt-3 text-3xl font-semibold text-[#0f172a]">{metric.value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((item) => (
          <StatCard
            key={item.title}
            title={item.title}
            value={item.value}
            trend={item.trend}
            description={item.description}
            icon={item.icon}
            variant={item.variant}
          />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-12">
        <section className="rounded-[22px] border border-[#dbe6f3] bg-[#fbfdff] p-5 xl:col-span-7">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-[#0f172a]">Attendance Snapshot</h3>
            <button className="rounded-full border border-[#d4deea] bg-white px-3 py-1.5 text-xs font-medium text-[#334155]">
              View All
            </button>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[#dbe6f3] bg-white">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-[#f1f6fc] text-xs uppercase tracking-wide text-[#64748b]">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Check In</th>
                  <th className="px-4 py-3">Work Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e8edf5] text-[#334155]">
                {[
                  ["Armin A.", "Operations", "Present", "09:01 AM", "On track with sprint goals"],
                  ["Mikasa A.", "Finance", "Late", "09:34 AM", "Pending invoice review"],
                  ["Eren Y.", "Engineering", "WFH", "08:58 AM", "Feature QA and bug fixes"],
                  ["Levi K.", "HR", "Leave", "-", "Approved leave for today"],
                ].map(([name, dept, status, checkIn, summary]) => (
                  <tr key={name}>
                    <td className="px-4 py-3 font-medium text-[#0f172a]">{name}</td>
                    <td className="px-4 py-3">{dept}</td>
                    <td className="px-4 py-3">
                      <span
                        className={[
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          status === "Present" && "bg-[#e7f6ee] text-[#1f9d55]",
                          status === "Late" && "bg-[#fff4e5] text-[#d97706]",
                          status === "Leave" && "bg-[#f5f2f0] text-[#8a8178]",
                          status === "WFH" && "bg-[#f0edf9] text-[#6b4fb0]",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{checkIn}</td>
                    <td className="px-4 py-3">{summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-4 rounded-[22px] border border-[#dbe6f3] bg-[#fbfdff] p-5 xl:col-span-5">
          <h3 className="text-lg font-semibold text-[#0f172a]">Business Overview</h3>

          <div className="rounded-2xl border border-[#dbe6f3] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-[#334155]">Revenue Summary</p>
              <span className="text-xs text-[#64748b]">+7.9%</span>
            </div>
            <div className="flex h-20 items-end gap-2">
              {[22, 28, 26, 34, 31, 40, 46].map((h, idx) => (
                <span
                  key={idx}
                  className="w-full rounded-t-md bg-gradient-to-t from-[#3b82f6] to-[#dbeafe]"
                  style={{ height: `${h * 1.2}px` }}
                />
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#dbe6f3] bg-white p-4">
            <p className="text-sm font-medium text-[#334155]">Expense Trend</p>
            <div className="mt-4 space-y-3">
              {[68, 54, 72].map((value, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs text-[#64748b]">
                    <span>Week {idx + 1}</span>
                    <span>{value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-[#e6edf7]">
                    <div
                      className="h-2 rounded-full bg-gradient-to-r from-[#2563eb] to-[#93c5fd]"
                      style={{ width: `${value}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#dbe6f3] bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium text-[#334155]">Project Status</p>
              <span className="text-xs text-[#64748b]">21 active</span>
            </div>
            <div className="space-y-2 text-xs text-[#64748b]">
              <div className="flex items-center justify-between rounded-xl bg-[#eaf1ff] px-3 py-2">
                <span>On Track</span>
                <span className="font-semibold text-[#2563eb]">13</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[#f8f2ed] px-3 py-2">
                <span>At Risk</span>
                <span className="font-semibold text-[#d97706]">5</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-[#eef8f1] px-3 py-2">
                <span>Completed</span>
                <span className="font-semibold text-[#1f9d55]">3</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
