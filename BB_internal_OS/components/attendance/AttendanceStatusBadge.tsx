import { cn } from "@/lib/utils";

interface AttendanceStatusBadgeProps {
  status: string;
}

const statusStyles: Record<string, string> = {
  Present: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Absent: "bg-rose-50 text-rose-700 border-rose-200",
  Late: "bg-amber-50 text-amber-700 border-amber-200",
  "Half Day": "bg-orange-50 text-orange-700 border-orange-200",
  Leave: "bg-slate-100 text-slate-700 border-slate-200",
  "Remote Work": "bg-sky-50 text-sky-700 border-sky-200",
  "Field Visit": "bg-violet-50 text-violet-700 border-violet-200",
  Office: "bg-blue-50 text-blue-700 border-blue-200",
  Remote: "bg-indigo-50 text-indigo-700 border-indigo-200",
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Rejected: "bg-rose-50 text-rose-700 border-rose-200",
  Submitted: "bg-cyan-50 text-cyan-700 border-cyan-200",
};

export function AttendanceStatusBadge({ status }: AttendanceStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold",
        statusStyles[status] ?? "bg-slate-100 text-slate-700 border-slate-200",
      )}
    >
      {status}
    </span>
  );
}
