import { EmployeeMyLeaveContent } from "@/components/employee/EmployeeMyLeaveContent";

export default function EmployeeLeavePage() {
  return (
    <section className="rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <EmployeeMyLeaveContent showBackLink />
    </section>
  );
}
