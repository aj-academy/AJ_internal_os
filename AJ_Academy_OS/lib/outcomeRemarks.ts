export type OutcomeRemarkEntry = {
  timestamp: string | null;
  text: string;
};

const IST_ENTRY_RE = /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}) IST\]\s*([\s\S]*?)(?=\n\n\[\d{4}-\d{2}-\d{2} \d{2}:\d{2} IST\]|\s*$)/g;

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

/** Parse legacy/plain text and timestamped entries for card-style rendering. */
export function parseOutcomeRemarkEntries(raw: string | null | undefined): OutcomeRemarkEntry[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  const out: OutcomeRemarkEntry[] = [];
  const matches = [...text.matchAll(IST_ENTRY_RE)];
  if (!matches.length) {
    return [{ timestamp: null, text }];
  }
  for (const m of matches) {
    out.push({
      timestamp: m[1] ? `${m[1]} IST` : null,
      text: String(m[2] ?? "").trim(),
    });
  }
  return out;
}
