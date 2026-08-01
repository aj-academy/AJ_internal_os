"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";

type Ticket = {
  id: string;
  ticket_number: string;
  category: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  is_sensitive: boolean;
  created_at: string;
};

const CATEGORIES = [
  { value: "assignment_clarification", label: "Assignment clarification" },
  { value: "project_clarification", label: "Project clarification" },
  { value: "test_issue", label: "Test issue" },
  { value: "study_material_issue", label: "Study material issue" },
  { value: "course_content", label: "Course content" },
  { value: "mentor_support", label: "Mentor support" },
  { value: "grade_clarification", label: "Grade clarification" },
  { value: "attendance", label: "Attendance" },
  { value: "fees", label: "Fees" },
  { value: "technical", label: "Technical issue" },
  { value: "faculty_concern", label: "Faculty concern (restricted)" },
  { value: "harassment_sensitive", label: "Sensitive / harassment (admin only)" },
  { value: "other", label: "Other" },
];

export function StudentTicketsWorkbench({ mode }: { mode: "student" | "mentor" | "admin" }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<{ id: string; body: string; created_at: string; author_id: string }[]>([]);
  const [reply, setReply] = useState("");
  const [form, setForm] = useState({
    category: "assignment_clarification",
    subject: "",
    description: "",
    priority: "medium",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
    try {
      const res = await fetch("/api/lms/tickets", { credentials: "include" });
      const json = (await res.json()) as { tickets?: Ticket[]; error?: string; hint?: string };
      if (!res.ok) {
        setError(json.error || "Could not load tickets.");
        setHint(json.hint || null);
        return;
      }
      setTickets(json.tickets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openTicket = async (id: string) => {
    setActiveId(id);
    setReply("");
    const res = await fetch(`/api/lms/tickets/${id}`, { credentials: "include" });
    const json = (await res.json()) as {
      messages?: { id: string; body: string; created_at: string; author_id: string }[];
      error?: string;
    };
    if (!res.ok) {
      setError(json.error || "Could not open ticket.");
      return;
    }
    setMessages(json.messages ?? []);
  };

  const createTicket = async () => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/lms/tickets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { error?: string; ticket?: Ticket };
      if (!res.ok) throw new Error(json.error || "Could not create ticket.");
      setSuccess(`Ticket ${json.ticket?.ticket_number} created.`);
      setForm({ category: "assignment_clarification", subject: "", description: "", priority: "medium" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const sendReply = async () => {
    if (!activeId || !reply.trim()) return;
    const res = await fetch(`/api/lms/tickets/${activeId}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: reply }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error || "Reply failed.");
      return;
    }
    setReply("");
    await openTicket(activeId);
    await load();
  };

  const resolveTicket = async (id: string) => {
    const res = await fetch(`/api/lms/tickets/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    if (!res.ok) {
      const json = (await res.json()) as { error?: string };
      setError(json.error || "Update failed.");
      return;
    }
    setSuccess("Ticket marked resolved.");
    await load();
  };

  return (
    <section className="space-y-5">
      <PageHeader
        kicker={mode === "student" ? "Learning & assessments" : "Learning management"}
        title="Queries & Complaints"
        description={
          mode === "student"
            ? "Raise academic queries or administrative complaints. Sensitive categories route to Admin only."
            : "Respond to student tickets in your scope. Sensitive complaints are hidden from mentors."
        }
        actions={
          <Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      {mode === "student" ? (
        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-[#0f172a]">New ticket</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Category
              <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Priority
              <select className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Subject
              <input className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={form.subject} onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))} />
            </label>
            <label className="text-sm sm:col-span-2">
              Description
              <textarea className="mt-1 min-h-[96px] w-full rounded-lg border border-[#dbe6f3] px-3 py-2" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </label>
          </div>
          <div className="mt-4">
            <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" disabled={submitting || !form.subject || !form.description} onClick={() => void createTicket()}>
              {submitting ? "Submitting…" : "Submit ticket"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-[#0f172a]">Tickets</h2>
          {loading ? (
            <p className="mt-4 text-sm text-[#64748b]">Loading…</p>
          ) : !tickets.length ? (
            <p className="mt-4 rounded-xl border border-dashed border-[#e8dcc8] px-4 py-8 text-center text-sm text-[#64748b]">No tickets.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${activeId === t.id ? "border-[#c9a227] bg-[#fff8e8]" : "border-[#eef2f7] bg-[#f8fbff]"}`}
                    onClick={() => void openTicket(t.id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-[#0f172a]">{t.subject}</span>
                      <span className="text-xs capitalize text-[#64748b]">{t.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#64748b]">
                      {t.ticket_number} · {t.priority}
                      {t.is_sensitive ? " · sensitive" : ""}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-[#0f172a]">Conversation</h2>
          {!activeId ? (
            <p className="mt-4 text-sm text-[#64748b]">Select a ticket.</p>
          ) : (
            <>
              <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto">
                {messages.map((m) => (
                  <li key={m.id} className="rounded-lg border border-[#eef2f7] bg-[#f8fbff] px-3 py-2 text-sm">
                    <p className="text-[#334155]">{m.body}</p>
                    <p className="mt-1 text-[11px] text-[#64748b]">{new Date(m.created_at).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 space-y-2">
                <textarea className="min-h-[72px] w-full rounded-lg border border-[#dbe6f3] px-3 py-2 text-sm" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply…" />
                <div className="flex flex-wrap gap-2">
                  <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" onClick={() => void sendReply()}>
                    Send reply
                  </Button>
                  {mode !== "student" ? (
                    <Button variant="outline" className="rounded-full" onClick={() => void resolveTicket(activeId)}>
                      Mark resolved
                    </Button>
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
