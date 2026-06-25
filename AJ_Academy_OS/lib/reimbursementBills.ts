import type { SupabaseClient } from "@supabase/supabase-js";

export type ReimbursementBill = {
  name: string;
  url: string;
  mime: string;
  size: number;
};

export function parseBillUrls(raw: unknown): ReimbursementBill[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const o = item as Record<string, unknown>;
      if (typeof o.url !== "string" || !o.url) return null;
      return {
        name: typeof o.name === "string" ? o.name : "Bill",
        url: o.url,
        mime: typeof o.mime === "string" ? o.mime : "application/octet-stream",
        size: typeof o.size === "number" ? o.size : 0,
      };
    })
    .filter((x): x is ReimbursementBill => x !== null);
}

export async function uploadReimbursementBills(
  supabase: SupabaseClient,
  userId: string,
  claimId: string,
  files: File[],
  maxMb: number,
): Promise<ReimbursementBill[]> {
  const maxBytes = maxMb * 1024 * 1024;
  const uploaded: ReimbursementBill[] = [];
  for (const file of files) {
    if (file.size > maxBytes) {
      throw new Error(`"${file.name}" exceeds ${maxMb} MB limit.`);
    }
    const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_");
    const path = `${userId}/${claimId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage.from("reimbursement-bills").upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) throw error;
    const { data } = supabase.storage.from("reimbursement-bills").getPublicUrl(path);
    uploaded.push({
      name: file.name,
      url: data.publicUrl,
      mime: file.type || "application/octet-stream",
      size: file.size,
    });
  }
  return uploaded;
}
