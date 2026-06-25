import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { requireRole } from "@/lib/auth/requireRole";

const adminSidebarItems = [
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Attendance System", href: "/admin/attendance" },
  { label: "Counselling", href: "/admin/counselling" },
  { label: "User Master", href: "/admin/employee-master" },
  { label: "Client / Lead Master", href: "/admin/client-lead-master" },
  { label: "Project Master", href: "/admin/project-master" },
  { label: "Task Assignment", href: "/admin/task-assignment" },
  { label: "Freelance Management", href: "/admin/freelancers" },
  { label: "Finance & Expenses", href: "/admin/finance" },
  { label: "Reimbursements", href: "/admin/reimbursements" },
  { label: "Company Policies", href: "/admin/policies" },
  { label: "Portfolio", href: "/admin/portfolio" },
  { label: "Reports", href: "/admin/reports" },
  { label: "Settings", href: "/admin/settings" },
];

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile, userEmail } = await requireRole(["super_admin", "admin"]);

  return (
    <DashboardLayout
      roleLabel="Admin Panel"
      sidebarItems={adminSidebarItems}
      userName={profile.full_name ?? "Admin User"}
      userEmail={userEmail}
      notificationFallbackHref="/admin/task-assignment"
    >
      {children}
    </DashboardLayout>
  );
}
