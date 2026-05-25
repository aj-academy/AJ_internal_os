import { Suspense } from "react";

export default function AdminPoliciesLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <section className="rounded-[24px] border border-[#e8dcc8] bg-white p-8 text-sm text-[#6b5d4d]">
          Loading policies…
        </section>
      }
    >
      {children}
    </Suspense>
  );
}
