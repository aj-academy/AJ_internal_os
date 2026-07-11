import { Suspense } from "react";
import { CollegeVisitsWorkbench } from "@/components/college-visits/CollegeVisitsWorkbench";

export default function AdminCollegeVisitsPage() {
  return (
    <Suspense fallback={<section className="rounded-[24px] border border-[#d4deea] bg-white p-8 text-sm text-[#64748b]">Loading College Visits…</section>}>
      <CollegeVisitsWorkbench role="admin" />
    </Suspense>
  );
}
