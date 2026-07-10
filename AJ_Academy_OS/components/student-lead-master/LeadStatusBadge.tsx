import { Badge } from "@/components/ui/badge";

const DEFAULT_BADGE = "bg-slate-100 text-slate-700 border border-slate-200";

const statusStyles: Record<string, string> = {
  New: DEFAULT_BADGE,
  "New Lead": DEFAULT_BADGE,
  Lead: DEFAULT_BADGE,
  Contacted: "border border-blue-200 bg-blue-100 text-blue-800",
  Interested: "border border-purple-200 bg-purple-100 text-purple-800",
  "Follow-up": "border border-sky-200 bg-sky-100 text-sky-800",
  "Counselling Scheduled": "border border-amber-200 bg-amber-100 text-amber-900",
  "Fee Discussed": "border border-indigo-200 bg-indigo-100 text-indigo-800",
  "Meeting Scheduled": "border border-amber-200 bg-amber-100 text-amber-900",
  "Proposal Sent": "border border-indigo-200 bg-indigo-100 text-indigo-800",
  Negotiation: "border border-orange-200 bg-orange-100 text-orange-900",
  Admitted: "border border-emerald-200 bg-emerald-100 text-emerald-800",
  Converted: "border border-emerald-200 bg-emerald-100 text-emerald-800",
  Lost: "border border-rose-200 bg-rose-100 text-rose-800",
  "Not Interested": "border border-slate-200 bg-slate-200 text-slate-700",
};

export function LeadStatusBadge({ status }: { status: string | null | undefined }) {
  const label = status?.trim() || "New";
  const key = label === "Lead" || label === "New Lead" ? "New" : label;
  const style = statusStyles[key] ?? statusStyles[label] ?? DEFAULT_BADGE;
  const display = label === "Lead" || label === "New Lead" ? "New" : label;

  return <Badge className={[style, "whitespace-nowrap font-medium"].join(" ")}>{display}</Badge>;
}

export function ProposalStatusBadge({ status }: { status: string | null | undefined }) {
  const label = status?.trim() || "Not Sent";
  const style =
    label === "Accepted"
      ? "border border-emerald-200 bg-emerald-50 text-emerald-800"
      : label === "Rejected"
        ? "border border-rose-200 bg-rose-50 text-rose-800"
        : label === "Sent" || label === "Drafted"
          ? "border border-blue-200 bg-blue-50 text-blue-800"
          : "border border-slate-200 bg-slate-50 text-slate-700";

  return <Badge className={[style, "whitespace-nowrap font-medium"].join(" ")}>{label}</Badge>;
}
