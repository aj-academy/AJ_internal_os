/** Production origin for manifest metadata (absolute URLs required for stable Android WebAPK). */
export function resolvePwaSiteOrigin(): string | null {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) {
    try {
      const origin = new URL(explicit).origin;
      if (!origin.includes("localhost") && !origin.includes("127.0.0.1")) {
        return origin;
      }
    } catch {
      /* fall through */
    }
  }

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (!vercelHost) return null;

  const host = vercelHost.replace(/^https?:\/\//, "").replace(/\/$/, "");
  return `https://${host}`;
}

export function pwaAbsoluteUrl(origin: string | null, path: string): string {
  return origin ? `${origin}${path}` : path;
}

/** Cache-busted asset URL for manifest icons (Android caches by URL). */
export function pwaAssetUrl(origin: string | null, path: string, version: string): string {
  const base = pwaAbsoluteUrl(origin, path);
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}v=${encodeURIComponent(version)}`;
}
