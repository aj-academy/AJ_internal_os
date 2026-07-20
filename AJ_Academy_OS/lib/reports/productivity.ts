/**
 * Productivity score weights (Reports & Analytics — Performance).
 * Scores each component 0–100, then applies weights.
 */
export const PRODUCTIVITY_WEIGHTS = {
  calls: 0.3,
  crmUpdates: 0.2,
  followups: 0.2,
  tasks: 0.15,
  admissions: 0.1,
  attendance: 0.05,
} as const;

export type ProductivityInputs = {
  /** Completed / connected calls in range */
  callsDone: number;
  /** Target calls for 100% (soft cap) */
  callsTarget?: number;
  /** CRM / lead activity updates in range */
  crmUpdates: number;
  crmTarget?: number;
  /** Completed follow-ups in range */
  followupsDone: number;
  followupsTarget?: number;
  /** Task completion ratio 0–1 */
  taskCompletionRatio: number;
  /** Admissions / conversions in range */
  admissions: number;
  admissionsTarget?: number;
  /** Attendance present ratio 0–1 */
  attendanceRatio: number;
};

function cappedPct(done: number, target: number) {
  if (target <= 0) return done > 0 ? 100 : 0;
  return Math.min(100, Math.round((done / target) * 1000) / 10);
}

export function computeProductivityScore(input: ProductivityInputs): {
  score: number;
  components: Record<keyof typeof PRODUCTIVITY_WEIGHTS, number>;
} {
  const callsTarget = input.callsTarget ?? 20;
  const crmTarget = input.crmTarget ?? 30;
  const followupsTarget = input.followupsTarget ?? 15;
  const admissionsTarget = input.admissionsTarget ?? 5;

  const components = {
    calls: cappedPct(input.callsDone, callsTarget),
    crmUpdates: cappedPct(input.crmUpdates, crmTarget),
    followups: cappedPct(input.followupsDone, followupsTarget),
    tasks: Math.round(Math.min(1, Math.max(0, input.taskCompletionRatio)) * 1000) / 10,
    admissions: cappedPct(input.admissions, admissionsTarget),
    attendance: Math.round(Math.min(1, Math.max(0, input.attendanceRatio)) * 1000) / 10,
  };

  const score = Math.round(
    components.calls * PRODUCTIVITY_WEIGHTS.calls +
      components.crmUpdates * PRODUCTIVITY_WEIGHTS.crmUpdates +
      components.followups * PRODUCTIVITY_WEIGHTS.followups +
      components.tasks * PRODUCTIVITY_WEIGHTS.tasks +
      components.admissions * PRODUCTIVITY_WEIGHTS.admissions +
      components.attendance * PRODUCTIVITY_WEIGHTS.attendance,
  );

  return { score: Math.min(100, score), components };
}
