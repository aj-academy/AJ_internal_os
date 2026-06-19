"use client";

import { DailyMoodSurveyDialog } from "@/components/employee/DailyMoodSurveyDialog";
import { TaskAssignmentPopup } from "@/components/employee/TaskAssignmentPopup";

/** Mood survey + task assignment popups for all employee routes. */
export function EmployeeExperienceLayer() {
  return (
    <>
      <DailyMoodSurveyDialog />
      <TaskAssignmentPopup />
    </>
  );
}
