interface LeadSummaryCardProps {
  title: string;
  value: number;
  loading?: boolean;
}

export function LeadSummaryCard({ title, value, loading = false }: LeadSummaryCardProps) {
  return (
    <article className="rounded-[20px] border border-[#dbe6f3] bg-white p-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
      <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">{title}</p>
      {loading ? (
        <div className="mt-3 h-8 w-16 animate-pulse rounded-md bg-[#e8edf5]" />
      ) : (
        <p className="mt-3 text-3xl font-semibold text-[#0f172a]">{value}</p>
      )}
    </article>
  );
}
