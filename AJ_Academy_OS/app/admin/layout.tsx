import { DashboardLayout } from "@/components/layouts/DashboardLayout";
import { requireRole } from "@/lib/auth/requireRole";

const adminSidebarItems = [
  { label: "Dashboard", href: "/admin/dashboard" },
  { label: "Attendance System", href: "/admin/attendance" },
  {
    label: "HR, Attendance & Payroll",
    href: "/admin/hr-payroll/attendance-review",
    children: [
      { label: "Attendance Review", href: "/admin/hr-payroll/attendance-review" },
      { label: "Attendance Policies", href: "/admin/hr-payroll/attendance-policies" },
      { label: "Leave Management", href: "/admin/hr-payroll/leave-management" },
      { label: "Holiday Calendar", href: "/admin/hr-payroll/holidays" },
      { label: "Salary Structures", href: "/admin/hr-payroll/salary-structures" },
      { label: "Payroll Settings", href: "/admin/hr-payroll/payroll-settings" },
      { label: "Salary Adjustments", href: "/admin/hr-payroll/salary-adjustments" },
      { label: "Monthly Payroll", href: "/admin/hr-payroll/monthly-payroll" },
      { label: "Payslips", href: "/admin/hr-payroll/payslips" },
      { label: "Salary Queries", href: "/admin/hr-payroll/salary-queries" },
      { label: "Payroll Reports", href: "/admin/hr-payroll/reports" },
    ],
  },
  { label: "Counselling", href: "/admin/counselling" },
  {
    label: "Academic Management",
    href: "/admin/academic/overview",
    children: [
      { label: "Academic Overview", href: "/admin/academic/overview" },
      { label: "Academic Catalog", href: "/admin/academic/catalog" },
      { label: "Mentor Allocation", href: "/admin/academic/mentor-allocation" },
      { label: "Calendar & Reports", href: "/admin/academic/reports" },
      { label: "Student Query Monitoring", href: "/admin/academic/queries" },
    ],
  },
  { label: "Reminders & Calendar", href: "/admin/reminders" },
  { label: "User Master", href: "/admin/employee-master" },
  { label: "Student Master", href: "/admin/student-master" },
  { label: "College Visits", href: "/admin/college-visits" },
  { label: "Project Master", href: "/admin/project-master" },
  { label: "Task Assignment", href: "/admin/task-assignment" },
  { label: "Freelance Management", href: "/admin/freelancers" },
  { label: "Finance & Expenses", href: "/admin/finance" },
  { label: "Reimbursements", href: "/admin/reimbursements" },
  { label: "Company Policies", href: "/admin/policies" },
  { label: "Portfolio", href: "/admin/portfolio" },
  { label: "Reports & Analytics", href: "/admin/reports" },
  { label: "Settings", href: "/admin/settings" },
  { label: "Notification Diagnostics", href: "/admin/notification-diagnostics" },
];

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { profile, userEmail } = await requireRole(["super_admin", "admin"]);

  return (
    <DashboardLayout
      roleLabel="Admin Panel"
      sidebarItems={adminSidebarItems}
      userName={profile.full_name ?? "Admin User"}
      userEmail={userEmail}
      notificationFallbackHref="/admin/task-assignment"
    >
      {children}
    </DashboardLayout>
  );
}
