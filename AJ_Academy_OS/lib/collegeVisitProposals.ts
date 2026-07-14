import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "college-visit-proposals";
const MAX_MB = 10;

export async function uploadCollegeVisitProposalPdf(
  supabase: SupabaseClient,
  userId: string,
  collegeVisitId: string,
  file: File,
): Promise<{ url: string; name: string }> {
  if (!file.type.includes("pdf") && !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Please upload a PDF file.");
  }
  const maxBytes = MAX_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error(`PDF exceeds ${MAX_MB} MB limit.`);
  }
  const safeName = file.name.replace(/[^\w.\-()+ ]/g, "_");
  const path = `${userId}/${collegeVisitId}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: false,
    contentType: file.type || "application/pdf",
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, name: file.name };
}
