import { Suspense } from "react";
import { TaskAssignmentPage } from "@/components/task/TaskAssignmentPage";

export default function AdminTaskAssignmentRoute() {
  return (
    <Suspense fallback={<section className="rounded-[24px] border border-[#e8dcc8] bg-white p-8 text-sm text-[#64748b]">Loading tasks…</section>}>
      <TaskAssignmentPage role="admin" />
    </Suspense>
  );
}
