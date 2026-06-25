import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { MentorExperienceLayer } from "@/components/mentor/MentorExperienceLayer";
import { requireRole } from "@/lib/auth/requireRole";

const mentorSidebarItems = [
  { label: "Dashboard", href: "/mentor/dashboard" },
  { label: "My Attendance", href: "/mentor/attendance" },
  { label: "Assign Tasks", href: "/mentor/assign-tasks" },
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
