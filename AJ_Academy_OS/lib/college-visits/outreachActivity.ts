/**
 * Maps `college_visit_activities.activity_type` values onto the three outreach
 * flags that colour the Call / WhatsApp / Email icons.
 *
 * `college_visits` has no `phone_called` / `whatsapp_sent` / `email_sent`
 * columns (unlike `clients`), so the activity log is the only durable record of
 * outreach. Deriving the flags from it means an icon reflects what actually
 * happened rather than what this browser tab happens to remember.
 *
 * Keep the keys in sync with the `activity_type` strings written by the outreach
 * handlers in CollegeVisitsWorkbench and TaskSubsectionEntityTables.
 */
export type CollegeOutreachFlagKey = "phoneCalled" | "whatsappSent" | "emailSent";

const ACTIVITY_TYPE_TO_FLAG: Record<string, CollegeOutreachFlagKey> = {
  "phone call": "phoneCalled",
  "call outcome": "phoneCalled",
  college_call: "phoneCalled",
  "whatsapp message": "whatsappSent",
  college_whatsapp: "whatsappSent",
  email: "emailSent",
  college_email: "emailSent",
};

export function flagForActivityType(activityType: string | null | undefined): CollegeOutreachFlagKey | null {
  if (!activityType) return null;
  return ACTIVITY_TYPE_TO_FLAG[activityType.trim().toLowerCase()] ?? null;
}

export type CollegeOutreachFlags = {
  phoneCalled?: boolean;
  whatsappSent?: boolean;
  emailSent?: boolean;
};

/** Folds activity rows into per-college flags. */
export function foldOutreachFlags(
  rows: { college_visit_id: string | null; activity_type: string | null }[],
): Record<string, CollegeOutreachFlags> {
  const out: Record<string, CollegeOutreachFlags> = {};
  for (const row of rows) {
    if (!row.college_visit_id) continue;
    const flag = flagForActivityType(row.activity_type);
    if (!flag) continue;
    const current = out[row.college_visit_id] ?? {};
    current[flag] = true;
    out[row.college_visit_id] = current;
  }
  return out;
}

/**
 * Merges server-derived flags with optimistic local ones. A flag is sticky:
 * once either side says an activity happened, the icon stays green, so the
 * optimistic click does not flicker back to red before the refetch lands.
 */
export function mergeOutreachFlags(
  base: CollegeOutreachFlags | undefined,
  overlay: CollegeOutreachFlags | undefined,
): CollegeOutreachFlags {
  return {
    phoneCalled: Boolean(base?.phoneCalled || overlay?.phoneCalled),
    whatsappSent: Boolean(base?.whatsappSent || overlay?.whatsappSent),
    emailSent: Boolean(base?.emailSent || overlay?.emailSent),
  };
}
