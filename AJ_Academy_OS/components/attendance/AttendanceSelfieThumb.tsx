"use client";

type AttendanceSelfieThumbProps = {
  url: string | null | undefined;
  alt?: string;
  size?: "sm" | "md";
};

export function AttendanceSelfieThumb({ url, alt = "Check-in selfie", size = "sm" }: AttendanceSelfieThumbProps) {
  if (!url?.trim()) {
    return <span className="text-xs text-[#94a3b8]">—</span>;
  }

  const dim = size === "md" ? "h-12 w-12" : "h-9 w-9";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title="Open full-size selfie"
      className="inline-block shrink-0"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        className={`${dim} rounded-md border border-[#e8dcc8] bg-[#f8fafc] object-cover shadow-sm`}
      />
    </a>
  );
}
