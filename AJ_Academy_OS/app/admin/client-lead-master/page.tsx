import { redirect } from "next/navigation";

/** Legacy Client / Lead Master URL → Student Master */
export default function LegacyClientLeadMasterRedirect() {
  redirect("/admin/student-master");
}
