import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { FreelancerExperienceLayer } from "@/components/freelancer/FreelancerExperienceLayer";
import { requireRole } from "@/lib/auth/requireRole";

const freelancerSidebarItems = [
  { label: "Dashboard", href: "/freelancer/dashboard" },
  { label: "My Attendance", href: "/freelancer/attendance" },
  { label: "Assign Tasks", href: "/freelancer/assign-tasks" },
  { label: "My Tasks", href: "/freelancer/my-tasks" },
  { label: "Reimbursement", href: "/freelancer/reimbursement" },
  {
    label: "Payroll",
    href: "/freelancer/hr-payroll/payslips",
    children: [
      { label: "My Payslips", href: "/freelancer/hr-payroll/payslips" },
      { label: "My Salary Structure", href: "/freelancer/hr-payroll/salary" },
      { label: "Salary Queries", href: "/freelancer/hr-payroll/queries" },
    ],
  },
  { label: "My Profile", href: "/freelancer/profile" },
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
      notificationFallbackHref="/freelancer/my-tasks"
    >
      <FreelancerExperienceLayer />
      {children}
    </DashboardLayout>
  );
}
