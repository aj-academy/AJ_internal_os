import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { PolicyAcceptanceGate } from "@/components/policies/PolicyAcceptanceGate";
import { requireRole } from "@/lib/auth/requireRole";

const employeeSidebarItems = [
  { label: "Dashboard", href: "/employee/dashboard" },
  { label: "My Attendance", href: "/employee/attendance" },
  { label: "My Permission", href: "/employee/permission" },
  { label: "Client / Lead Master", href: "/employee/client-lead-master" },
  { label: "Project Master", href: "/employee/project-master" },
  { label: "My Tasks", href: "/employee/my-tasks" },
  { label: "Expense Claims", href: "/employee/finance" },
  { label: "My Leave", href: "/employee/dashboard" },
  { label: "My Expenses", href: "/employee/dashboard" },
  { label: "Company Policies", href: "/employee/policies" },
  { label: "My Profile", href: "/employee/dashboard" },
];

export default async function EmployeeLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile, userEmail } = await requireRole(["employee"]);

  return (
    <DashboardLayout
      roleLabel="Employee Panel"
      sidebarItems={employeeSidebarItems}
      userName={profile.full_name ?? "Employee"}
      userEmail={userEmail}
    >
      <PolicyAcceptanceGate />
      {children}
    </DashboardLayout>
  );
}
