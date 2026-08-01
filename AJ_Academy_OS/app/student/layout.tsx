import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { PolicyAcceptanceGate } from "@/components/policies/PolicyAcceptanceGate";
import { StudentExperienceLayer } from "@/components/student/StudentExperienceLayer";
import { requireRole } from "@/lib/auth/requireRole";

const studentSidebarItems = [
  { label: "Dashboard", href: "/student/dashboard" },
  {
    label: "Learning & Assessments",
    href: "/student/learning/overview",
    children: [
      { label: "My Overview", href: "/student/learning/overview" },
      { label: "Assignments", href: "/student/learning/assignments" },
      { label: "Projects", href: "/student/learning/projects" },
      { label: "Study Materials", href: "/student/learning/materials" },
      { label: "Queries & Complaints", href: "/student/learning/queries" },
    ],
  },
  { label: "My Attendance", href: "/student/attendance" },
  { label: "My Tasks", href: "/student/my-tasks" },
  { label: "My Portfolio", href: "/student/portfolio" },
  { label: "My Counselling", href: "/student/counselling" },
  { label: "Leave & Permission", href: "/student/leave" },
  { label: "Student Policies", href: "/student/policies" },
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
