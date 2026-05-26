import { Suspense } from "react";
import { TaskAssignmentPage } from "@/components/task/TaskAssignmentPage";

export default function FreelancerAssignTasksRoute() {
  return (
    <Suspense
      fallback={
        <section className="rounded-[24px] border border-[#e8dcc8] bg-white p-8 text-sm text-[#6b5d4d]">
          Loading tasks…
        </section>
      }
    >
      <TaskAssignmentPage role="freelancer" variant="assigner" />
    </Suspense>
  );
}
