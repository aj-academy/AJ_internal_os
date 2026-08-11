/**
 * Normalize stored selfie reference to a storage object path.
 * Legacy rows may store full public URLs; new rows store path only.
 */
export const ATTENDANCE_SELFIES_BUCKET = "attendance-selfies";

export function normalizeAttendanceSelfiePath(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const s = stored.trim();
  if (!s) return null;

  const markers = [
    "/object/public/attendance-selfies/",
    "/object/sign/attendance-selfies/",
    "/storage/v1/object/public/attendance-selfies/",
    "/storage/v1/object/sign/attendance-selfies/",
  ];
  for (const marker of markers) {
    const idx = s.indexOf(marker);
    if (idx >= 0) {
      return decodeURIComponent(s.slice(idx + marker.length).split("?")[0] || "").replace(/^\/+/, "") || null;
    }
  }

  // Generic supabase URL containing the bucket name
  const bucketIdx = s.indexOf("/attendance-selfies/");
  if (s.startsWith("http") && bucketIdx >= 0) {
    return decodeURIComponent(s.slice(bucketIdx + "/attendance-selfies/".length).split("?")[0] || "").replace(
      /^\/+/,
      "",
    ) || null;
  }

  if (s.startsWith("http")) return null;
  return s.replace(/^\/+/, "");
}

export function hasAttendanceSelfie(stored: string | null | undefined): boolean {
  return Boolean(normalizeAttendanceSelfiePath(stored));
}
