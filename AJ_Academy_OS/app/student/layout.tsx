import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { PolicyAcceptanceGate } from "@/components/policies/PolicyAcceptanceGate";
import { StudentExperienceLayer } from "@/components/student/StudentExperienceLayer";
import { requireRole } from "@/lib/auth/requireRole";

const studentSidebarItems = [
  { label: "Dashboard", href: "/student/dashboard" },
  { label: "My Attendance", href: "/student/attendance" },
  { label: "My Tasks", href: "/student/my-tasks" },
  { label: "My Portfolio", href: "/student/portfolio" },
  { label: "My Counselling", href: "/student/counselling" },
  { label: "Leave & Permission", href: "/student/leave" },
  { label: "Company Policies", href: "/student/policies" },
  { label: "My Profile", href: "/student/profile" },
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
      <PolicyAcceptanceGate />
      <StudentExperienceLayer />
      {children}
    </DashboardLayout>
  );
}
