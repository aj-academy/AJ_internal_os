"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TaskLeadOutreachBlock } from "@/components/task/TaskLeadOutreachBlock";
import { displayLeadName, type CrmClientRow } from "@/components/student-lead-master/studentMasterHelpers";
import { mapClientRowToTaskLinkedLead } from "@/lib/taskLeadOutreach";
import { fetchTaskActivities, logTaskActivity, type TaskActivityRow } from "@/lib/taskActivities";
import { formatDisplayDate } from "@/lib/datetime";
import type { createClient } from "@/lib/supabase/client";
import type { TaskPriority, TaskRecord, TaskStatus } from "@/types/task";

type LeadEdit = {
  id: string;
  lead_name: string;
  phone: string;
  whatsapp: string;
  email: string;
  city: string;
  status: string;
  priority: string;
  lead_stage: string;
  follow_up_date: string;
  primary_objection: string;
};

function leadToEdit(row: CrmClientRow): LeadEdit {
  return {
    id: row.id,
    lead_name: displayLeadName(row) || "",
    phone: row.phone || "",
    whatsapp: row.whatsapp || "",
    email: row.email || "",
    city: row.city || "",
    status: String(row.status || ""),
    priority: String(row.priority || ""),
    lead_stage: String(row.lead_stage || ""),
    follow_up_date: row.follow_up_date ? String(row.follow_up_date).slice(0, 10) : "",
    primary_objection: row.primary_objection || "",
  };
}

