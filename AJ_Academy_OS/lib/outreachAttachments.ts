import type { SupabaseClient } from "@supabase/supabase-js";

export type OutreachAttachment = {
  name: string;
  url: string;
};

export const OUTREACH_ATTACHMENT_BUCKET = "task-attachments";
export const MAX_OUTREACH_ATTACHMENTS = 5;
export const MAX_OUTREACH_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * WhatsApp deep links carry text only, so files are uploaded to a public bucket
 * and shared as download links appended to the message.
 */
export async function uploadOutreachAttachments(
  supabase: SupabaseClient,
  userId: string,
  files: File[],
): Promise<OutreachAttachment[]> {
  const uploaded: OutreachAttachment[] = [];
  for (const file of files) {
    if (file.size > MAX_OUTREACH_ATTACHMENT_BYTES) {
      throw new Error(`"${file.name}" exceeds the 25 MB limit.`);
    }
    const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_");
    // Storage policy requires the first folder to be the uploader's user id.
    const path = `${userId}/outreach/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from(OUTREACH_ATTACHMENT_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) throw new Error(error.message);
    const { data } = supabase.storage.from(OUTREACH_ATTACHMENT_BUCKET).getPublicUrl(path);
    uploaded.push({ name: file.name, url: data.publicUrl });
  }
  return uploaded;
}

export function formatAttachmentLinks(attachments: OutreachAttachment[]): string {
  if (!attachments.length) return "";
  const heading = attachments.length === 1 ? "Attachment:" : "Attachments:";
  return [heading, ...attachments.map((a) => `${a.name}: ${a.url}`)].join("\n");
}

export function appendAttachmentLinks(message: string, attachments: OutreachAttachment[]): string {
  const block = formatAttachmentLinks(attachments);
  if (!block) return message.trim();
  const base = message.trim();
  return base ? `${base}\n\n${block}` : block;
}
