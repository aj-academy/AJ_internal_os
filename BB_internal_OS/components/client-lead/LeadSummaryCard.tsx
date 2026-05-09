interface LeadSummaryCardProps {
  title: string;
  value: number | string;
  loading?: boolean;
  accent?: "rose";
}

export function LeadSummaryCard({ title, value, loading = false, accent }: LeadSummaryCardProps) {
  return (
    <article
      className={[
        "rounded-[20px] border p-5 shadow-[0_8px_18px_rgba(15,23,42,0.06)]",
        accent === "rose" ? "border-rose-200 bg-rose-50/50" : "border-[#dbe6f3] bg-white",
      ].join(" ")}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-[#64748b]">{title}</p>
      {loading ? (
        <div className="mt-3 h-8 w-16 animate-pulse rounded-md bg-[#e8edf5]" />
      ) : (
        <p className={["mt-3 text-3xl font-semibold", accent === "rose" ? "text-rose-800" : "text-[#0f172a]"].join(" ")}>
          {value}
        </p>
      )}
    </article>
  );
}
