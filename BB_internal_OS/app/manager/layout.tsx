import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { requireRole } from "@/lib/auth/requireRole";

const managerSidebarItems = [
  { label: "Dashboard", href: "/manager/dashboard" },
  { label: "Team Attendance", href: "/manager/dashboard" },
  { label: "Project Master", href: "/manager/project-master" },
  { label: "Task Assignment", href: "/manager/task-assignment" },
  { label: "Finance", href: "/manager/finance" },
  { label: "Work Summary", href: "/manager/dashboard" },
  { label: "Reports", href: "/manager/dashboard" },
];

export default async function ManagerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile, userEmail } = await requireRole(["manager"]);

  return (
    <DashboardLayout
      roleLabel="Manager Panel"
      sidebarItems={managerSidebarItems}
      userName={profile.full_name ?? "Manager"}
      userEmail={userEmail}
      notificationFallbackHref="/manager/task-assignment"
    >
      {children}
    </DashboardLayout>
  );
}
