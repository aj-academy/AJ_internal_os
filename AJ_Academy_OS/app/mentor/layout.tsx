import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { requireRole } from "@/lib/auth/requireRole";

const mentorSidebarItems = [
  { label: "Dashboard", href: "/mentor/dashboard" },
  { label: "My Tasks", href: "/mentor/my-tasks" },
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
      {children}
    </DashboardLayout>
  );
}
