import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { requireRole } from "@/lib/auth/requireRole";

const accountsSidebarItems = [
  { label: "Dashboard", href: "/accounts/dashboard" },
  { label: "Finance & Expenses", href: "/accounts/dashboard" },
  { label: "Invoices & Payments", href: "/accounts/dashboard" },
  { label: "Expense Reports", href: "/accounts/dashboard" },
  { label: "Vendor Payments", href: "/accounts/dashboard" },
];

export default async function AccountsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile, userEmail } = await requireRole(["accounts"]);

  return (
    <DashboardLayout
      roleLabel="Accounts Panel"
      sidebarItems={accountsSidebarItems}
      userName={profile.full_name ?? "Accounts"}
      userEmail={userEmail}
    >
      {children}
    </DashboardLayout>
  );
}
