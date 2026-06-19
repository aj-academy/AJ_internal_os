export default function EmployeeLoading() {
  return (
    <section className="space-y-4 rounded-[24px] border border-[#d4deea] bg-white p-4 sm:p-6">
      <div className="h-8 w-48 animate-pulse rounded-md bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, idx) => (
          <div key={idx} className="h-24 animate-pulse rounded-2xl border border-[#dbe6f3] bg-slate-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-[#dbe6f3] bg-slate-100" />
    </section>
  );
}
