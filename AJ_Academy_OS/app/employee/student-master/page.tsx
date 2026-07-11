import { Suspense } from "react";
import { StudentMasterWorkbench } from "@/components/student-lead-master/StudentMasterWorkbench";

export default function EmployeeStudentMasterPage() {
  return (
    <Suspense fallback={<section className="rounded-[24px] border border-[#d4deea] bg-white p-8 text-sm text-[#64748b]">Loading Student Master…</section>}>
      <StudentMasterWorkbench role="employee" fullAccess />
    </Suspense>
  );
}
