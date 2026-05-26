import { MapPin } from "lucide-react";

type AttendanceLocationBlockProps = {
  label: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  compact?: boolean;
};

function formatCoords(latitude: number, longitude: number) {
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function mapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
}

export function AttendanceLocationBlock({
  label,
  address,
  latitude,
  longitude,
  compact = false,
}: AttendanceLocationBlockProps) {
  const hasCoords = latitude !== null && longitude !== null;
  const display =
    address?.trim() || (hasCoords ? formatCoords(latitude!, longitude!) : "Not captured");

  return (
    <div className={compact ? "space-y-1" : "rounded-xl border border-[#ede4d4] bg-white p-3"}>
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[#6b5d4d]">
        <MapPin className="h-3.5 w-3.5 text-[#c9a227]" aria-hidden />
        {label}
      </p>
      <p className={`text-[#3d3428] ${compact ? "text-xs" : "text-sm"}`}>{display}</p>
      {hasCoords ? (
        <a
          href={mapsUrl(latitude!, longitude!)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-xs font-medium text-[#a68b2e] underline-offset-2 hover:underline"
        >
          Open in Maps
        </a>
      ) : null}
    </div>
  );
}
