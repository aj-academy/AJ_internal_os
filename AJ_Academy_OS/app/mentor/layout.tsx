import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { MentorExperienceLayer } from "@/components/mentor/MentorExperienceLayer";
import { requireRole } from "@/lib/auth/requireRole";

const mentorSidebarItems = [
  { label: "Dashboard", href: "/mentor/dashboard" },
  { label: "My Attendance", href: "/mentor/attendance" },
  {
    label: "Learning Management",
    href: "/mentor/learning/overview",
    children: [
      { label: "Mentor Overview", href: "/mentor/learning/overview" },
      { label: "Assignment Management", href: "/mentor/learning/assignments" },
      { label: "Project Management", href: "/mentor/learning/projects" },
      { label: "Study Materials", href: "/mentor/learning/materials" },
      { label: "Student Queries", href: "/mentor/learning/queries" },
    ],
  },
  { label: "Assign Tasks", href: "/mentor/assign-tasks" },
  { label: "My Tasks", href: "/mentor/my-tasks" },
  { label: "Counselling", href: "/mentor/counselling" },
  { label: "Reimbursement", href: "/mentor/reimbursement" },
  { label: "My Profile", href: "/mentor/profile" },
];

export default async function MentorLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile, userEmail } = await requireRole(["mentor"]);

  return (
    <DashboardLayout
      roleLabel="Mentor Panel"
      sidebarItems={mentorSidebarItems}
      userName={profile.full_name ?? "Mentor"}
      userEmail={userEmail}
      notificationFallbackHref="/mentor/my-tasks"
    >
      <MentorExperienceLayer />
      {children}
    </DashboardLayout>
  );
}
