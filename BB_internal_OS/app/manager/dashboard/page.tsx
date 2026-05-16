import { StatCard } from "@/components/dashboard/StatCard";

const stats = [
  "Team Attendance",
  "Active Projects",
  "Pending Tasks",
  "Overdue Tasks",
  "Work Summary Pending",
  "Team Productivity",
];

export default function ManagerDashboardPage() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Manager Dashboard</h2>
        <p className="text-sm text-slate-600">Track team execution and delivery status.</p>
      </div>
      <div className="stat-cards-grid">
        {stats.map((title, index) => (
          <StatCard key={title} title={title} value={`${(index + 1) * 4}`} hint="Demo Data" />
        ))}
      </div>
    </section>
  );
}
