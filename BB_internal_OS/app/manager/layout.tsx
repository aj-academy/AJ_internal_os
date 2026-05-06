import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { requireRole } from "@/lib/auth/requireRole";

const managerSidebarItems = [
  { label: "Dashboard", href: "/manager/dashboard" },
  { label: "Team Attendance", href: "/manager/dashboard" },
  { label: "Project Master", href: "/manager/dashboard" },
  { label: "Task Assignment", href: "/manager/dashboard" },
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
    >
      {children}
    </DashboardLayout>
  );
}
