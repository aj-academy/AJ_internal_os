import { RemindersWorkbench } from "@/components/reminders/RemindersWorkbench";
import { requireRole } from "@/lib/auth/requireRole";

export default async function AdminRemindersPage() {
  const { profile } = await requireRole(["super_admin", "admin"]);
  return <RemindersWorkbench role="admin" currentUserId={profile.id} />;
}
