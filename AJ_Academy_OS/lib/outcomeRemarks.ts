export type OutcomeRemarkEntry = {
  timestamp: string | null;
  text: string;
};

const IST_ENTRY_RE =
  /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) IST\]\s*([\s\S]*?)(?=\n\n\[\d{4}-\d{2}-\d{2} \d{2}:\d{2} IST\]|\s*$)/g;

function nowIstKey(d = new Date()): string {
  return d.toLocaleString("sv-SE", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatOutcomeRemarkEntry(text: string, now = new Date()): string {
  const clean = text.trim();
  if (!clean) return "";
  return `[${nowIstKey(now)} IST]\n${clean}`;
}

/** Append-only remarks log: keeps existing entries and adds new timestamped entry. */
export function appendOutcomeRemarkLog(existing: string | null | undefined, incoming: string | null | undefined): string {
  const next = String(incoming ?? "").trim();
  const prev = String(existing ?? "").trim();
  if (!next) return prev;
  const stamped = formatOutcomeRemarkEntry(next);
  if (!prev) return stamped;
  // Avoid duplicate append if exactly same stamped content already at the end.
  if (prev.endsWith(stamped)) return prev;
  return `${prev}\n\n${stamped}`;
}

/** Split older free-text blobs (often joined with | or newlines) into separate cards. */
function splitLegacyRemarkChunks(text: string): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  // Prefer clear separators used historically in CRM notes.
  const byPipe = cleaned
    .split(/\s*\|\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byPipe.length > 1) return byPipe;
  const byLines = cleaned
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (byLines.length > 1) return byLines;
  return [cleaned];
}

/**
 * Parse legacy/plain text and timestamped entries for card-style rendering.
 * Keeps EVERY previous remark — including unstamped text before the first IST marker.
 */
export function parseOutcomeRemarkEntries(raw: string | null | undefined): OutcomeRemarkEntry[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];

  const matches = [...text.matchAll(IST_ENTRY_RE)];
  if (!matches.length) {
    return splitLegacyRemarkChunks(text).map((chunk) => ({
      timestamp: null,
      text: chunk,
    }));
  }

  const out: OutcomeRemarkEntry[] = [];
  const firstIndex = matches[0]?.index ?? 0;
  const preamble = text.slice(0, firstIndex).trim();
  if (preamble) {
    for (const chunk of splitLegacyRemarkChunks(preamble)) {
      out.push({ timestamp: null, text: chunk });
    }
  }

  for (const m of matches) {
    const body = String(m[2] ?? "").trim();
    if (!body) continue;
    out.push({
      timestamp: m[1] ? `${m[1]} IST` : null,
      text: body,
    });
  }

  return out.length ? out : [{ timestamp: null, text }];
}

/** Latest remark text for compact table cells. */
export function latestOutcomeRemarkPreview(raw: string | null | undefined): string {
  const entries = parseOutcomeRemarkEntries(raw);
  if (!entries.length) return "";
  const last = entries[entries.length - 1];
  return last?.text ?? "";
}
