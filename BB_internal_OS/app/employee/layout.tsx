import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { PolicyAcceptanceGate } from "@/components/policies/PolicyAcceptanceGate";
import { requireRole } from "@/lib/auth/requireRole";

const employeeSidebarItems = [
  { label: "Dashboard", href: "/employee/dashboard" },
  { label: "My Attendance", href: "/employee/attendance" },
  { label: "My Permission", href: "/employee/permission" },
  { label: "My Tasks", href: "/employee/my-tasks" },
  { label: "My Leave", href: "/employee/leave" },
  { label: "Company Policies", href: "/employee/policies" },
  { label: "My Profile", href: "/employee/profile" },
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
