"use client";

import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import { downloadUrlInSameWindow } from "@/lib/browser/sameWindowDownload";

type AssignmentRow = { id: string; title: string; status: string; total_marks: number };
type ProjectRow = { id: string; title: string; status: string; total_marks: number };

type AssignmentDetail = {
  assignment: AssignmentRow;
  recipients: { id: string; student_id: string; student_name?: string; status: string }[];
  submissions: {
    id: string;
    student_id: string;
    student_name?: string;
    attempt_number: number;
    submission_version: number;
    text_response: string | null;
    link_url: string | null;
    files?: { name?: string; path?: string; mime?: string | null; size?: number }[];
    is_late: boolean;
    evaluation_status: string;
    submitted_at: string;
  }[];
};

type ProjectDetail = {
  project: ProjectRow;
  milestones: { id: string; title: string; max_marks: number }[];
  submissions: {
    id: string;
    student_id: string;
    student_name?: string;
    milestone_id: string | null;
    submission_version: number;
    text_response: string | null;
    github_url: string | null;
    demo_url: string | null;
    files?: { name?: string; path?: string; mime?: string | null; size?: number; bucket?: string }[];
    status: string;
    marks: number | null;
    mentor_feedback: string | null;
    submitted_at: string;
  }[];
};

async function openSignedDownload(args: {
  kind: "assignment_submission" | "project_submission";
  bucket: string;
  path: string;
  fileName?: string;
  submission_id: string;
}) {
  const res = await fetch("/api/lms/storage/signed-url", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...args, download: true }),
  });
  const json = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !json.url) throw new Error(json.error || "Could not open file.");
  await downloadUrlInSameWindow(json.url, args.fileName || "submission");
}

