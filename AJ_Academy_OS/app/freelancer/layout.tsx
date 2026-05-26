import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { requireRole } from "@/lib/auth/requireRole";

const freelancerSidebarItems = [
  { label: "Dashboard", href: "/freelancer/dashboard" },
  { label: "My Attendance", href: "/freelancer/attendance" },
  { label: "Assign Tasks", href: "/freelancer/assign-tasks" },
  { label: "Leave", href: "/freelancer/leaves" },
];

export default async function FreelancerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile, userEmail } = await requireRole(["freelancer"]);

  return (
    <DashboardLayout
      roleLabel="Freelancer Panel"
      sidebarItems={freelancerSidebarItems}
      userName={profile.full_name ?? "Freelancer"}
      userEmail={userEmail}
      notificationFallbackHref="/freelancer/attendance"
    >
      {children}
    </DashboardLayout>
  );
}
