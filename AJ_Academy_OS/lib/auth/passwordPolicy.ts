/**
 * Client + server password policy for AJ OS recovery / set-password flows.
 * Keep aligned with Supabase Auth password settings (Dashboard → Auth → Providers → Email).
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 72;

export type PasswordCheck = {
  id: string;
  label: string;
  ok: boolean;
};

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    {
      id: "length",
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      ok: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: "max",
      label: `At most ${PASSWORD_MAX_LENGTH} characters`,
      ok: password.length > 0 && password.length <= PASSWORD_MAX_LENGTH,
    },
    {
      id: "letter",
      label: "Contains a letter",
      ok: /[A-Za-z]/.test(password),
    },
    {
      id: "number",
      label: "Contains a number",
      ok: /\d/.test(password),
    },
  ];
}

export function passwordStrengthScore(password: string): 0 | 1 | 2 | 3 | 4 {
  if (!password) return 0;
  const checks = passwordChecks(password);
  const passed = checks.filter((c) => c.ok).length;
  let score = Math.min(4, passed) as 0 | 1 | 2 | 3 | 4;
  if (password.length >= 14 && score < 4) score = (score + 1) as 0 | 1 | 2 | 3 | 4;
  if (/(password|123456|qwerty|ajacademy|ajos)/i.test(password)) {
    score = Math.max(0, score - 2) as 0 | 1 | 2 | 3 | 4;
  }
  return score;
}

export function passwordStrengthLabel(score: 0 | 1 | 2 | 3 | 4): string {
  return ["Too weak", "Weak", "Fair", "Good", "Strong"][score];
}

/** Returns a user-safe error or null if acceptable. Does not log the password. */
export function validateNewPassword(password: string, confirm: string): string | null {
  if (!password) return "New password is required.";
  if (!confirm) return "Confirm password is required.";
  if (password !== confirm) return "The passwords do not match.";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `The password does not meet the security requirements (minimum ${PASSWORD_MIN_LENGTH} characters).`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `The password does not meet the security requirements (maximum ${PASSWORD_MAX_LENGTH} characters).`;
  }
  const checks = passwordChecks(password);
  if (checks.some((c) => !c.ok)) {
    return "The password does not meet the security requirements.";
  }
  if (/(password|123456|qwerty|ajacademy|ajos)/i.test(password)) {
    return "The password does not meet the security requirements.";
  }
  return null;
}

export function friendlyAuthPasswordError(message: string): string {
  const lower = (message || "").toLowerCase();
  if (lower.includes("same password") || lower.includes("should be different")) {
    return "Choose a password that is different from your previous password.";
  }
  if (lower.includes("weak") || lower.includes("least") || lower.includes("characters")) {
    return "The password does not meet the security requirements.";
  }
  if (lower.includes("session") || lower.includes("jwt") || lower.includes("expired")) {
    return "This reset link is invalid or has expired.";
  }
  return "We could not update your password. Please try again.";
}