export default function MentorSubmissionsPage() {
  const [tab, setTab] = useState<"assignments" | "projects">("assignments");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [assignmentDetail, setAssignmentDetail] = useState<AssignmentDetail | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [marks, setMarks] = useState("");
  const [feedback, setFeedback] = useState("");
  const [resubmit, setResubmit] = useState(false);
  const [evalStatus, setEvalStatus] = useState("evaluated");
  const [selectedSubmission, setSelectedSubmission] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, pRes] = await Promise.all([
        fetch("/api/lms/assignments", { credentials: "include" }),
        fetch("/api/lms/projects", { credentials: "include" }),
      ]);
      const aJson = (await aRes.json()) as { assignments?: AssignmentRow[]; error?: string; hint?: string };
      const pJson = (await pRes.json()) as { projects?: ProjectRow[]; error?: string; hint?: string };
      if (!aRes.ok) {
        setError(aJson.error || "Could not load assignments.");
        setHint(aJson.hint || null);
        return;
      }
      if (!pRes.ok) {
        setError(pJson.error || "Could not load projects.");
        setHint(pJson.hint || null);
        return;
      }
      setAssignments(aJson.assignments ?? []);
      setProjects(pJson.projects ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openAssignment = async (id: string) => {
    setActiveId(id);
    setSelectedSubmission(null);
    setMarks("");
    setFeedback("");
    setResubmit(false);
    setProjectDetail(null);
    const res = await fetch(`/api/lms/assignments/${id}`, { credentials: "include" });
    const json = (await res.json()) as AssignmentDetail & { error?: string };
    if (!res.ok) {
      setError(json.error || "Could not open.");
      return;
    }
    setAssignmentDetail(json);
  };

  const openProject = async (id: string) => {
    setActiveId(id);
    setSelectedSubmission(null);
    setMarks("");
    setFeedback("");
    setEvalStatus("evaluated");
    setAssignmentDetail(null);
    const res = await fetch(`/api/lms/projects/${id}`, { credentials: "include" });
    const json = (await res.json()) as ProjectDetail & { error?: string; hint?: string };
    if (!res.ok) {
      setError(json.error || "Could not open.");
      if (json.hint) setHint(json.hint);
      return;
    }
    setProjectDetail(json);
  };

  const evaluateAssignment = async () => {
    if (!selectedSubmission) return;
    const res = await fetch(`/api/lms/submissions/${selectedSubmission}/evaluate`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        awarded_marks: Number(marks),
        feedback_text: feedback,
        request_resubmission: resubmit,
      }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(json.error || "Evaluation failed.");
      return;
    }
    setSuccess(resubmit ? "Returned for resubmission." : "Evaluation saved.");
    if (activeId) await openAssignment(activeId);
  };

  const evaluateProject = async () => {
    if (!selectedSubmission) return;
    const res = await fetch(`/api/lms/project-submissions/${selectedSubmission}/evaluate`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marks: Number(marks),
        feedback,
        status: evalStatus,
      }),
    });
    const json = (await res.json()) as { error?: string; hint?: string };
    if (!res.ok) {
      setError(json.error || "Evaluation failed.");
      if (json.hint) setHint(json.hint);
      return;
    }
    setSuccess(evalStatus === "revision_required" ? "Marked for revision." : "Project evaluation saved.");
    if (activeId) await openProject(activeId);
  };

  return (
    <section className="space-y-5">
      <PageHeader
        kicker="Learning management"
        title="Submissions & Evaluation"
        description="Review assignment and project milestone submissions, award marks, and request revisions."
        actions={
          <Button variant="outline" className="rounded-xl border-[#e8dcc8]" onClick={() => void load()}>
            Refresh
          </Button>
        }
      />
      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {hint ? <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">{hint}</div> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <div className="flex gap-2">
        <Button
          variant={tab === "assignments" ? "default" : "outline"}
          className={`rounded-full ${tab === "assignments" ? "bg-[#c9a227] text-white hover:bg-[#b8921f]" : "border-[#e8dcc8]"}`}
          onClick={() => {
            setTab("assignments");
            setActiveId(null);
            setAssignmentDetail(null);
            setProjectDetail(null);
            setSelectedSubmission(null);
          }}
        >
          Assignments
        </Button>
        <Button
          variant={tab === "projects" ? "default" : "outline"}
          className={`rounded-full ${tab === "projects" ? "bg-[#c9a227] text-white hover:bg-[#b8921f]" : "border-[#e8dcc8]"}`}
          onClick={() => {
            setTab("projects");
            setActiveId(null);
            setAssignmentDetail(null);
            setProjectDetail(null);
            setSelectedSubmission(null);
          }}
        >
          Projects
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          <h2 className="text-lg font-semibold text-[#0f172a]">{tab === "assignments" ? "Assignments" : "Projects"}</h2>
          {loading ? (
            <p className="mt-4 text-sm text-[#64748b]">Loading…</p>
          ) : tab === "assignments" ? (
            !assignments.length ? (
              <p className="mt-4 text-sm text-[#64748b]">No assignments.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {assignments.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${activeId === a.id ? "border-[#c9a227] bg-[#fff8e8]" : "border-[#eef2f7] bg-[#f8fbff]"}`}
                      onClick={() => void openAssignment(a.id)}
                    >
                      <p className="font-semibold text-[#0f172a]">{a.title}</p>
                      <p className="text-xs text-[#64748b]">
                        {a.status} · {a.total_marks} marks
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : !projects.length ? (
            <p className="mt-4 text-sm text-[#64748b]">No projects.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {projects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${activeId === p.id ? "border-[#c9a227] bg-[#fff8e8]" : "border-[#eef2f7] bg-[#f8fbff]"}`}
                    onClick={() => void openProject(p.id)}
                  >
                    <p className="font-semibold text-[#0f172a]">{p.title}</p>
                    <p className="text-xs text-[#64748b]">
                      {p.status} · {p.total_marks} marks
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-sm sm:p-6">
          {tab === "assignments" ? (
            !assignmentDetail ? (
              <p className="text-sm text-[#64748b]">Select an assignment.</p>
            ) : (
              <div className="space-y-4 text-sm">
                <div>
                  <h2 className="text-lg font-semibold text-[#0f172a]">{assignmentDetail.assignment.title}</h2>
                  <p className="text-xs text-[#64748b]">
                    Recipients: {assignmentDetail.recipients.length} · Submissions: {assignmentDetail.submissions.length}
                  </p>
                </div>
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {assignmentDetail.submissions.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={`w-full rounded-xl border px-3 py-2 text-left ${selectedSubmission === s.id ? "border-[#c9a227] bg-[#fff8e8]" : "border-[#eef2f7] bg-[#f8fbff]"}`}
                        onClick={() => {
                          setSelectedSubmission(s.id);
                          setMarks("");
                          setFeedback("");
                        }}
                      >
                        <p className="font-medium text-[#0f172a]">{s.student_name || s.student_id.slice(0, 8)}</p>
                        <p className="text-xs text-[#64748b]">
                          Attempt {s.attempt_number} v{s.submission_version} · {s.evaluation_status}
                          {s.is_late ? " · late" : ""}
                        </p>
                        {s.text_response ? <p className="mt-1 line-clamp-3 text-[#334155]">{s.text_response}</p> : null}
                        {s.link_url ? (
                          <a className="text-xs text-[#c9a227] underline" href={s.link_url} target="_blank" rel="noreferrer">
                            Link
                          </a>
                        ) : null}
                        {(s.files || []).map((f) =>
                          f.path ? (
                            <button
                              key={f.path}
                              type="button"
                              className="mt-1 block text-xs text-[#c9a227] underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openSignedDownload({
                                  kind: "assignment_submission",
                                  bucket: "assignment-submissions",
                                  path: f.path!,
                                  fileName: f.name,
                                  submission_id: s.id,
                                }).catch((err) => setError(err instanceof Error ? err.message : "Download failed."));
                              }}
                            >
                              Download {f.name || "file"}
                            </button>
                          ) : null,
                        )}
                      </button>
                    </li>
                  ))}
                </ul>

                {selectedSubmission ? (
                  <div className="space-y-2 rounded-xl border border-[#eef2f7] p-3">
                    <label>
                      Marks
                      <input
                        className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                        value={marks}
                        onChange={(e) => setMarks(e.target.value)}
                      />
                    </label>
                    <label>
                      Feedback
                      <textarea
                        className="mt-1 min-h-[72px] w-full rounded-lg border border-[#dbe6f3] px-3 py-2"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={resubmit} onChange={(e) => setResubmit(e.target.checked)} />
                      Request resubmission
                    </label>
                    <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" onClick={() => void evaluateAssignment()}>
                      Save evaluation
                    </Button>
                  </div>
                ) : null}
              </div>
            )
          ) : !projectDetail ? (
            <p className="text-sm text-[#64748b]">Select a project.</p>
          ) : (
            <div className="space-y-4 text-sm">
              <div>
                <h2 className="text-lg font-semibold text-[#0f172a]">{projectDetail.project.title}</h2>
                <p className="text-xs text-[#64748b]">
                  Milestones: {projectDetail.milestones.length} · Submissions: {projectDetail.submissions.length}
                </p>
              </div>
              <ul className="max-h-64 space-y-2 overflow-y-auto">
                {projectDetail.submissions.map((s) => {
                  const ms = projectDetail.milestones.find((m) => m.id === s.milestone_id);
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        className={`w-full rounded-xl border px-3 py-2 text-left ${selectedSubmission === s.id ? "border-[#c9a227] bg-[#fff8e8]" : "border-[#eef2f7] bg-[#f8fbff]"}`}
                        onClick={() => {
                          setSelectedSubmission(s.id);
                          setMarks(s.marks != null ? String(s.marks) : "");
                          setFeedback(s.mentor_feedback || "");
                        }}
                      >
                        <p className="font-medium text-[#0f172a]">{s.student_name || s.student_id.slice(0, 8)}</p>
                        <p className="text-xs text-[#64748b]">
                          {ms?.title || "Milestone"} · v{s.submission_version} · {s.status}
                          {s.marks != null ? ` · ${s.marks}` : ""}
                        </p>
                        {s.text_response ? <p className="mt-1 line-clamp-3 text-[#334155]">{s.text_response}</p> : null}
                        {s.github_url ? (
                          <a className="mr-2 text-xs text-[#c9a227] underline" href={s.github_url} target="_blank" rel="noreferrer">
                            GitHub
                          </a>
                        ) : null}
                        {s.demo_url ? (
                          <a className="text-xs text-[#c9a227] underline" href={s.demo_url} target="_blank" rel="noreferrer">
                            Demo
                          </a>
                        ) : null}
                        {(s.files || []).map((f) =>
                          f.path ? (
                            <button
                              key={f.path}
                              type="button"
                              className="mt-1 block text-xs text-[#c9a227] underline"
                              onClick={(e) => {
                                e.stopPropagation();
                                void openSignedDownload({
                                  kind: "project_submission",
                                  bucket: f.bucket || "project-submissions",
                                  path: f.path!,
                                  fileName: f.name,
                                  submission_id: s.id,
                                }).catch((err) => setError(err instanceof Error ? err.message : "Download failed."));
                              }}
                            >
                              Download {f.name || "file"}
                            </button>
                          ) : null,
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>

              {selectedSubmission ? (
                <div className="space-y-2 rounded-xl border border-[#eef2f7] p-3">
                  <label>
                    Marks
                    <input
                      className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                      value={marks}
                      onChange={(e) => setMarks(e.target.value)}
                    />
                  </label>
                  <label>
                    Feedback
                    <textarea
                      className="mt-1 min-h-[72px] w-full rounded-lg border border-[#dbe6f3] px-3 py-2"
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    Outcome
                    <select
                      className="mt-1 h-10 w-full rounded-lg border border-[#dbe6f3] px-3"
                      value={evalStatus}
                      onChange={(e) => setEvalStatus(e.target.value)}
                    >
                      <option value="evaluated">Evaluated</option>
                      <option value="approved">Approved</option>
                      <option value="revision_required">Revision required</option>
                    </select>
                  </label>
                  <Button className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" onClick={() => void evaluateProject()}>
                    Save evaluation
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
