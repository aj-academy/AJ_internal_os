"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/button";
import { CrmFlash } from "@/components/ui/CrmFlash";
import { MENTOR_ROLES, type MentorRole } from "@/lib/students/mentorAssignments";

type MentorRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  workload?: {
    total: number;
    primary: number;
    secondary: number;
    pct: number;
    status: string;
    caps: { max_total_students: number };
  };
};

type StudentOpt = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  registration_number?: string | null;
};

type BulkPreviewBucket = {
  mentorId: string;
  studentCount: number;
  students: string[];
  capacityWarning?: boolean;
  workload?: { total: number; caps: { max_total_students: number }; status: string };
};

type AllocImportPreview = {
  dryRun?: boolean;
  summary?: { total?: number; valid?: number; error?: number; created?: number; failed?: number };
  errors?: { rowNumber: number; issues: string[] }[];
  created?: unknown[];
};

type Mode = "one" | "bulk" | "import" | "transfer";

const ROLE_LABELS: Record<MentorRole, string> = {
  primary_academic: "Primary academic mentor",
  secondary: "Secondary mentor",
  academic: "Academic mentor",
  project: "Project mentor",
  placement: "Placement mentor",
  technical: "Technical mentor",
  support: "Support mentor",
  backup: "Backup mentor",
};

const STRATEGY_HELP: Record<string, string> = {
  equal: "Split students as evenly as possible across the mentors you selected.",
  round_robin: "Give student 1 to mentor A, student 2 to mentor B, then back to A, and so on.",
  capacity: "Same even split for now; prefer mentors with more free capacity when choosing who to include.",
};

