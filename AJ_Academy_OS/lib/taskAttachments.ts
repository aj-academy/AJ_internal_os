import type { SupabaseClient } from "@supabase/supabase-js";

export type TaskAttachment = {
  name: string;
  url: string;
  mime: string;
  size: number;
};

const MAX_FILE_BYTES = 25 * 1024 * 1024;

export async function uploadTaskAttachments(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
  files: File[],
): Promise<TaskAttachment[]> {
  const uploaded: TaskAttachment[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`"${file.name}" exceeds 25 MB limit.`);
    }
    const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_");
    const path = `${userId}/${taskId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("task-attachments").upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) throw error;
    const { data } = supabase.storage.from("task-attachments").getPublicUrl(path);
    uploaded.push({
      name: file.name,
      url: data.publicUrl,
      mime: file.type || "application/octet-stream",
      size: file.size,
    });
  }
  return uploaded;
}

export function parseTaskAttachments(raw: unknown): TaskAttachment[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const o = item as Record<string, unknown>;
      if (typeof o.url !== "string" || !o.url) return null;
      return {
        name: typeof o.name === "string" ? o.name : "Attachment",
        url: o.url,
        mime: typeof o.mime === "string" ? o.mime : "application/octet-stream",
        size: typeof o.size === "number" ? o.size : 0,
      };
    })
    .filter((x): x is TaskAttachment => x !== null);
}
