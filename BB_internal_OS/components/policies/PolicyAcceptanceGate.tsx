"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompanyPolicy } from "@/types/company-policy";

export function PolicyAcceptanceGate() {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState<CompanyPolicy[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    setLoadFailed(false);
    try {
      const res = await fetch("/api/employee/policies/status");
      const payload = (await res.json()) as {
        pendingPolicies?: CompanyPolicy[];
        error?: string;
      };
      if (!res.ok) {
        setLoadFailed(true);
        setError(payload.error ?? "Could not load policies.");
        setPending([]);
        return;
      }
      setPending(payload.pendingPolicies ?? []);
    } catch {
      setLoadFailed(true);
      setError("Could not load policies.");
      setPending([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const onAgree = async () => {
    if (!pending.length) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/employee/policies/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyIds: pending.map((p) => p.id) }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(payload.error ?? "Could not record agreement.");
        return;
      }
      setPending([]);
      await loadStatus();
    } catch {
      setError("Could not record agreement.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/35 backdrop-blur-sm">
        <div className="flex items-center gap-2 rounded-2xl border border-[#dbe6f3] bg-white px-6 py-4 text-sm text-slate-600 shadow-lg">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading company policies…
        </div>
      </div>
    );
  }

  if (loadFailed && !pending.length) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
        <div className="w-full max-w-md rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-xl">
          <h3 className="text-lg font-semibold text-[#0f172a]">Company policies unavailable</h3>
          <p className="mt-2 text-sm text-[#64748b]">{error}</p>
          <Button
            className="mt-6 w-full rounded-xl bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
            onClick={() => void loadStatus()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!pending.length) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_28px_60px_rgba(30,64,175,0.18)]">
        <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#eef4ff] text-[#2563eb]">
          <ShieldCheck className="h-6 w-6" />
        </div>
        <h3 className="text-xl font-semibold text-[#0f172a]">Company policies</h3>
        <p className="mt-2 text-sm text-[#64748b]">
          Please review each policy document (opens in a new tab), then confirm you agree before continuing.
        </p>

        <ul className="mt-4 space-y-3">
          {pending.map((policy) => (
            <li
              key={policy.id}
              className="rounded-xl border border-[#dbe6f3] bg-[#f8fbff] px-4 py-3"
            >
              <p className="font-medium text-slate-900">{policy.name}</p>
              <a
                href={policy.policy_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]"
              >
                Open policy document
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </li>
          ))}
        </ul>

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            className="flex-1 rounded-xl bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
            onClick={() => void onAgree()}
            disabled={submitting || !pending.length}
          >
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            I have read and agree
          </Button>
        </div>
      </div>
    </div>
  );
}
