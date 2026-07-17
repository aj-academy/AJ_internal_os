import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { EmployeeExperienceLayer } from "@/components/employee/EmployeeExperienceLayer";
import { PolicyAcceptanceGate } from "@/components/policies/PolicyAcceptanceGate";
import { requireRole } from "@/lib/auth/requireRole";

const employeeSidebarItems = [
  { label: "Dashboard", href: "/employee/dashboard" },
  { label: "My Attendance", href: "/employee/attendance" },
  { label: "My Tasks", href: "/employee/my-tasks" },
  { label: "Reminders & Calendar", href: "/employee/reminders" },
  { label: "Notifications", href: "/employee/notifications" },
  { label: "Student Master", href: "/employee/student-master" },
  { label: "College Visits", href: "/employee/college-visits" },
  { label: "Leave & Permission", href: "/employee/leave" },
  { label: "Reimbursement", href: "/employee/reimbursement" },
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
      notificationFallbackHref="/employee/my-tasks"
    >
      <PolicyAcceptanceGate />
      <EmployeeExperienceLayer />
      {children}
    </DashboardLayout>
  );
}
