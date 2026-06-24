"use client";

import { DailyMoodSurveyDialog } from "@/components/employee/DailyMoodSurveyDialog";
import { TaskAssignmentPopup } from "@/components/employee/TaskAssignmentPopup";

/** Mood survey + task assignment popups for all mentor routes. */
export function MentorExperienceLayer() {
  return (
    <>
      <DailyMoodSurveyDialog />
      <TaskAssignmentPopup fallbackTaskHref="/mentor/my-tasks" />
    </>
  );
}
