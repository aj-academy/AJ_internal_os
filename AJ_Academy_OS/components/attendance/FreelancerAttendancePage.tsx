import { MemberAttendancePage } from "@/components/attendance/MemberAttendancePage";

/** Freelancer attendance uses the shared member page with selfie check-in. */
export function FreelancerAttendancePage() {
  return <MemberAttendancePage memberLabel="Freelancer" requireSelfie />;
}
