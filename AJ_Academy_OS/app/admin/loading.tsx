export default function AdminLoading() {
  return (
    <section className="space-y-4 rounded-[24px] border border-[#e8dcc8] bg-white p-4 sm:p-6">
      <div className="h-8 w-56 animate-pulse rounded-md bg-slate-200" />
      <div className="stat-cards-grid">
        {Array.from({ length: 8 }).map((_, idx) => (
          <div key={idx} className="h-28 animate-pulse rounded-2xl border border-[#dbe6f3] bg-slate-100" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl border border-[#dbe6f3] bg-slate-100" />
    </section>
  );
}
