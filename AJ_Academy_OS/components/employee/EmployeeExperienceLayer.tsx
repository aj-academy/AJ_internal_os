"use client";

import { AttendanceDevicePermissionDialog } from "@/components/employee/AttendanceDevicePermissionDialog";
import { DailyMoodSurveyDialog } from "@/components/employee/DailyMoodSurveyDialog";
import { TaskAssignmentPopup } from "@/components/employee/TaskAssignmentPopup";

/** Device permissions, mood survey + task assignment popups for all employee routes. */
export function EmployeeExperienceLayer() {
  return (
    <>
      <AttendanceDevicePermissionDialog />
      <DailyMoodSurveyDialog />
      <TaskAssignmentPopup />
    </>
  );
}
