import { StatCard } from "@/components/dashboard/StatCard";

const stats = [
  "Monthly Expenses",
  "Pending Approvals",
  "Vendor Payments",
  "Project Expenses",
  "Reimbursement Claims",
  "Payment Pending",
];

export default function AccountsDashboardPage() {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Accounts Dashboard</h2>
        <p className="text-sm text-slate-600">Financial approvals and payment pipeline view.</p>
      </div>
      <div className="stat-cards-grid">
        {stats.map((title, index) => (
          <StatCard key={title} title={title} value={`${(index + 1) * 5}`} hint="Demo Data" />
        ))}
      </div>
    </section>
  );
}
