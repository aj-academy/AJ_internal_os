import type { SupabaseClient } from "@supabase/supabase-js";

export type TaskActivityRow = {
  id: string;
  task_id: string;
  actor_id: string | null;
  activity_type: string;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name?: string | null;
};

export async function logTaskActivity(
  supabase: SupabaseClient,
  input: {
    taskId: string;
    actorId: string;
    activityType: string;
    notes?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("task_activities").insert({
    task_id: input.taskId,
    actor_id: input.actorId,
    activity_type: input.activityType,
    notes: input.notes ?? null,
    metadata: input.metadata ?? {},
  });
  if (error) {
    console.warn("logTaskActivity:", error.message);
    return { error: error.message };
  }
  return { error: null };
}

export async function fetchTaskActivities(
  supabase: SupabaseClient,
  taskId: string,
): Promise<TaskActivityRow[]> {
  const { data, error } = await supabase
    .from("task_activities")
    .select("id,task_id,actor_id,activity_type,notes,metadata,created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (error.message.toLowerCase().includes("task_activities")) return [];
    throw error;
  }
  const rows = (data ?? []) as TaskActivityRow[];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  if (!actorIds.length) return rows;
  const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", actorIds);
  const nameMap = Object.fromEntries(
    (profs ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
      p.id,
      p.full_name || p.email || "User",
    ]),
  );
  return rows.map((r) => ({
    ...r,
    actor_name: r.actor_id ? nameMap[r.actor_id] ?? null : null,
  }));
}

export function parseClientIds(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .map((id) => String(id ?? "").trim())
      .filter((id) => id.length > 0);
  }
  if (typeof raw === "string" && raw.trim()) {
    try {
      return parseClientIds(JSON.parse(raw));
    } catch {
      return raw
        .split(/[,\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}
