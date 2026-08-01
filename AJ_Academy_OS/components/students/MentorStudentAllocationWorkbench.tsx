"use client";

import { useCallback, useEffect, useState } from "react";
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

export function MentorStudentAllocationWorkbench() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [mentors, setMentors] = useState<MentorRow[]>([]);
  const [withoutMentor, setWithoutMentor] = useState<StudentOpt[]>([]);
  const [assignments, setAssignments] = useState<unknown[]>([]);
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [selectedMentors, setSelectedMentors] = useState<string[]>([]);
  const [mentorRole, setMentorRole] = useState<MentorRole>("primary_academic");
  const [strategy, setStrategy] = useState("equal");
  const [preview, setPreview] = useState<unknown[] | null>(null);
  const [capacityOverride, setCapacityOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [singleStudent, setSingleStudent] = useState("");
  const [singleMentor, setSingleMentor] = useState("");
  const [transferFrom, setTransferFrom] = useState("");
  const [transferTo, setTransferTo] = useState("");
  const [transferStudent, setTransferStudent] = useState("");
  const [busy, setBusy] = useState(false);

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
      if (!w.ok) throw new Error(wj.error || "Workload failed");
      if (!a.ok) throw new Error(aj.error || "Assignments failed");
      setMentors(wj.mentors ?? []);
      setAssignments(aj.assignments ?? []);
      setWithoutMentor(aj.studentsWithoutMentor ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
      setSuccess("Mentor assigned.");
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
        setPreview(json.preview ?? []);
        setSuccess("Bulk preview ready — confirm to apply.");
      } else {
        setPreview(null);
        setSuccess(`Bulk allocated ${json.created} students (${json.errors?.length || 0} errors).`);
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
      setSuccess("Transfer completed; history preserved.");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transfer failed");
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

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Student Management"
        title="Mentor Allocation"
        description="Assign primary/secondary and specialized mentors. Scope teaching allocations remain under Academic → Mentor Allocation."
        actions={
          <Button type="button" variant="outline" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </Button>
        }
      />

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Mentor workload</h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm text-left">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2">Mentor</th>
                  <th className="py-2">Primary</th>
                  <th className="py-2">Secondary</th>
                  <th className="py-2">Total</th>
                  <th className="py-2">Capacity %</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {mentors.map((m) => (
                  <tr key={m.id} className="border-b border-border/50">
                    <td className="py-2">{m.full_name || m.email}</td>
                    <td className="py-2">{m.workload?.primary ?? 0}</td>
                    <td className="py-2">{m.workload?.secondary ?? 0}</td>
                    <td className="py-2">
                      {m.workload?.total ?? 0}/{m.workload?.caps.max_total_students ?? 50}
                    </td>
                    <td className="py-2">{m.workload?.pct ?? 0}%</td>
                    <td className="py-2">{m.workload?.status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Manual assign</h2>
        <div className="grid gap-2 md:grid-cols-3">
          <select className="rounded-md border px-2 py-2 text-sm" value={singleStudent} onChange={(e) => setSingleStudent(e.target.value)}>
            <option value="">Student…</option>
            {withoutMentor.map((s) => (
              <option key={s.id} value={s.id}>
                {s.full_name || s.email} {s.registration_number ? `(${s.registration_number})` : ""}
              </option>
            ))}
          </select>
          <select className="rounded-md border px-2 py-2 text-sm" value={singleMentor} onChange={(e) => setSingleMentor(e.target.value)}>
            <option value="">Mentor…</option>
            {mentors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border px-2 py-2 text-sm"
            value={mentorRole}
            onChange={(e) => setMentorRole(e.target.value as MentorRole)}
          >
            {MENTOR_ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={capacityOverride} onChange={(e) => setCapacityOverride(e.target.checked)} />
          Capacity override
        </label>
        {capacityOverride ? (
          <input
            className="w-full rounded-md border px-2 py-2 text-sm"
            placeholder="Override reason (required)"
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
          />
        ) : null}
        <Button type="button" disabled={busy || !singleStudent || !singleMentor} onClick={() => void assignOne()}>
          Assign mentor
        </Button>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Bulk allocation</h2>
        <p className="text-xs text-muted-foreground">
          Select students (default: all without primary mentor) and mentors, preview, then confirm.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="max-h-48 overflow-auto rounded border p-2 text-sm space-y-1">
            <p className="font-medium">Students without primary mentor ({withoutMentor.length})</p>
            {withoutMentor.slice(0, 200).map((s) => (
              <label key={s.id} className="flex items-center gap-2">
                <input type="checkbox" checked={selectedStudents.includes(s.id)} onChange={() => toggleStudent(s.id)} />
                {s.full_name || s.email}
              </label>
            ))}
          </div>
          <div className="max-h-48 overflow-auto rounded border p-2 text-sm space-y-1">
            <p className="font-medium">Mentors</p>
            {mentors.map((m) => (
              <label key={m.id} className="flex items-center gap-2">
                <input type="checkbox" checked={selectedMentors.includes(m.id)} onChange={() => toggleMentor(m.id)} />
                {m.full_name || m.email} ({m.workload?.status})
              </label>
            ))}
          </div>
        </div>
        <select className="rounded-md border px-2 py-2 text-sm" value={strategy} onChange={(e) => setStrategy(e.target.value)}>
          <option value="equal">Equal distribution</option>
          <option value="round_robin">Round robin</option>
          <option value="capacity">Capacity based</option>
        </select>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={busy || !selectedMentors.length} onClick={() => void bulk(true)}>
            Preview distribution
          </Button>
          <Button type="button" disabled={busy || !preview} onClick={() => void bulk(false)}>
            Confirm bulk allocate
          </Button>
        </div>
        {preview ? (
          <pre className="max-h-48 overflow-auto rounded bg-muted/40 p-3 text-xs">{JSON.stringify(preview, null, 2)}</pre>
        ) : null}
      </section>

      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Transfer mentor</h2>
        <div className="grid gap-2 md:grid-cols-3">
          <input
            className="rounded-md border px-2 py-2 text-sm"
            placeholder="Student profile UUID"
            value={transferStudent}
            onChange={(e) => setTransferStudent(e.target.value)}
          />
          <select className="rounded-md border px-2 py-2 text-sm" value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)}>
            <option value="">From mentor…</option>
            {mentors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
          <select className="rounded-md border px-2 py-2 text-sm" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
            <option value="">To mentor…</option>
            {mentors.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name || m.email}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          disabled={busy || !transferStudent || !transferFrom || !transferTo}
          onClick={() => void transfer()}
        >
          Transfer
        </Button>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
        <p>
          Active assignments in history: <strong>{assignments.length}</strong>. Temporary allocations set an end date and
          auto-expire via <code className="text-xs">expire_student_mentor_assignments()</code>.
        </p>
        <p className="mt-1">
          Teaching scope (dept/course/batch) remains at{" "}
          <a className="underline" href="/admin/academic/mentor-allocation">
            Academic → Mentor Allocation
          </a>
          .
        </p>
      </section>
    </div>
  );
}
