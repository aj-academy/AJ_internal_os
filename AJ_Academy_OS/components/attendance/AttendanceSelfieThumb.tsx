"use client";

import { useEffect, useState } from "react";

type AttendanceSelfieThumbProps = {
  /** @deprecated Prefer attendanceId — raw URLs should not be stored permanently. */
  url?: string | null;
  attendanceId?: string | null;
  alt?: string;
  size?: "sm" | "md";
};

/**
 * Renders check-in selfie via short-lived signed URL when attendanceId is provided.
 */
export function AttendanceSelfieThumb({
  url,
  attendanceId,
  alt = "Check-in selfie",
  size = "sm",
}: AttendanceSelfieThumbProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setSignedUrl(null);

    if (!attendanceId?.trim()) {
      setSignedUrl(url?.trim() || null);
      return;
    }

    void (async () => {
      try {
        const res = await fetch(
          `/api/attendance/selfie?attendanceId=${encodeURIComponent(attendanceId)}`,
          { credentials: "include" },
        );
        const json = (await res.json()) as { url?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || !json.url) {
          setFailed(true);
          return;
        }
        setSignedUrl(json.url);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [attendanceId, url]);

  if (failed) {
    return <span className="text-xs text-[#94a3b8]">Unavailable</span>;
  }
  if (!signedUrl) {
    if (attendanceId) {
      return <span className="text-xs text-[#94a3b8]">…</span>;
    }
    return <span className="text-xs text-[#94a3b8]">—</span>;
  }

  const dim = size === "md" ? "h-12 w-12" : "h-9 w-9";

  return (
    <a
      href={signedUrl}
      target="_blank"
      rel="noopener noreferrer"
      title="Open full-size selfie"
      className="inline-block shrink-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={signedUrl}
        alt={alt}
        className={`${dim} rounded-md border border-[#e8dcc8] bg-[#f8fafc] object-cover shadow-sm`}
      />
    </a>
  );
}
