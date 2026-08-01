"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";

type Item = {
  recipient: { id: string; status: string; assignment_id: string };
  assignment: {
    id: string;
    title: string;
    description: string | null;
    instructions: string | null;
    due_at: string | null;
    total_marks: number;
    status: string;
  } | null;
};

export default function StudentAssignmentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch("/api/lms/assignments", { credentials: "include" });
      const json = (await res.json()) as { items?: Item[]; error?: string; hint?: string };
      if (!res.ok) {
        setError(json.error || "Could not load assignments.");
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
      <PageHeader
        kicker="Learning & assessments"
        title="Assignments"
        description="Assignments published to you by your mentor. Data comes from Supabase recipient records."
        actions={
          <Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div>
      ) : null}

      <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
        {loading ? (
          <p className="text-sm text-[#64748b]">Loading…</p>
        ) : !items.length ? (
          <p className="rounded-xl border border-dashed border-[#e8dcc8] px-4 py-10 text-center text-sm text-[#64748b]">
            No assignments assigned to you yet.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.recipient.id} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[#0f172a]">{item.assignment?.title || "Assignment"}</p>
                  <span className="text-xs capitalize text-[#64748b]">{item.recipient.status}</span>
                </div>
                {item.assignment?.description ? (
                  <p className="mt-1 text-sm text-[#334155]">{item.assignment.description}</p>
                ) : null}
                <p className="mt-2 text-xs text-[#64748b]">
                  {item.assignment?.due_at
                    ? `Due ${new Date(item.assignment.due_at).toLocaleString()}`
                    : "No due date"}
                  {item.assignment?.total_marks != null ? ` · ${item.assignment.total_marks} marks` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
