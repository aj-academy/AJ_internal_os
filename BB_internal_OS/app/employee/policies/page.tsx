"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type { CompanyPolicy } from "@/types/company-policy";

export default function EmployeePoliciesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policies, setPolicies] = useState<CompanyPolicy[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/employee/policies/status");
      const payload = (await res.json()) as { policies?: CompanyPolicy[]; error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not load policies.");
        setPolicies([]);
        return;
      }
      setPolicies(payload.policies ?? []);
    } catch {
      setError("Could not load policies.");
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
      <div>
        <h2 className="text-3xl font-semibold text-[#0f172a]">Company policies</h2>
        <p className="mt-1 text-sm text-slate-600">
          Official policy documents shared by HR and admin. Pending policies must be accepted when you log in.
        </p>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading policies…
        </div>
      ) : policies.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-500">No policies have been published yet.</p>
      ) : (
        <ul className="space-y-3">
          {policies.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#dbe6f3] bg-[#f8fbff] px-4 py-3"
            >
              <div>
                <p className="font-medium text-slate-900">{p.name}</p>
                <p className="text-xs text-slate-500">Updated {new Date(p.created_at).toLocaleDateString()}</p>
              </div>
              <a
                href={p.policy_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-full bg-[#2563eb] px-4 py-2 text-sm font-medium text-white hover:bg-[#1d4ed8]"
              >
                Open document
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
