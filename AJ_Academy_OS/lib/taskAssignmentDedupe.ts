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

  if (assignmentType === "project") {
    const existing = await fetchOpenTasksForAssignee(supabase, assigneeId, assignmentType, excludeTaskId);
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

  // Always create a new task row for lead/college assignments so same-day
  // work for the same employee stays separate in Task Assignment.
  if (assignmentType === "lead") {
    return {
      action: "insert",
      clientIds: [...new Set(input.clientIds.map((id) => id.trim()).filter(Boolean))],
      collegeVisitIds: [],
      projectId: null,
    };
  }

  return {
    action: "insert",
    clientIds: [],
    collegeVisitIds: [...new Set(input.collegeVisitIds.map((id) => id.trim()).filter(Boolean))],
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
