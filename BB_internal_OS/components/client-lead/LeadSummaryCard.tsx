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
        "rounded-[20px] border p-3 shadow-[0_8px_18px_rgba(15,23,42,0.06)] sm:p-5",
        accent === "rose" ? "border-rose-200 bg-rose-50/50" : "border-[#dbe6f3] bg-white",
      ].join(" ")}
    >
      <p className="text-[10px] font-medium uppercase leading-tight tracking-wide text-[#64748b] sm:text-xs">{title}</p>
      {loading ? (
        <div className="mt-2 h-7 w-14 animate-pulse rounded-md bg-[#e8edf5] sm:mt-3 sm:h-8 sm:w-16" />
      ) : (
        <p
          className={[
            "mt-2 text-xl font-semibold sm:mt-3 sm:text-3xl",
            accent === "rose" ? "text-rose-800" : "text-[#0f172a]",
          ].join(" ")}
        >
          {value}
        </p>
      )}
    </article>
  );
}
