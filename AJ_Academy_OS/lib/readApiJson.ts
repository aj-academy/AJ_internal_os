/** Parse API responses that may be HTML/plain text (413, 502) instead of JSON. */

export function messageFromHttpBody(status: number, body: string): string {
  const text = body.replace(/\s+/g, " ").trim();
  const lower = text.toLowerCase();
  if (
    status === 413 ||
    lower.includes("request entity too large") ||
    lower.includes("payload too large") ||
    lower.includes("content too large") ||
    lower.includes("functionalpayloadtoolarge")
  ) {
    return "This file is too large for the previous upload path. Try again — files now go straight to storage (PDF/DOC/DOCX, max 10 MB).";
  }
  if (status === 429 || lower.includes("too many requests")) {
    return "Too many uploads in a short time. Wait a few seconds and try again.";
  }
  if (status === 502 || status === 503 || status === 504) {
    return "The server was busy and could not finish this upload. Wait a moment and try again.";
  }
  if (!text) return `Upload failed (${status}). Please try again.`;
  if (text.startsWith("<") || lower.includes("<html") || lower.includes("<!doctype")) {
    return `Upload failed (${status}). Please try again.`;
  }
  return text.slice(0, 240);
}

export async function readApiJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(res.ok ? "Empty response from server." : messageFromHttpBody(res.status, ""));
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(messageFromHttpBody(res.status, trimmed));
  }
}