function statusTone(status?: string) {
  switch (status) {
    case "available":
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    case "near_capacity":
      return "bg-amber-50 text-amber-900 border-amber-200";
    case "at_capacity":
    case "over_capacity":
      return "bg-rose-50 text-rose-900 border-rose-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function statusLabel(status?: string) {
  switch (status) {
    case "available":
      return "Available";
    case "near_capacity":
      return "Near capacity";
    case "at_capacity":
      return "At capacity";
    case "over_capacity":
      return "Over capacity";
    default:
      return status || "Unknown";
  }
}

export function MentorStudentAllocationWorkbench() {
  const [mode, setMode] = useState<Mode>("bulk");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mentors, setMentors] = useState<MentorRow[]>([]);
  const [withoutMentor, setWithoutMentor] = useState<StudentOpt[]>([]);
  const [allStudents, setAllStudents] = useState<StudentOpt[]>([]);
  const [assignmentCount, setAssignmentCount] = useState(0);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedMentors, setSelectedMentors] = useState<string[]>([]);
  const [mentorRole, setMentorRole] = useState<MentorRole>("primary_academic");
  const [strategy, setStrategy] = useState("equal");
  const [preview, setPreview] = useState<BulkPreviewBucket[] | null>(null);
  const [capacityOverride, setCapacityOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [singleStudent, setSingleStudent] = useState("");
  const [singleMentor, setSingleMentor] = useState("");
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferStudent, setTransferStudent] = useState("");
  const [busy, setBusy] = useState(false);
  const [allocImportPreview, setAllocImportPreview] = useState<AllocImportPreview | null>(null);
  const [allocFile, setAllocFile] = useState<File | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [mentorSearch, setMentorSearch] = useState("");

  const mentorName = useCallback(
    (id: string) => {
      const m = mentors.find((x) => x.id === id);
      return m?.full_name || m?.email || id.slice(0, 8);
    },
    [mentors],
  );

  const studentName = useCallback(
    (id: string) => {
      const s = withoutMentor.find((x) => x.id === id) || allStudents.find((x) => x.id === id);
      return s?.full_name || s?.email || id.slice(0, 8);
    },
    [withoutMentor, allStudents],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, a] = await Promise.all([
        fetch("/api/admin/students/mentor-assignments?workload=1", { credentials: "include" }),
        fetch("/api/admin/students/mentor-assignments?withoutMentor=1", { credentials: "include" }),
      ]);
      const wj = await w.json();
      const aj = await a.json();
      if (!w.ok) throw new Error(wj.error || "Could not load mentor workload.");
      if (!a.ok) throw new Error(aj.error || "Could not load students.");
      setMentors(wj.mentors ?? []);
      setAssignmentCount((aj.assignments ?? []).length);
      setWithoutMentor(aj.studentsWithoutMentor ?? []);
      // Keep a pool for transfer dropdown names
      setAllStudents(aj.studentsWithoutMentor ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Clear preview when selection/strategy changes
  useEffect(() => {
    setPreview(null);
  }, [selectedStudents, selectedMentors, strategy, mentorRole]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return withoutMentor;
    return withoutMentor.filter(
      (s) =>
        (s.full_name || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.registration_number || "").toLowerCase().includes(q) ||
        (s.department || "").toLowerCase().includes(q),
    );
  }, [withoutMentor, studentSearch]);

  const filteredMentors = useMemo(() => {
    const q = mentorSearch.trim().toLowerCase();
    if (!q) return mentors;
    return mentors.filter(
      (m) =>
        (m.full_name || "").toLowerCase().includes(q) ||
        (m.email || "").toLowerCase().includes(q) ||
        (m.department || "").toLowerCase().includes(q),
    );
  }, [mentors, mentorSearch]);

  const effectiveStudentCount = selectedStudents.length || withoutMentor.length;
  const canPreview = selectedMentors.length > 0 && effectiveStudentCount > 0 && !busy;
  const canConfirmBulk = !!preview && preview.length > 0 && !busy;

  const assignOne = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/students/mentor-assignments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          student_id: singleStudent,
          mentor_id: singleMentor,
          mentor_role: mentorRole,
          is_primary: mentorRole === "primary_academic",
          capacity_override: capacityOverride,
          capacity_override_reason: overrideReason || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Assign failed");
      setSuccess(`Assigned ${ROLE_LABELS[mentorRole]} successfully.`);
      setSingleStudent("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  };

  const bulk = async (dryRun: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/students/mentor-assignments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk",
          student_ids: selectedStudents.length ? selectedStudents : withoutMentor.map((s) => s.id),
          mentor_ids: selectedMentors,
          strategy,
          mentor_role: mentorRole,
          is_primary: mentorRole === "primary_academic",
          dry_run: dryRun,
          capacity_override: capacityOverride,
          capacity_override_reason: overrideReason || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Bulk failed");
      if (dryRun) {
        setPreview((json.preview ?? []) as BulkPreviewBucket[]);
        setSuccess("Preview ready. Review the plan below, then click Confirm allocation.");
      } else {
        setPreview(null);
        setSelectedStudents([]);
        setSelectedMentors([]);
        setSuccess(
          `Done. Allocated ${json.created} student(s)${json.errors?.length ? `, ${json.errors.length} failed` : ""}.`,
        );
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk failed");
    } finally {
      setBusy(false);
    }
  };

  const transfer = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/students/mentor-assignments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "transfer",
          student_id: transferStudent,
          from_mentor_id: transferFrom,
          to_mentor_id: transferTo,
          retain_readonly: true,
          reason: "Admin transfer",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Transfer failed");
      setSuccess("Student transferred. Old assignment kept in history (read-only for previous mentor).");
      setTransferStudent("");
      setTransferFrom("");
      setTransferTo("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadAllocTemplate = async (format: "xlsx" | "csv") => {
    const res = await fetch(`/api/admin/students/mentor-allocations/template?format=${format}`, {
      credentials: "include",
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Template download failed");
      return;
    }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `mentor_allocation_template.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
    setSuccess(`${format.toUpperCase()} template downloaded.`);
  };

  const runAllocImport = async (dryRun: boolean) => {
    if (!allocFile) {
      setError("Choose a filled Excel or CSV file first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", allocFile);
      body.append("dry_run", dryRun ? "1" : "0");
      body.append("capacity_override", capacityOverride ? "1" : "0");
      if (overrideReason) body.append("capacity_override_reason", overrideReason);
      const res = await fetch("/api/admin/students/mentor-allocations/import", {
        method: "POST",
        credentials: "include",
        body,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      setAllocImportPreview(json as AllocImportPreview);
      setSuccess(
        dryRun
          ? "File checked. Review the summary, then confirm import."
          : `Imported ${json.summary?.created ?? 0} allocation(s).`,
      );
      if (!dryRun) {
        setAllocFile(null);
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleStudent = (id: string) => {
    setSelectedStudents((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleMentor = (id: string) => {
    setSelectedMentors((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllStudents = () => setSelectedStudents(filteredStudents.map((s) => s.id));
  const clearStudents = () => setSelectedStudents([]);
  const selectAllMentors = () => setSelectedMentors(filteredMentors.map((m) => m.id));
  const clearMentors = () => setSelectedMentors([]);

  const modes: { id: Mode; title: string; blurb: string }[] = [
    { id: "bulk", title: "1. Bulk assign", blurb: "Many students → mentors" },
    { id: "one", title: "2. Assign one", blurb: "Single student" },
    { id: "import", title: "3. Import file", blurb: "Excel / CSV" },
    { id: "transfer", title: "4. Transfer", blurb: "Move between mentors" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Student Management"
        title="Assign Mentors to Students"
        description="Link portal students to mentors (primary, secondary, project, etc.). Teaching department scope is separate under Academic → Mentor Allocation."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => { window.location.href = "/admin/students/mentor-capacity"; }}>
              Capacity settings
            </Button>
            <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? "Refreshing…" : "Refresh data"}
            </Button>
          </div>
        }
      />

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      {/* Snapshot */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Students needing a primary mentor</p>
          <p className="text-2xl font-semibold tabular-nums">{loading ? "…" : withoutMentor.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Mentors</p>
          <p className="text-2xl font-semibold tabular-nums">{loading ? "…" : mentors.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Assignment records (recent load)</p>
          <p className="text-2xl font-semibold tabular-nums">{loading ? "…" : assignmentCount}</p>
        </div>
      </div>

      {/* Workload */}
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div>
          <h2 className="text-base font-semibold">Mentor workload at a glance</h2>
          <p className="text-sm text-muted-foreground">
            Check who has room before assigning. Edit limits under Capacity settings.
          </p>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading mentors…</p>
        ) : mentors.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No mentors found. Create users with role <strong>mentor</strong> in User Master first.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm text-left">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-3 font-medium">Mentor</th>
                  <th className="py-2 pr-3 font-medium">Primary</th>
                  <th className="py-2 pr-3 font-medium">Secondary</th>
                  <th className="py-2 pr-3 font-medium">Load</th>
                  <th className="py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mentors.map((m) => (
                  <tr key={m.id} className="border-b border-border/60">
                    <td className="py-2.5 pr-3">
                      <div className="font-medium">{m.full_name || "Unnamed"}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums">{m.workload?.primary ?? 0}</td>
                    <td className="py-2.5 pr-3 tabular-nums">{m.workload?.secondary ?? 0}</td>
                    <td className="py-2.5 pr-3 tabular-nums">
                      {m.workload?.total ?? 0} / {m.workload?.caps.max_total_students ?? 50}
                      <span className="text-xs text-muted-foreground"> ({m.workload?.pct ?? 0}%)</span>
                    </td>
                    <td className="py-2.5">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${statusTone(m.workload?.status)}`}
                      >
                        {statusLabel(m.workload?.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Method picker */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              setMode(m.id);
              setError(null);
            }}
            className={`rounded-xl border px-4 py-3 text-left transition-colors ${
              mode === m.id
                ? "border-foreground/30 bg-foreground/[0.04] ring-1 ring-foreground/10"
                : "border-border bg-card hover:bg-muted/40"
            }`}
          >
            <div className="text-sm font-semibold">{m.title}</div>
            <div className="text-xs text-muted-foreground">{m.blurb}</div>
          </button>
        ))}
      </div>

      {/* Shared options when relevant */}
      {(mode === "one" || mode === "bulk" || mode === "import") && (
        <section className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-3">
          <h3 className="text-sm font-semibold">Assignment options</h3>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block text-sm space-y-1">
              <span className="font-medium">Mentor role for this action</span>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={mentorRole}
                onChange={(e) => setMentorRole(e.target.value as MentorRole)}
              >
                {MENTOR_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={capacityOverride}
                  onChange={(e) => setCapacityOverride(e.target.checked)}
                />
                <span>
                  <span className="font-medium">Allow over-capacity (override)</span>
                  <span className="block text-xs text-muted-foreground">
                    Only when a mentor is full. Requires a written reason (audited).
                  </span>
                </span>
              </label>
              {capacityOverride ? (
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  placeholder="Why are you overriding capacity?"
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                />
              ) : null}
            </div>
          </div>
        </section>
      )}

      {/* BULK */}
      {mode === "bulk" ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-5">
          <div>
            <h2 className="text-base font-semibold">Bulk assign mentors</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Follow the three steps. Nothing is saved until you confirm the preview.
            </p>
          </div>

          {/* Step 1 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background text-xs font-bold">
                1
              </span>
              <div>
                <h3 className="text-sm font-semibold">Choose students</h3>
                <p className="text-xs text-muted-foreground">
                  Showing students without a primary mentor. Leave none checked to include{" "}
                  <strong>all {withoutMentor.length}</strong> of them.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Search name, email, reg no…"
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
              />
              <Button type="button" size="sm" variant="outline" onClick={selectAllStudents}>
                Select all shown
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={clearStudents}>
                Clear
              </Button>
              <span className="text-xs text-muted-foreground">
                Selected: <strong>{selectedStudents.length || `all ${withoutMentor.length}`}</strong>
              </span>
            </div>
            <div className="max-h-56 overflow-auto rounded-lg border border-border p-2 space-y-1">
              {filteredStudents.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">
                  {withoutMentor.length === 0
                    ? "Every active student already has a primary mentor — nothing to bulk-assign here."
                    : "No students match your search."}
                </p>
              ) : (
                filteredStudents.slice(0, 300).map((s) => (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedStudents.includes(s.id)}
                      onChange={() => toggleStudent(s.id)}
                    />
                    <span>
                      <span className="font-medium">{s.full_name || s.email || "Student"}</span>
                      <span className="block text-xs text-muted-foreground">
                        {[s.registration_number, s.email, s.department].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Step 2 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background text-xs font-bold">
                2
              </span>
              <div>
                <h3 className="text-sm font-semibold">Choose mentors</h3>
                <p className="text-xs text-muted-foreground">
                  Pick one mentor for everyone, or several mentors to split the group.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                className="min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
                placeholder="Search mentors…"
                value={mentorSearch}
                onChange={(e) => setMentorSearch(e.target.value)}
              />
              <Button type="button" size="sm" variant="outline" onClick={selectAllMentors}>
                Select all shown
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={clearMentors}>
                Clear
              </Button>
              <span className="text-xs text-muted-foreground">
                Selected: <strong>{selectedMentors.length}</strong>
              </span>
            </div>
            <div className="max-h-56 overflow-auto rounded-lg border border-border p-2 space-y-1">
              {filteredMentors.length === 0 ? (
                <p className="p-3 text-sm text-muted-foreground">No mentors to show.</p>
              ) : (
                filteredMentors.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selectedMentors.includes(m.id)}
                      onChange={() => toggleMentor(m.id)}
                    />
                    <span className="flex-1">
                      <span className="font-medium">{m.full_name || m.email}</span>
                      <span className="block text-xs text-muted-foreground">
                        Load {m.workload?.total ?? 0}/{m.workload?.caps.max_total_students ?? 50}
                      </span>
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] ${statusTone(m.workload?.status)}`}>
                      {statusLabel(m.workload?.status)}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Step 3 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background text-xs font-bold">
                3
              </span>
              <div>
                <h3 className="text-sm font-semibold">How should we split them?</h3>
                <p className="text-xs text-muted-foreground">{STRATEGY_HELP[strategy]}</p>
              </div>
            </div>
            <select
              className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-sm"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value)}
            >
              <option value="equal">Equal — as even as possible</option>
              <option value="round_robin">Round robin — one by one</option>
              <option value="capacity">Capacity aware — prefer roomier mentors</option>
            </select>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
            Ready to preview:{" "}
            <strong>{effectiveStudentCount}</strong> student(s) → <strong>{selectedMentors.length}</strong>{" "}
            mentor(s) as <strong>{ROLE_LABELS[mentorRole]}</strong>
            {!selectedMentors.length ? (
              <span className="block text-xs text-amber-800 mt-1">Select at least one mentor to continue.</span>
            ) : null}
            {selectedMentors.length > 0 && effectiveStudentCount === 0 ? (
              <span className="block text-xs text-amber-800 mt-1">No students available to assign.</span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!canPreview} onClick={() => void bulk(true)}>
              {busy ? "Working…" : "Step A — Preview plan"}
            </Button>
            <Button type="button" variant="secondary" disabled={!canConfirmBulk} onClick={() => void bulk(false)}>
              {busy ? "Saving…" : "Step B — Confirm & save"}
            </Button>
          </div>

          {preview ? (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold">Preview plan (not saved yet)</h4>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[560px] text-sm text-left">
                  <thead className="text-xs text-muted-foreground bg-muted/40">
                    <tr className="border-b">
                      <th className="p-2 font-medium">Mentor</th>
                      <th className="p-2 font-medium">Students getting</th>
                      <th className="p-2 font-medium">After assign (approx)</th>
                      <th className="p-2 font-medium">Warning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((bucket) => (
                      <tr key={bucket.mentorId} className="border-b border-border/60 align-top">
                        <td className="p-2 font-medium">{mentorName(bucket.mentorId)}</td>
                        <td className="p-2">
                          <div className="font-medium tabular-nums">{bucket.studentCount}</div>
                          <ul className="mt-1 max-h-24 overflow-auto text-xs text-muted-foreground space-y-0.5">
                            {(bucket.students || []).slice(0, 12).map((sid) => (
                              <li key={sid}>{studentName(sid)}</li>
                            ))}
                            {(bucket.students || []).length > 12 ? (
                              <li>+{(bucket.students || []).length - 12} more…</li>
                            ) : null}
                          </ul>
                        </td>
                        <td className="p-2 text-xs tabular-nums">
                          {(bucket.workload?.total ?? 0) + bucket.studentCount} /{" "}
                          {bucket.workload?.caps.max_total_students ?? 50}
                        </td>
                        <td className="p-2">
                          {bucket.capacityWarning ? (
                            <span className="text-xs text-rose-700">May exceed capacity</span>
                          ) : (
                            <span className="text-xs text-emerald-700">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">
                If this looks right, click <strong>Confirm &amp; save</strong>. Mentors and students will get
                in-app notifications.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ONE */}
      {mode === "one" ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Assign one student</h2>
            <p className="text-sm text-muted-foreground">Best when you know exactly who should mentor whom.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-sm space-y-1 block">
              <span className="font-medium">Student (without primary mentor)</span>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={singleStudent}
                onChange={(e) => setSingleStudent(e.target.value)}
              >
                <option value="">Select student…</option>
                {withoutMentor.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || s.email}
                    {s.registration_number ? ` (${s.registration_number})` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1 block">
              <span className="font-medium">Mentor</span>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={singleMentor}
                onChange={(e) => setSingleMentor(e.target.value)}
              >
                <option value="">Select mentor…</option>
                {mentors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email} — {statusLabel(m.workload?.status)} (
                    {m.workload?.total ?? 0}/{m.workload?.caps.max_total_students ?? 50})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button
            type="button"
            disabled={busy || !singleStudent || !singleMentor}
            onClick={() => void assignOne()}
          >
            {busy ? "Saving…" : "Assign mentor now"}
          </Button>
        </section>
      ) : null}

      {/* IMPORT */}
      {mode === "import" ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Import from Excel or CSV</h2>
            <p className="text-sm text-muted-foreground">
              Use when you already have a list of student ↔ mentor pairs. Always dry-run first.
            </p>
          </div>
          <ol className="list-decimal pl-5 text-sm space-y-1 text-muted-foreground">
            <li>Download the template and fill student email/reg no, mentor email, role, dates.</li>
            <li>Upload the file and click Check file (dry run).</li>
            <li>If valid rows look good, confirm import.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void downloadAllocTemplate("xlsx")}>
              Download Excel template
            </Button>
            <Button type="button" variant="outline" onClick={() => void downloadAllocTemplate("csv")}>
              Download CSV template
            </Button>
          </div>
          <label className="block text-sm space-y-1">
            <span className="font-medium">Your filled file</span>
            <input
              type="file"
              accept=".xlsx,.csv"
              className="block w-full text-sm"
              onChange={(e) => {
                setAllocFile(e.target.files?.[0] ?? null);
                setAllocImportPreview(null);
              }}
            />
            {allocFile ? (
              <span className="text-xs text-muted-foreground">Selected: {allocFile.name}</span>
            ) : null}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || !allocFile} onClick={() => void runAllocImport(true)}>
              {busy ? "Checking…" : "Check file (dry run)"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !allocFile || !allocImportPreview?.dryRun}
              onClick={() => void runAllocImport(false)}
            >
              Confirm import
            </Button>
          </div>
          {allocImportPreview ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <p className="font-medium">
                {allocImportPreview.dryRun ? "Dry-run result" : "Import result"}
              </p>
              <p>
                Total {allocImportPreview.summary?.total ?? 0} · Valid{" "}
                {allocImportPreview.summary?.valid ?? "—"} · Errors{" "}
                {allocImportPreview.summary?.error ?? allocImportPreview.summary?.failed ?? 0}
                {allocImportPreview.summary?.created != null
                  ? ` · Created ${allocImportPreview.summary.created}`
                  : ""}
              </p>
              {(allocImportPreview.errors?.length ?? 0) > 0 ? (
                <ul className="text-xs text-rose-800 space-y-0.5 max-h-32 overflow-auto">
                  {allocImportPreview.errors!.slice(0, 20).map((e) => (
                    <li key={e.rowNumber}>
                      Row {e.rowNumber}: {e.issues.join("; ")}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-emerald-800">No row errors reported.</p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* TRANSFER */}
      {mode === "transfer" ? (
        <section className="rounded-xl border border-border bg-card p-4 sm:p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Transfer student to another mentor</h2>
            <p className="text-sm text-muted-foreground">
              Closes the old assignment (history kept) and opens a new one. Previous mentor can keep read-only
              access.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm space-y-1 block md:col-span-3">
              <span className="font-medium">Student</span>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={transferStudent}
                onChange={(e) => setTransferStudent(e.target.value)}
              >
                <option value="">Select student…</option>
                {[...withoutMentor, ...allStudents]
                  .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name || s.email}
                    </option>
                  ))}
              </select>
              <span className="text-xs text-muted-foreground">
                Tip: for students already allocated, open reports or paste their profile ID if they are not in
                this short list. Prefer selecting from the list when possible.
              </span>
            </label>
            <label className="text-sm space-y-1 block">
              <span className="font-medium">Current mentor</span>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={transferFrom}
                onChange={(e) => setTransferFrom(e.target.value)}
              >
                <option value="">From…</option>
                {mentors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm space-y-1 block">
              <span className="font-medium">New mentor</span>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={transferTo}
                onChange={(e) => setTransferTo(e.target.value)}
              >
                <option value="">To…</option>
                {mentors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name || m.email}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button
            type="button"
            disabled={busy || !transferStudent || !transferFrom || !transferTo || transferFrom === transferTo}
            onClick={() => void transfer()}
          >
            {busy ? "Transferring…" : "Transfer student"}
          </Button>
        </section>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Need teaching scope by department/course/batch? Use{" "}
        <a className="underline" href="/admin/academic/mentor-allocation">
          Academic → Mentor Allocation
        </a>
        . Reports:{" "}
        <a className="underline" href="/admin/students/reports">
          Import &amp; Allocation Reports
        </a>
        .
      </p>
    </div>
  );
}
