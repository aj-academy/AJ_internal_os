import { LeaveManagementPanel } from "@/components/leaves/LeaveManagementPanel";

export default function MentorLeavesPage() {
  return (
    <div className="space-y-8">
      <LeaveManagementPanel mode="apply" title="My leave requests" />
      <LeaveManagementPanel mode="mentor" title="Student leave approvals" />
    </div>
  );
}
