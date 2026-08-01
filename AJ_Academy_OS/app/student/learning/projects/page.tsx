"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";

type Item = {
  recipient: { id: string; status: string };
  project: { id: string; title: string; description: string | null; final_deadline: string | null; status: string } | null;
};

export default function StudentProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lms/projects", { credentials: "include" });
      const json = (await res.json()) as { items?: Item[]; error?: string; hint?: string };
      if (!res.ok) {
        setError(json.error || "Could not load projects.");
        setHint(json.hint || null);
        return;
      }
      setItems(json.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-5">
      <PageHeader kicker="Learning & assessments" title="Projects" description="Academic projects assigned to you." actions={<Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>Refresh</Button>} />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div> : null}
      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        {loading ? (
          <p className="text-sm text-[#64748b]">Loading…</p>
        ) : !items.length ? (
          <p className="rounded-xl border border-dashed border-[#e8dcc8] px-4 py-10 text-center text-sm text-[#64748b]">No projects assigned yet.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.recipient.id} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-4 py-3">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold text-[#0f172a]">{item.project?.title || "Project"}</p>
                  <span className="text-xs capitalize text-[#64748b]">{item.recipient.status}</span>
                </div>
                {item.project?.description ? <p className="mt-1 text-sm text-[#334155]">{item.project.description}</p> : null}
                <p className="mt-2 text-xs text-[#64748b]">{item.project?.final_deadline ? `Deadline ${item.project.final_deadline}` : "No deadline"}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
