/**
 * Productivity score (0–100) used across Reports & Analytics.
 * Weights mirror the product brief: calls, CRM, tasks, follow-ups, admissions, attendance.
 */
export type ProductivityInputs = {
  callsAttempted: number;
  callsConnected: number;
  crmUpdates: number;
  tasksCompleted: number;
  tasksAssigned: number;
  followupsCompleted: number;
  followupsDue: number;
  admissions: number;
  presentDays: number;
  expectedWorkDays: number;
};

export type ProductivityBand = "red" | "yellow" | "green";

/**
 * Maximum points per component, so the score breakdown shown in the UI is read
 * from the formula rather than restated next to it.
 */
export const PRODUCTIVITY_PART_MAX = {
  calls: 25,
  crm: 15,
  tasks: 20,
  followups: 15,
  admissions: 15,
  attendance: 10,
} as const;

export const PRODUCTIVITY_PART_LABELS: Record<keyof typeof PRODUCTIVITY_PART_MAX, string> = {
  calls: "Calls",
  crm: "CRM updates",
  tasks: "Tasks",
  followups: "Follow-ups",
  admissions: "Admissions",
  attendance: "Attendance",
};

export function computeProductivityScore(input: ProductivityInputs): {
  score: number;
  band: ProductivityBand;
  parts: Record<string, number>;
} {
  const callRate =
    input.callsAttempted > 0 ? input.callsConnected / input.callsAttempted : input.callsConnected > 0 ? 1 : 0;
  const callVolume = Math.min(1, input.callsAttempted / 20);
  const calls = (callRate * 0.6 + callVolume * 0.4) * PRODUCTIVITY_PART_MAX.calls;

  const crm = Math.min(1, input.crmUpdates / 15) * PRODUCTIVITY_PART_MAX.crm;

  const taskRate =
    input.tasksAssigned > 0 ? input.tasksCompleted / input.tasksAssigned : input.tasksCompleted > 0 ? 1 : 0;
  const tasks = taskRate * PRODUCTIVITY_PART_MAX.tasks;

  const fuRate =
    input.followupsDue > 0
      ? input.followupsCompleted / input.followupsDue
      : input.followupsCompleted > 0
        ? 1
        : 0;
  const followups = fuRate * PRODUCTIVITY_PART_MAX.followups;

  const admissions = Math.min(1, input.admissions / 3) * PRODUCTIVITY_PART_MAX.admissions;

  const attendance =
    input.expectedWorkDays > 0
      ? Math.min(1, input.presentDays / input.expectedWorkDays) * PRODUCTIVITY_PART_MAX.attendance
      : input.presentDays > 0
        ? PRODUCTIVITY_PART_MAX.attendance
        : 0;

  const score = Math.round(
    Math.min(100, Math.max(0, calls + crm + tasks + followups + admissions + attendance)),
  );
  const band: ProductivityBand = score < 60 ? "red" : score < 80 ? "yellow" : "green";

  return {
    score,
    band,
    parts: {
      calls: Math.round(calls),
      crm: Math.round(crm),
      tasks: Math.round(tasks),
      followups: Math.round(followups),
      admissions: Math.round(admissions),
      attendance: Math.round(attendance),
    },
  };
}

export function isConnectedOutcome(outcome: string | null | undefined): boolean {
  const o = (outcome || "").trim().toLowerCase();
  return o.startsWith("connected") || o.includes("admission confirmed") || o.includes("ready to join");
}

export function isAdmissionLead(row: {
  admission_status?: string | null;
  status?: string | null;
}): boolean {
  const a = (row.admission_status || "").toLowerCase();
  const s = (row.status || "").toLowerCase();
  return a.includes("admit") || s === "admitted";
}