export function TaskViewPanel({
  task,
  employeeNameMap,
  supabase,
  currentUserId,
  linkedLeadRows = [],
  canEdit = true,
  onClose,
  onSaved,
  onLeadOutreachUpdated,
  onError,
  onSuccess,
}: {
  task: TaskRecord;
  employeeNameMap: Record<string, string>;
  supabase: ReturnType<typeof createClient>;
  currentUserId: string;
  linkedLeadRows?: CrmClientRow[];
  canEdit?: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onLeadOutreachUpdated?: () => void;
  onError?: (msg: string) => void;
  onSuccess?: (msg: string) => void;
}) {
  const [activities, setActivities] = useState<TaskActivityRow[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [pinned, setPinned] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [status, setStatus] = useState<TaskStatus>(task.status);
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [progress, setProgress] = useState(task.progress);
  const [description, setDescription] = useState(task.description || "");
  const [activityNote, setActivityNote] = useState("");
  const [leads, setLeads] = useState<LeadEdit[]>(() => linkedLeadRows.map(leadToEdit));

  useEffect(() => {
    setStatus(task.status);
    setPriority(task.priority);
    setProgress(task.progress);
    setDescription(task.description || "");
    setLeads(linkedLeadRows.map(leadToEdit));
  }, [task, linkedLeadRows]);

  const refreshActivities = async () => {
    setActivitiesLoading(true);
    try {
      setActivities(await fetchTaskActivities(supabase, task.id));
    } catch {
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  };

  useEffect(() => {
    void refreshActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, task.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!currentUserId) return;
      const { data } = await supabase
        .from("employee_task_pins")
        .select("task_id")
        .eq("user_id", currentUserId)
        .eq("task_id", task.id)
        .maybeSingle();
      if (!cancelled) setPinned(Boolean(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, supabase, task.id]);

  const togglePin = async () => {
    if (!currentUserId || pinBusy) return;
    setPinBusy(true);
    try {
      if (pinned) {
        const { error } = await supabase
          .from("employee_task_pins")
          .delete()
          .eq("user_id", currentUserId)
          .eq("task_id", task.id);
        if (error) throw new Error(error.message);
        setPinned(false);
        onSuccess?.("Removed from your dashboard.");
      } else {
        const section =
          task.assignment_type === "lead" || task.assignment_type === "college" || task.assignment_type === "project"
            ? task.assignment_type
            : "all";
        const res = await fetch("/api/tasks/pins", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskIds: [task.id], section }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          // Prefer DB RPC when API/service role unavailable
          const { error: rpcError } = await supabase.rpc("upsert_my_task_pins", {
            p_task_ids: [task.id],
            p_pin_section: section,
          });
          if (rpcError) throw new Error(json.error || rpcError.message || "Could not pin task.");
        }
        setPinned(true);
        onSuccess?.(`Added to your dashboard (${section === "lead" ? "Student Lead" : section === "college" ? "College Visit" : section === "project" ? "Project" : "All"}).`);
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setPinBusy(false);
    }
  };

  const saveAll = async () => {
    if (!canEdit || !currentUserId || saving) return;
    setSaving(true);
    try {
      const changes: string[] = [];
      if (status !== task.status) changes.push(`Status: ${task.status} -> ${status}`);
      if (priority !== task.priority) changes.push(`Priority: ${task.priority} -> ${priority}`);
      if (progress !== task.progress) changes.push(`Progress: ${task.progress}% -> ${progress}%`);
      if ((description || "").trim() !== (task.description || "").trim()) changes.push("Description updated");

      const { error: taskErr } = await supabase
        .from("tasks")
        .update({
          status,
          priority,
          progress: Math.max(0, Math.min(100, Math.round(progress))),
          description: description.trim() || null,
        })
        .eq("id", task.id);
      if (taskErr) throw new Error(taskErr.message);

      for (const lead of leads) {
        const prior = linkedLeadRows.find((r) => r.id === lead.id);
        const leadChanges: string[] = [];
        if (prior) {
          if ((prior.lead_name || prior.name || "") !== lead.lead_name) leadChanges.push("name");
          if ((prior.phone || "") !== lead.phone) leadChanges.push("phone");
          if ((prior.whatsapp || "") !== lead.whatsapp) leadChanges.push("whatsapp");
          if ((prior.email || "") !== lead.email) leadChanges.push("email");
          if ((prior.city || "") !== lead.city) leadChanges.push("city");
          if (String(prior.status || "") !== lead.status) leadChanges.push("status");
          if (String(prior.priority || "") !== lead.priority) leadChanges.push("priority");
          if (String(prior.lead_stage || "") !== lead.lead_stage) leadChanges.push("lead_stage");
          if ((prior.follow_up_date || "").slice(0, 10) !== lead.follow_up_date) leadChanges.push("follow_up");
          if ((prior.primary_objection || "") !== lead.primary_objection) leadChanges.push("objection");
        } else {
          leadChanges.push("fields");
        }
        if (!leadChanges.length) continue;

        const { error: leadErr } = await supabase
          .from("clients")
          .update({
            lead_name: lead.lead_name.trim() || null,
            name: lead.lead_name.trim() || null,
            phone: lead.phone.trim() || null,
            whatsapp: lead.whatsapp.trim() || null,
            email: lead.email.trim() || null,
            city: lead.city.trim() || null,
            status: lead.status.trim() || null,
            priority: lead.priority.trim() || null,
            lead_stage: lead.lead_stage.trim() || null,
            follow_up_date: lead.follow_up_date || null,
            primary_objection: lead.primary_objection.trim() || null,
          })
          .eq("id", lead.id);
        if (leadErr) throw new Error(`Lead ${lead.lead_name || lead.id}: ${leadErr.message}`);

        changes.push(`Lead ${lead.lead_name || lead.id.slice(0, 8)}: ${leadChanges.join(", ")}`);
        const actIns = await supabase.from("lead_activities").insert({
          client_id: lead.id,
          activity_type: "Task view edit",
          notes: `Updated ${leadChanges.join(", ")} from My Tasks`,
          created_by: currentUserId,
        });
        if (actIns.error) {
          // Soft-fail lead activity table but keep task activity
          console.warn("lead_activities insert:", actIns.error.message);
        }
      }

      const note = activityNote.trim();
      const notesOut = [note, changes.length ? changes.join(" · ") : null].filter(Boolean).join("\n");
      const logged = await logTaskActivity(supabase, {
        taskId: task.id,
        actorId: currentUserId,
        activityType: note ? "manual_note" : "task_edit",
        notes: notesOut || "Saved from View / Activity.",
        metadata: {
          status,
          priority,
          progress,
          description_updated: (description || "").trim() !== (task.description || "").trim(),
          lead_updates: leads.map((l) => l.id),
          activity_note: note || null,
        },
      });
      if (logged.error) throw new Error(`Activity not saved: ${logged.error}`);

      setActivityNote("");
      await refreshActivities();
      onSuccess?.("Saved. Task, lead fields, and activity recorded.");
      onSaved?.();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const field = "mt-1 w-full rounded-lg border border-[#dbe6f3] bg-white px-3 py-2 text-sm text-[#0f172a]";
  const label = "text-xs font-semibold uppercase text-[#94a3b8]";

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-[60] bg-slate-900/40" onClick={onClose} />
      <div className="fixed inset-y-4 right-2 z-[61] mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-[24px] border border-[#e8dcc8] bg-white shadow-2xl sm:right-8">
        <div className="flex items-start justify-between border-b border-[#e8edf5] px-5 py-4">
          <div className="min-w-0 pr-3">
            <h3 className="truncate text-lg font-semibold text-[#0f172a]">{task.title}</h3>
            <p className="mt-1 text-xs text-[#64748b]">
              Assigned to {(task.assigned_to && employeeNameMap[task.assigned_to]) || task.assignee_name || "-"}
            </p>
            {task.assigner_display_name ? (
              <p className="mt-0.5 text-xs text-[#64748b]">Assigned by {task.assigner_display_name}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <button type="button" className="text-sm text-[#64748b]" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              disabled={pinBusy}
              onClick={() => void togglePin()}
              className="rounded-full border border-[#e8dcc8] px-3 py-1 text-xs font-semibold text-[#0f172a] hover:bg-[#f8fbff] disabled:opacity-50"
            >
              {pinned ? "Remove pin" : "Pin to dashboard"}
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm text-[#334155]">
          <div>
            <p className={label}>Description</p>
            {canEdit ? (
              <textarea
                className={`${field} min-h-[72px]`}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Task notes / description"
              />
            ) : (
              <p className="mt-1 whitespace-pre-wrap">{description.trim() ? description : "-"}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className={label}>Status</p>
              {canEdit ? (
                <select className={field} value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                  <option value="Pending">Pending</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Completed">Completed</option>
                </select>
              ) : (
                <p className="mt-1 font-medium">{status}</p>
              )}
            </div>
            <div>
              <p className={label}>Priority</p>
              {canEdit ? (
                <select className={field} value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
              ) : (
                <p className="mt-1 font-medium">{priority}</p>
              )}
            </div>
            <div>
              <p className={label}>Progress %</p>
              {canEdit ? (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  className={field}
                  value={progress}
                  onChange={(e) => setProgress(Number(e.target.value) || 0)}
                />
              ) : (
                <p className="mt-1 font-medium">{progress}%</p>
              )}
            </div>
            <div>
              <p className={label}>Due</p>
              <p className="mt-1 font-medium">{formatDisplayDate(task.due_date)}</p>
            </div>
          </div>

          {task.assignment_type === "lead" ? (
            <div className="space-y-3">
              <p className={label}>Linked student lead(s)</p>
              {leads.length ? (
                leads.map((lead, idx) => (
                  <div key={lead.id} className="rounded-xl border border-[#dbe6f3] bg-[#f8fbff] p-3 space-y-2">
                    <p className="text-xs font-semibold text-[#64748b]">Lead {idx + 1}</p>
                    {(
                      [
                        ["lead_name", "Student Name"],
                        ["phone", "Mobile"],
                        ["whatsapp", "WhatsApp"],
                        ["email", "Email"],
                        ["city", "City"],
                        ["status", "Lead Status"],
                        ["priority", "Priority"],
                        ["lead_stage", "Lead Stage"],
                        ["follow_up_date", "Next Follow-up"],
                        ["primary_objection", "Primary Objection"],
                      ] as const
                    ).map(([key, lab]) => (
                      <div key={key}>
                        <p className="text-[11px] font-medium text-[#94a3b8]">{lab}</p>
                        {canEdit ? (
                          <Input
                            type={key === "follow_up_date" ? "date" : "text"}
                            className={field}
                            value={lead[key]}
                            onChange={(e) =>
                              setLeads((prev) =>
                                prev.map((l) => (l.id === lead.id ? { ...l, [key]: e.target.value } : l)),
                              )
                            }
                          />
                        ) : (
                          <p className="mt-0.5 text-sm">{lead[key] || "-"}</p>
                        )}
                      </div>
                    ))}
                    {currentUserId ? (
                      <div className="pt-1">
                        <TaskLeadOutreachBlock
                          taskId={task.id}
                          leads={[mapClientRowToTaskLinkedLead({
                            id: lead.id,
                            lead_name: lead.lead_name,
                            phone: lead.phone,
                            whatsapp: lead.whatsapp,
                            email: lead.email,
                          })]}
                          supabase={supabase}
                          userId={currentUserId}
                          compact
                          onUpdated={() => {
                            onLeadOutreachUpdated?.();
                            void refreshActivities();
                          }}
                          onError={onError}
                          onSuccess={onSuccess}
                        />
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#64748b]">
                  Lead CRM rows not loaded yet. Open after leads hydrate, or re-run tasks_linked_lead_access.sql / linked-crm API.
                </p>
              )}
            </div>
          ) : null}

          {task.assignment_type === "college" && task.linked_college_labels?.length ? (
            <div>
              <p className={label}>Linked colleges</p>
              <ul className="mt-1 list-inside list-disc text-sm">
                {task.linked_college_labels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {task.assignment_type === "project" && task.project_label ? (
            <div>
              <p className={label}>Project</p>
              <p className="mt-1 font-medium">{task.project_label}</p>
            </div>
          ) : null}

          {canEdit ? (
            <div>
              <p className={label}>Activity note (saved with every update)</p>
              <textarea
                className={`${field} min-h-[64px]`}
                value={activityNote}
                onChange={(e) => setActivityNote(e.target.value)}
                placeholder="What did you do? Call outcome, follow-up plan, etc."
              />
              <Button
                type="button"
                className="mt-3 w-full rounded-full bg-[#1e3a8a] text-white hover:bg-[#1e40af]"
                disabled={saving}
                onClick={() => void saveAll()}
              >
                {saving ? "Saving..." : "Save changes & activity"}
              </Button>
            </div>
          ) : null}

          <div>
            <p className={label}>Activity history</p>
            {activitiesLoading ? (
              <p className="mt-2 text-xs text-[#64748b]">Loading activity...</p>
            ) : activities.length ? (
              <ul className="mt-2 space-y-2">
                {activities.map((a) => (
                  <li key={a.id} className="rounded-lg border border-[#e8edf5] bg-[#f8fbff] px-3 py-2 text-xs">
                    <p className="font-medium text-[#0f172a]">
                      {a.activity_type.replace(/_/g, " ")}
                      {a.actor_name ? ` · ${a.actor_name}` : ""}
                    </p>
                    {a.notes ? <p className="mt-1 whitespace-pre-wrap text-[#475569]">{a.notes}</p> : null}
                    <p className="mt-1 text-[#94a3b8]">{new Date(a.created_at).toLocaleString("en-IN")}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-[#64748b]">No activity logged yet.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
