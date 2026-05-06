export default function EmployeeMasterLoading() {
  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div className="space-y-2">
        <div className="h-3 w-32 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-96 animate-pulse rounded bg-slate-100" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, idx) => (
          <div key={idx} className="h-24 animate-pulse rounded-2xl border border-[#dbe6f3] bg-slate-100" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-12">
        <div className="h-[420px] animate-pulse rounded-2xl border border-[#dbe6f3] bg-slate-100 xl:col-span-8" />
        <div className="h-[420px] animate-pulse rounded-2xl border border-[#dbe6f3] bg-slate-100 xl:col-span-4" />
      </div>
    </section>
  );
}
