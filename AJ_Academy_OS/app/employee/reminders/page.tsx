import { RemindersWorkbench } from "@/components/reminders/RemindersWorkbench";
import { requireRole } from "@/lib/auth/requireRole";

export default async function EmployeeRemindersPage() {
  const { profile } = await requireRole(["employee"]);
  return <RemindersWorkbench role="employee" currentUserId={profile.id} />;
}
