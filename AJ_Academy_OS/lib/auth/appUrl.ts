/** Canonical public app origin for auth redirects (password recovery, etc.). */
export function getAppOrigin(requestOrigin?: string | null): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      /* fall through */
    }
  }

  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return `https://${host}`;
  }

  if (requestOrigin) {
    try {
      return new URL(requestOrigin).origin;
    } catch {
      /* fall through */
    }
  }

  return "http://localhost:3000";
}

export const PASSWORD_RECOVERY_PATH = "/auth/reset-password";

export function passwordRecoveryRedirectTo(origin: string): string {
  const base = origin.replace(/\/$/, "");
  return `${base}/auth/callback?next=${encodeURIComponent(PASSWORD_RECOVERY_PATH)}`;
}
