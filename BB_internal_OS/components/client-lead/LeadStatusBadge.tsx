import { Badge } from "@/components/ui/badge";
import type { LeadStatus } from "@/types/clientLead";

const statusStyleMap: Record<LeadStatus, string> = {
  Lead: "bg-slate-100 text-slate-700 border-slate-200",
  Contacted: "bg-blue-100 text-blue-700 border-blue-200",
  Converted: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Lost: "bg-rose-100 text-rose-700 border-rose-200",
};

export function LeadStatusBadge({ status }: { status: LeadStatus | null }) {
  const label = status ?? "Lead";
  const style = status ? statusStyleMap[status] : statusStyleMap.Lead;

  return <Badge className={style}>{label}</Badge>;
}
