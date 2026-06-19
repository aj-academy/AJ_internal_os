import { Suspense } from "react";
import { TaskAssignmentPage } from "@/components/task/TaskAssignmentPage";

export default function EmployeeTasksRoute() {
  return (
    <Suspense fallback={<section className="rounded-[24px] border border-[#d4deea] bg-white p-8 text-sm text-[#64748b]">Loading tasks…</section>}>
      <TaskAssignmentPage role="employee" />
    </Suspense>
  );
}
