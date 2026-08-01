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
    allow_late?: boolean;
  } | null;
};

type Detail = {
  assignment: Item["assignment"] & { max_attempts?: number };
  recipient: { status: string } | null;
  submissions: {
    id: string;
    attempt_number: number;
    submission_version: number;
    text_response: string | null;
    link_url: string | null;
    is_late: boolean;
    submitted_at: string;
    evaluation_status: string;
  }[];
  evaluations: {
    id: string;
    awarded_marks: number;
    max_marks: number;
    feedback_text: string | null;
    request_resubmission: boolean;
    evaluated_at: string;
    submission_id: string;
  }[];
};

export default function StudentAssignmentsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [text, setText] = useState("");
  const [link, setLink] = useState("");
  const [fileMeta, setFileMeta] = useState<{ name: string; path: string; mime: string | null; size: number } | null>(null);
  const [declaration, setDeclaration] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  const open = async (id: string) => {
    setActiveId(id);
    setError(null);
    setSuccess(null);
    setText("");
    setLink("");
    setFileMeta(null);
    setDeclaration(false);
    const res = await fetch(`/api/lms/assignments/${id}`, { credentials: "include" });
    const json = (await res.json()) as Detail & { error?: string };
    if (!res.ok) {
      setError(json.error || "Could not open assignment.");
      return;
    }
    setDetail(json);
  };

  const upload = async (file: File) => {
    if (!activeId) return;
    const fd = new FormData();
    fd.set("file", file);
    fd.set("assignment_id", activeId);
    const res = await fetch("/api/lms/uploads/assignment-submission", { method: "POST", credentials: "include", body: fd });
    const json = (await res.json()) as { error?: string; file?: { name: string; path: string; mime: string | null; size: number }; hint?: string };
    if (!res.ok) {
      setError(json.error || "Upload failed.");
      if (json.hint) setHint(json.hint);
      return;
    }
    setFileMeta(json.file || null);
    setSuccess("File uploaded. Submit to finalize.");
  };

  const submit = async () => {
    if (!activeId) return;
    if (!declaration) {
      setError("Confirm the submission declaration.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/lms/assignments/${activeId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text_response: text,
          link_url: link,
          files: fileMeta ? [fileMeta] : [],
          declaration: true,
        }),
      });
      const json = (await res.json()) as { error?: string; result?: { status?: string; is_late?: boolean } };
      if (!res.ok) throw new Error(json.error || "Submit failed.");
      setSuccess(`Submitted${json.result?.is_late ? " (late)" : ""} · status ${json.result?.status || "submitted"}.`);
      await open(activeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Learning & assessments"
        title="Assignments"
        description="Open an assignment to view instructions, upload files, and submit. Older submissions are kept as versions."
        actions={
          <Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-[#0f172a]">Assigned to you</h2>
          {loading ? (
            <p className="mt-4 text-sm text-[#64748b]">Loading…</p>
          ) : !items.length ? (
            <p className="mt-4 rounded-xl border border-dashed border-[#e8dcc8] px-4 py-10 text-center text-sm text-[#64748b]">No assignments yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {items.map((item) => (
                <li key={item.recipient.id}>
                  <button
                    type="button"
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${activeId === item.assignment?.id ? "border-[#c9a227] bg-[#fff8e8]" : "border-[#eef2f7] bg-[#f8fbff]"}`}
                    onClick={() => item.assignment && void open(item.assignment.id)}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[#0f172a]">{item.assignment?.title || "Assignment"}</span>
                      <span className="text-xs capitalize text-[#64748b]">{item.recipient.status}</span>
                    </div>
                    <p className="mt-1 text-xs text-[#64748b]">
                      {item.assignment?.due_at ? `Due ${new Date(item.assignment.due_at).toLocaleString()}` : "No due date"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          {!detail?.assignment ? (
            <p className="text-sm text-[#64748b]">Select an assignment.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a]">{detail.assignment.title}</h2>
                <p className="mt-1 text-[#334155]">{detail.assignment.description}</p>
                {detail.assignment.instructions ? (
                  <p className="mt-2 whitespace-pre-wrap text-[#475569]">{detail.assignment.instructions}</p>
                ) : null}
                <p className="mt-2 text-xs text-[#64748b]">
                  Your status: {detail.recipient?.status || "—"} · {detail.assignment.total_marks} marks
                </p>
              </div>

              {detail.evaluations[0] ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                  <p className="font-semibold text-emerald-900">
                    Grade: {detail.evaluations[0].awarded_marks}/{detail.evaluations[0].max_marks}
                  </p>
                  {detail.evaluations[0].feedback_text ? (
                    <p className="mt-1 text-emerald-900">{detail.evaluations[0].feedback_text}</p>
                  ) : null}
                  {detail.evaluations[0].request_resubmission ? (
                    <p className="mt-1 text-xs text-amber-800">Resubmission requested.</p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="block">
                  Text response
                  <textarea className="mt-1 min-h-[96px] w-full rounded-lg border border-[#dbe6f3] px-3 py-2" value={text} onChange={(e) => setText(e.target.value)} />
                </label>
                <label className="block">
                  Link (optional)
                  <input className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" />
                </label>
                <label className="block">
                  File upload (optional)
                  <input
                    type="file"
                    className="mt-1 block w-full text-xs"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void upload(f);
                    }}
                  />
                </label>
                {fileMeta ? <p className="text-xs text-[#64748b]">Uploaded: {fileMeta.name}</p> : null}
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={declaration} onChange={(e) => setDeclaration(e.target.checked)} />
                  I confirm this is my own work.
                </label>
                <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" disabled={submitting} onClick={() => void submit()}>
                  {submitting ? "Submitting…" : "Submit assignment"}
                </Button>
              </div>

              {detail.submissions.length ? (
                <div>
                  <h3 className="font-semibold text-[#0f172a]">Submission history</h3>
                  <ul className="mt-2 space-y-2">
                    {detail.submissions.map((s) => (
                      <li key={s.id} className="rounded-lg border border-[#eef2f7] bg-[#f8fbff] px-3 py-2 text-xs">
                        Attempt {s.attempt_number} v{s.submission_version} · {s.evaluation_status}
                        {s.is_late ? " · late" : ""} · {new Date(s.submitted_at).toLocaleString()}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
