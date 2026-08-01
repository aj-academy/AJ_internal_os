"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";

type Summary = {
  assignments_published?: number;
  assignment_submissions_pending?: number;
  projects_active?: number;
  project_submissions_pending?: number;
  tests_published?: number;
  open_tickets?: number;
  active_enrolments?: number;
  active_allocations?: number;
  upcoming_events_7d?: number;
};

type EventRow = {
  id: string;
  title: string;
  event_type: string;
  starts_at: string;
  ends_at: string | null;
  visibility: string;
};

export default function AcademicReportsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [title, setTitle] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [eventType, setEventType] = useState("general");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    setWarning(null);
    try {
      const res = await fetch("/api/lms/reports", { credentials: "include" });
      const json = (await res.json()) as {
        events?: EventRow[];
        summary?: Summary | null;
        error?: string;
        hint?: string;
        warning?: string;
      };
      if (!res.ok) {
        setError(json.error || "Could not load reports.");
        setHint(json.hint || null);
        return;
      }
      setEvents(json.events ?? []);
      setSummary(json.summary ?? null);
      if (json.warning) setWarning(json.warning);
      if (json.hint) setHint(json.hint);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createEvent = async () => {
    setError(null);
    const res = await fetch("/api/lms/reports", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        event_type: eventType,
        visibility: "all",
      }),
    });
    const json = (await res.json()) as { error?: string; hint?: string };
    if (!res.ok) {
      setError(json.error || "Could not create event.");
      if (json.hint) setHint(json.hint);
      return;
    }
    setSuccess("Calendar event created.");
    setTitle("");
    setStartsAt("");
    await load();
  };

  const cards: { title: string; value: number | undefined }[] = [
    { title: "Published assignments", value: summary?.assignments_published },
    { title: "Pending assignment evals", value: summary?.assignment_submissions_pending },
    { title: "Active projects", value: summary?.projects_active },
    { title: "Pending project reviews", value: summary?.project_submissions_pending },
    { title: "Published tests", value: summary?.tests_published },
    { title: "Open tickets", value: summary?.open_tickets },
    { title: "Active enrolments", value: summary?.active_enrolments },
    { title: "Active allocations", value: summary?.active_allocations },
    { title: "Events next 7 days", value: summary?.upcoming_events_7d },
  ];

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Academic management"
        title="Calendar & Reports"
        description="LMS activity summary and academic calendar events (live Supabase data)."
        actions={
          <Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div> : null}
      {warning ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{warning}</div> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <article key={c.title} className="rounded-[20px] border border-[#dbe6f3] bg-white p-4 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-[#64748b]">{c.title}</p>
            <p className="mt-2 text-2xl font-semibold text-[#0f172a]">{loading ? "…" : (c.value ?? "—")}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-[#0f172a]">Add calendar event</h2>
          <div className="mt-3 space-y-2 text-sm">
            <label className="block">
              Title
              <input
                className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block">
              Starts at
              <input
                type="datetime-local"
                className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              />
            </label>
            <label className="block">
              Type
              <select
                className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
              >
                <option value="general">General</option>
                <option value="assignment_due">Assignment due</option>
                <option value="project_milestone">Project milestone</option>
                <option value="test">Test</option>
                <option value="exam">Exam</option>
                <option value="holiday">Holiday</option>
                <option value="presentation">Presentation</option>
                <option value="viva">Viva</option>
              </select>
            </label>
            <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" onClick={() => void createEvent()}>
              Create event
            </Button>
          </div>
        </div>

        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-[#0f172a]">Upcoming / recent events</h2>
          {!events.length ? (
            <p className="mt-4 text-sm text-[#64748b]">No events yet.</p>
          ) : (
            <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto text-sm">
              {events.map((e) => (
                <li key={e.id} className="rounded-xl border border-[#eef2f7] bg-[#f8fbff] px-3 py-2">
                  <p className="font-medium text-[#0f172a]">{e.title}</p>
                  <p className="text-xs capitalize text-[#64748b]">
                    {e.event_type.replaceAll("_", " ")} · {new Date(e.starts_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
