import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { requireRole } from "@/lib/auth/requireRole";

const studentSidebarItems = [
  { label: "Dashboard", href: "/student/dashboard" },
  { label: "My Attendance", href: "/student/attendance" },
  { label: "My Tasks", href: "/student/my-tasks" },
  { label: "Leave", href: "/student/leaves" },
];

export default async function StudentLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile, userEmail } = await requireRole(["student"]);

  return (
    <DashboardLayout
      roleLabel="Student Panel"
      sidebarItems={studentSidebarItems}
      userName={profile.full_name ?? "Student"}
      userEmail={userEmail}
      notificationFallbackHref="/student/my-tasks"
    >
      {children}
    </DashboardLayout>
  );
}
