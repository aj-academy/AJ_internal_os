import { redirect } from "next/navigation";

/** Legacy route — lead work lives under Student Master for employees. */
export default function EmployeeLeadManagementPage() {
  redirect("/employee/student-master");
}
