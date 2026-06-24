"use client";

import { DailyMoodSurveyDialog } from "@/components/employee/DailyMoodSurveyDialog";
import { TaskAssignmentPopup } from "@/components/employee/TaskAssignmentPopup";

/** Mood survey + task assignment popups for all freelancer routes. */
export function FreelancerExperienceLayer() {
  return (
    <>
      <DailyMoodSurveyDialog />
      <TaskAssignmentPopup fallbackTaskHref="/freelancer/my-tasks" />
    </>
  );
}
