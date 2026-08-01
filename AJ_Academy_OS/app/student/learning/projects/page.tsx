"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";

type Item = {
  recipient: { id: string; status: string; project_id?: string };
  project: {
    id: string;
    title: string;
    description: string | null;
    problem_statement?: string | null;
    final_deadline: string | null;
    status: string;
    total_marks?: number;
  } | null;
};

type Milestone = {
  id: string;
  title: string;
  milestone_key: string | null;
  instructions: string | null;
  due_date: string | null;
  sort_order: number;
  max_marks: number;
};

type Submission = {
  id: string;
  milestone_id: string | null;
  submission_version: number;
  text_response: string | null;
  github_url: string | null;
  demo_url: string | null;
  files: { name?: string; path?: string; mime?: string | null; size?: number; bucket?: string }[];
  status: string;
  marks: number | null;
  mentor_feedback: string | null;
  submitted_at: string;
};

type Detail = {
  project: Item["project"];
  recipient: { status: string } | null;
  milestones: Milestone[];
  submissions: Submission[];
};

export default function StudentProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [milestoneId, setMilestoneId] = useState("");
  const [text, setText] = useState("");
  const [github, setGithub] = useState("");
  const [demo, setDemo] = useState("");
  const [fileMeta, setFileMeta] = useState<{
    name: string;
    path: string;
    mime: string | null;
    size: number;
    bucket?: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHint(null);
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

  const open = async (id: string) => {
    setActiveId(id);
    setError(null);
    setSuccess(null);
    setText("");
    setGithub("");
    setDemo("");
    setFileMeta(null);
    const res = await fetch(`/api/lms/projects/${id}`, { credentials: "include" });
    const json = (await res.json()) as Detail & { error?: string; hint?: string };
    if (!res.ok) {
      setError(json.error || "Could not open project.");
      if (json.hint) setHint(json.hint);
      return;
    }
    setDetail(json);
    setMilestoneId(json.milestones?.[0]?.id || "");
  };

  const upload = async (file: File) => {
    if (!activeId || !milestoneId) {
      setError("Select a milestone before uploading.");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("project_id", activeId);
    fd.set("milestone_id", milestoneId);
    const res = await fetch("/api/lms/uploads/project-submission", {
      method: "POST",
      credentials: "include",
      body: fd,
    });
    const json = (await res.json()) as {
      error?: string;
      hint?: string;
      file?: { name: string; path: string; mime: string | null; size: number; bucket?: string };
    };
    if (!res.ok) {
      setError(json.error || "Upload failed.");
      if (json.hint) setHint(json.hint);
      return;
    }
    setFileMeta(json.file || null);
    setSuccess("File uploaded. Submit to finalize.");
  };

  const submit = async () => {
    if (!activeId || !milestoneId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/lms/projects/${activeId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestone_id: milestoneId,
          text_response: text,
          github_url: github,
          demo_url: demo,
          files: fileMeta ? [fileMeta] : [],
        }),
      });
      const json = (await res.json()) as { error?: string; hint?: string; result?: { submission_version?: number } };
      if (!res.ok) {
        setError(json.error || "Submit failed.");
        if (json.hint) setHint(json.hint);
        return;
      }
      setSuccess(`Milestone submitted (v${json.result?.submission_version ?? 1}).`);
      await open(activeId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const selectedMilestone = detail?.milestones.find((m) => m.id === milestoneId) || null;

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Learning & assessments"
        title="Projects"
        description="Academic projects and milestone submissions."
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
          {loading ? (
            <p className="text-sm text-[#64748b]">Loading…</p>
          ) : !items.length ? (
            <p className="rounded-xl border border-dashed border-[#e8dcc8] px-4 py-10 text-center text-sm text-[#64748b]">
              No projects assigned yet.
            </p>
          ) : (
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.recipient.id}>
                  <button
                    type="button"
                    className={`w-full rounded-xl border px-4 py-3 text-left ${
                      activeId === item.project?.id ? "border-[#c9a227] bg-[#fff8e8]" : "border-[#eef2f7] bg-[#f8fbff]"
                    }`}
                    onClick={() => item.project?.id && void open(item.project.id)}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <p className="font-semibold text-[#0f172a]">{item.project?.title || "Project"}</p>
                      <span className="text-xs capitalize text-[#64748b]">{item.recipient.status}</span>
                    </div>
                    {item.project?.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-[#334155]">{item.project.description}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-[#64748b]">
                      {item.project?.final_deadline ? `Deadline ${item.project.final_deadline}` : "No deadline"}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          {!detail ? (
            <p className="text-sm text-[#64748b]">Select a project to view milestones and submit work.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a]">{detail.project?.title}</h2>
                {detail.project?.problem_statement ? (
                  <p className="mt-1 text-[#334155]">{detail.project.problem_statement}</p>
                ) : null}
                <p className="mt-1 text-xs capitalize text-[#64748b]">Status: {detail.recipient?.status}</p>
              </div>

              <label className="block">
                Milestone
                <select
                  className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                  value={milestoneId}
                  onChange={(e) => {
                    setMilestoneId(e.target.value);
                    setFileMeta(null);
                  }}
                >
                  {detail.milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} ({m.max_marks} marks)
                    </option>
                  ))}
                </select>
              </label>
              {selectedMilestone?.instructions ? (
                <p className="rounded-lg bg-[#f8fbff] px-3 py-2 text-[#334155]">{selectedMilestone.instructions}</p>
              ) : null}

              <label className="block">
                Notes / write-up
                <textarea
                  className="mt-1 min-h-[80px] w-full rounded-lg border border-[#dbe6f3] px-3 py-2"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block">
                  GitHub URL
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                    value={github}
                    onChange={(e) => setGithub(e.target.value)}
                  />
                </label>
                <label className="block">
                  Demo URL
                  <input
                    className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                    value={demo}
                    onChange={(e) => setDemo(e.target.value)}
                  />
                </label>
              </div>
              <label className="block">
                Attachment
                <input
                  type="file"
                  className="mt-1 block w-full text-xs"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void upload(f);
                  }}
                />
              </label>
              {fileMeta ? <p className="text-xs text-[#64748b]">Ready: {fileMeta.name}</p> : null}
              <Button
                className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
                disabled={submitting || !milestoneId}
                onClick={() => void submit()}
              >
                {submitting ? "Submitting…" : "Submit milestone"}
              </Button>

              <div>
                <h3 className="font-semibold text-[#0f172a]">Your submissions</h3>
                {!detail.submissions.length ? (
                  <p className="mt-2 text-xs text-[#64748b]">None yet.</p>
                ) : (
                  <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
                    {detail.submissions.map((s) => {
                      const ms = detail.milestones.find((m) => m.id === s.milestone_id);
                      return (
                        <li key={s.id} className="rounded-lg border border-[#eef2f7] bg-[#f8fbff] px-3 py-2">
                          <p className="font-medium text-[#0f172a]">
                            {ms?.title || "Milestone"} · v{s.submission_version}
                          </p>
                          <p className="text-xs capitalize text-[#64748b]">
                            {s.status}
                            {s.marks != null ? ` · ${s.marks} marks` : ""}
                          </p>
                          {s.mentor_feedback ? <p className="mt-1 text-[#334155]">{s.mentor_feedback}</p> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
