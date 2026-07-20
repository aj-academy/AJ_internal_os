import { parseClientIds } from "@/lib/taskActivities";
import type { TaskAssignmentType, TaskRecord } from "@/types/task";
import type { SupabaseClient } from "@supabase/supabase-js";

type ExistingTaskRow = {
  id: string;
  assignment_type: TaskAssignmentType | null;
  client_ids: unknown;
  college_visit_ids: unknown;
  project_id: string | null;
  status: string;
  updated_at: string;
};

export type ResolveTaskAssignmentInput = {
  assigneeId: string;
  assignmentType: TaskAssignmentType | null;
  clientIds: string[];
  collegeVisitIds: string[];
  projectId: string | null;
  excludeTaskId?: string | null;
};

export type ResolveTaskAssignmentResult =
  | {
      action: "insert";
      clientIds: string[];
      collegeVisitIds: string[];
      projectId: string | null;
    }
  | {
      action: "merge";
      taskId: string;
      clientIds?: string[];
      collegeVisitIds?: string[];
      addedCount: number;
      skippedCount: number;
    }
  | {
      action: "skip";
      taskId: string;
      reason: "all_linked" | "project_exists";
    };

function mergeUniqueIds(existing: string[], incoming: string[]): string[] {
  return [...new Set([...existing, ...incoming])];
}

function pickLatestOpenTask(tasks: ExistingTaskRow[]): ExistingTaskRow | null {
  if (!tasks.length) return null;
  return [...tasks].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
}

function collectLinkedIds(tasks: ExistingTaskRow[], field: "client_ids" | "college_visit_ids"): Set<string> {
  const linked = new Set<string>();
  for (const task of tasks) {
    const ids = field === "client_ids" ? parseClientIds(task.client_ids) : parseClientIds(task.college_visit_ids);
    for (const id of ids) linked.add(id);
  }
  return linked;
}

export async function fetchOpenTasksForAssignee(
  supabase: SupabaseClient,
  assigneeId: string,
  assignmentType: TaskAssignmentType,
  excludeTaskId?: string | null,
): Promise<ExistingTaskRow[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("id,assignment_type,client_ids,college_visit_ids,project_id,status,updated_at")
    .eq("assigned_to", assigneeId)
    .eq("assignment_type", assignmentType)
    .neq("status", "Completed");

  if (error) throw new Error(error.message);

  return ((data ?? []) as ExistingTaskRow[]).filter((task) => task.id !== excludeTaskId);
}

export async function resolveTaskAssignment(
  supabase: SupabaseClient,
  input: ResolveTaskAssignmentInput,
): Promise<ResolveTaskAssignmentResult> {
  const { assigneeId, assignmentType, excludeTaskId } = input;
  if (!assigneeId || !assignmentType) {
    return {
      action: "insert",
      clientIds: input.clientIds,
      collegeVisitIds: input.collegeVisitIds,
      projectId: input.projectId,
    };
  }

  const existing = await fetchOpenTasksForAssignee(supabase, assigneeId, assignmentType, excludeTaskId);

  if (assignmentType === "project") {
    const projectId = input.projectId?.trim() || null;
    if (!projectId) {
      return {
        action: "insert",
        clientIds: [],
        collegeVisitIds: [],
        projectId: null,
      };
    }
    const match = existing.find((task) => task.project_id === projectId);
    if (match) {
      return { action: "skip", taskId: match.id, reason: "project_exists" };
    }
    return {
      action: "insert",
      clientIds: [],
      collegeVisitIds: [],
      projectId,
    };
  }

  if (assignmentType === "lead") {
    const requested = [...new Set(input.clientIds.map((id) => id.trim()).filter(Boolean))];
    const alreadyLinked = collectLinkedIds(existing, "client_ids");
    const duplicateIds = requested.filter((id) => alreadyLinked.has(id));
    const newIds = requested.filter((id) => !alreadyLinked.has(id));

    if (!newIds.length && duplicateIds.length) {
      const host =
        existing.find((task) => parseClientIds(task.client_ids).some((id) => duplicateIds.includes(id))) ??
        pickLatestOpenTask(existing);
      return { action: "skip", taskId: host?.id ?? "", reason: "all_linked" };
    }

    const host = pickLatestOpenTask(existing);
    if (host && newIds.length) {
      const merged = mergeUniqueIds(parseClientIds(host.client_ids), newIds);
      return {
        action: "merge",
        taskId: host.id,
        clientIds: merged,
        addedCount: newIds.length,
        skippedCount: duplicateIds.length,
      };
    }

    return {
      action: "insert",
      clientIds: requested,
      collegeVisitIds: [],
      projectId: null,
    };
  }

  const requested = [...new Set(input.collegeVisitIds.map((id) => id.trim()).filter(Boolean))];
  const alreadyLinked = collectLinkedIds(existing, "college_visit_ids");
  const duplicateIds = requested.filter((id) => alreadyLinked.has(id));
  const newIds = requested.filter((id) => !alreadyLinked.has(id));

  if (!newIds.length && duplicateIds.length) {
    const host =
      existing.find((task) => parseClientIds(task.college_visit_ids).some((id) => duplicateIds.includes(id))) ??
      pickLatestOpenTask(existing);
    return { action: "skip", taskId: host?.id ?? "", reason: "all_linked" };
  }

  const host = pickLatestOpenTask(existing);
  if (host && newIds.length) {
    const merged = mergeUniqueIds(parseClientIds(host.college_visit_ids), newIds);
    return {
      action: "merge",
      taskId: host.id,
      collegeVisitIds: merged,
      addedCount: newIds.length,
      skippedCount: duplicateIds.length,
    };
  }

  return {
    action: "insert",
    clientIds: [],
    collegeVisitIds: requested,
    projectId: null,
  };
}

/** One row per linked entity in subsection tables — keep the newest task for each entity. */
export function dedupeTasksByProjectId(tasks: TaskRecord[]): TaskRecord[] {
  const byProject = new Map<string, TaskRecord>();
  const rest: TaskRecord[] = [];

  for (const task of tasks) {
    if (task.assignment_type !== "project" || !task.project_id?.trim()) {
      rest.push(task);
      continue;
    }
    const projectId = task.project_id.trim();
    const prev = byProject.get(projectId);
    if (!prev || task.updated_at.localeCompare(prev.updated_at) > 0) {
      byProject.set(projectId, task);
    }
  }

  return [...rest, ...byProject.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function countUniqueLinkedEntities(tasks: TaskRecord[], assignmentType: TaskAssignmentType): number {
  const ids = new Set<string>();
  for (const task of tasks) {
    if ((task.assignment_type ?? "") !== assignmentType) continue;
    const source =
      assignmentType === "lead"
        ? task.client_ids ?? []
        : assignmentType === "college"
          ? task.college_visit_ids ?? []
          : task.project_id
            ? [task.project_id]
            : [];
    for (const id of source) {
      const trimmed = String(id).trim();
      if (trimmed) ids.add(trimmed);
    }
  }
  return ids.size;
}
