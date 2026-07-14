/** Shared proposal file helpers (Student Master + College Visits). */

export const PROPOSALS_BUCKET = "proposals";
export const PROPOSAL_MAX_BYTES = 10 * 1024 * 1024;
export const PROPOSAL_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const PROPOSAL_ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export type ProposalEntityKind = "student" | "college";

export type ProposalFileMeta = {
  proposal_file_name: string | null;
  proposal_file_path: string | null;
  proposal_file_type: string | null;
  proposal_file_size: number | null;
  proposal_uploaded_at: string | null;
  /** Legacy URL fields — read-only display */
  proposal_link?: string | null;
  proposal_pdf_url?: string | null;
  proposal_pdf_name?: string | null;
};

export function sanitizeProposalFileName(name: string) {
  const base = name.trim().replace(/[^\w.\-()+ ]/g, "_").replace(/\s+/g, " ").slice(0, 180);
  return base || "proposal";
}

export function guessProposalMime(fileName: string, mime?: string | null) {
  const lower = fileName.toLowerCase();
  if (mime && PROPOSAL_ALLOWED_MIME.has(mime)) return mime;
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return mime?.trim() || "";
}

export function validateProposalFile(file: File): string | null {
  if (file.size <= 0) return "Empty file.";
  if (file.size > PROPOSAL_MAX_BYTES) return "File exceeds 10 MB limit.";
  const mime = guessProposalMime(file.name, file.type);
  const lower = file.name.toLowerCase();
  const extOk = lower.endsWith(".pdf") || lower.endsWith(".doc") || lower.endsWith(".docx");
  if (!extOk && !PROPOSAL_ALLOWED_MIME.has(mime)) {
    return "Only PDF, DOC, or DOCX files are allowed.";
  }
  return null;
}

export function proposalStorageFolder(kind: ProposalEntityKind, entityId: string) {
  return kind === "student" ? `students/${entityId}` : `colleges/${entityId}`;
}

export function buildProposalObjectPath(kind: ProposalEntityKind, entityId: string, originalName: string) {
  const safe = sanitizeProposalFileName(originalName);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
  return `${proposalStorageFolder(kind, entityId)}/${unique}`;
}

export function formatProposalBytes(size: number | null | undefined) {
  if (size == null || !Number.isFinite(size)) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function hasUploadedProposal(meta: ProposalFileMeta | null | undefined) {
  return Boolean(meta?.proposal_file_path?.trim());
}

export function hasLegacyProposalLink(meta: ProposalFileMeta | null | undefined) {
  if (hasUploadedProposal(meta)) return false;
  return Boolean(meta?.proposal_link?.trim() || meta?.proposal_pdf_url?.trim());
}
