/**
 * MCQ question bulk import: Excel/CSV template + parsers for CSV, XLSX rows,
 * PDF text, and Google Forms (public viewform + Forms-style CSV).
 */

import * as XLSX from "xlsx";
import { buildCsv, parseCsv } from "@/lib/csv";

export const TEST_QUESTION_TEMPLATE_VERSION = "1.0.0";
export const TEST_QUESTION_MAX_ROWS = 200;
export const TEST_QUESTION_MAX_BYTES = 8 * 1024 * 1024;

export const TEST_QUESTION_COLUMNS = [
  "Question",
  "Option A",
  "Option B",
  "Option C",
  "Option D",
  "Correct",
  "Marks",
] as const;

export type TestQuestionDraft = {
  question: string;
  options: string;
  correct_index: string;
  marks: string;
};

export type TestQuestionImportIssue = {
  rowNumber: number;
  severity: "error" | "warning";
  message: string;
};

export type TestQuestionImportResult = {
  questions: TestQuestionDraft[];
  issues: TestQuestionImportIssue[];
  source: "xlsx" | "csv" | "pdf" | "gforms" | "text";
  needsCorrectReview: boolean;
};

function normHeader(h: string): string {
  return h
    .replace(/^\*\s*/, "")
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

function headerKey(h: string): string | null {
  const n = normHeader(h);
  if (n === "question" || n === "question text" || n === "q") return "question";
  if (n === "option a" || n === "optiona" || n === "a" || n === "option 1" || n === "option1") return "a";
  if (n === "option b" || n === "optionb" || n === "b" || n === "option 2" || n === "option2") return "b";
  if (n === "option c" || n === "optionc" || n === "c" || n === "option 3" || n === "option3") return "c";
  if (n === "option d" || n === "optiond" || n === "d" || n === "option 4" || n === "option4") return "d";
  if (n === "option e" || n === "optione" || n === "e" || n === "option 5" || n === "option5") return "e";
  if (n === "option f" || n === "optionf" || n === "f" || n === "option 6" || n === "option6") return "f";
  if (
    n === "correct" ||
    n === "correct answer" ||
    n === "answer" ||
    n === "correct option" ||
    n === "correct index"
  ) {
    return "correct";
  }
  if (n === "marks" || n === "mark" || n === "points" || n === "score") return "marks";
  return null;
}

/** Parse Correct cell: A–F, 1–6 (1-based), or 0-based index string. */
export function parseCorrectIndex(raw: string, optionCount: number): number | null {
  const t = raw.trim();
  if (!t) return null;
  const letter = t.toUpperCase().match(/^([A-F])(?:\b|[).:\s]|$)/)?.[1];
  if (letter) {
    const idx = letter.charCodeAt(0) - 65;
    return idx >= 0 && idx < optionCount ? idx : null;
  }
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (n >= 1 && n <= optionCount) return n - 1;
    if (n >= 0 && n < optionCount) return n;
  }
  // Match by option label text
  return null;
}

function draftFromParts(
  question: string,
  options: string[],
  correctRaw: string,
  marksRaw: string,
  rowNumber: number,
  issues: TestQuestionImportIssue[],
): TestQuestionDraft | null {
  const q = question.trim();
  const opts = options.map((o) => o.trim()).filter(Boolean);
  if (!q) {
    issues.push({ rowNumber, severity: "error", message: "Empty question skipped." });
    return null;
  }
  if (opts.length < 2) {
    issues.push({
      rowNumber,
      severity: "error",
      message: `Question needs at least 2 options (got ${opts.length}).`,
    });
    return null;
  }

  let correct = parseCorrectIndex(correctRaw, opts.length);
  if (correct == null && correctRaw.trim()) {
    const needle = correctRaw.trim().toLowerCase();
    const byLabel = opts.findIndex((o) => o.toLowerCase() === needle);
    correct = byLabel >= 0 ? byLabel : null;
  }
  if (correct == null) {
    correct = 0;
    issues.push({
      rowNumber,
      severity: "warning",
      message: correctRaw.trim()
        ? `Could not map Correct "${correctRaw}" — defaulted to option A (index 0). Review before publish.`
        : "No Correct value — defaulted to option A (index 0). Review before publish.",
    });
  }

  const marksNum = Number(marksRaw);
  const marks = Number.isFinite(marksNum) && marksNum > 0 ? String(marksNum) : "1";

  return {
    question: q,
    options: opts.join("\n"),
    correct_index: String(correct),
    marks,
  };
}

export function buildTestQuestionTemplateBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const headers = TEST_QUESTION_COLUMNS.map((c) =>
    ["Question", "Option A", "Option B", "Correct"].includes(c) ? `* ${c}` : c,
  );
  const examples = [
    [
      "What is 2 + 2?",
      "3",
      "4",
      "5",
      "22",
      "B",
      "1",
    ],
    [
      "Which language runs in the browser?",
      "Python",
      "Java",
      "JavaScript",
      "C++",
      "C",
      "1",
    ],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, ...examples]), "Questions");

  const instructions = [
    ["AJ Academy — Test Questions Import"],
    ["Template Version", TEST_QUESTION_TEMPLATE_VERSION],
    ["Generated At (UTC)", new Date().toISOString()],
    [],
    ["Required columns", "Question, Option A, Option B, Correct"],
    ["Optional columns", "Option C–F, Marks"],
    ["Correct values", "A–F (letter) or 1–6 (1-based) or exact option text"],
    ["Only questions and answers are imported — no student data."],
    ["Max questions", String(TEST_QUESTION_MAX_ROWS)],
    [],
    ["Also supported"],
    ["CSV", "Same columns as this sheet"],
    ["PDF", "Numbered MCQs with A/B/C/D options and Answer: X"],
    ["Google Forms", "Public form link (docs.google.com/forms/…/viewform) or Forms CSV export"],
    ["Note", "Google Forms public links include questions/options; set Correct manually if quiz answers are not public."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), "Instructions");

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
}

export function buildTestQuestionCsv(): string {
  const headers = TEST_QUESTION_COLUMNS.map((c) =>
    ["Question", "Option A", "Option B", "Correct"].includes(c) ? `* ${c}` : c,
  );
  return buildCsv(headers, [
    ["What is 2 + 2?", "3", "4", "5", "22", "B", "1"],
    ["Which language runs in the browser?", "Python", "Java", "JavaScript", "C++", "C", "1"],
  ]);
}

export function parseTabularQuestionRows(rows: string[][]): TestQuestionImportResult {
  const issues: TestQuestionImportIssue[] = [];
  if (!rows.length) {
    return { questions: [], issues: [{ rowNumber: 0, severity: "error", message: "File is empty." }], source: "csv", needsCorrectReview: false };
  }

  const headerRow = rows[0].map((h) => headerKey(h));
  const hasMapped = headerRow.some((h) => h === "question");
  const start = hasMapped ? 1 : 0;
  const map = hasMapped
    ? headerRow
    : (["question", "a", "b", "c", "d", "correct", "marks"] as (string | null)[]);

  const questions: TestQuestionDraft[] = [];
  for (let i = start; i < rows.length && questions.length < TEST_QUESTION_MAX_ROWS; i += 1) {
    const row = rows[i];
    if (!row?.some((c) => String(c || "").trim())) continue;
    const get = (key: string) => {
      const idx = map.indexOf(key);
      return idx >= 0 ? String(row[idx] ?? "") : "";
    };
    const opts = ["a", "b", "c", "d", "e", "f"].map((k) => get(k)).filter((o) => o.trim());
    // Fallback: columns after question are options until Correct/Marks-looking values if no headers
    let options = opts;
    if (!hasMapped && options.length < 2) {
      options = row.slice(1, -2).map(String).filter((o) => o.trim());
    }
    const draft = draftFromParts(get("question") || String(row[0] || ""), options, get("correct"), get("marks"), i + 1, issues);
    if (draft) questions.push(draft);
  }

  const needsCorrectReview = issues.some((x) => x.message.includes("defaulted") || x.message.includes("Review"));
  return { questions, issues, source: "csv", needsCorrectReview };
}

export function parseCsvQuestions(text: string): TestQuestionImportResult {
  const result = parseTabularQuestionRows(parseCsv(text));
  return { ...result, source: "csv" };
}

export function parseXlsxQuestions(buffer: ArrayBuffer | Buffer): TestQuestionImportResult {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => /question/i.test(n)) ||
    wb.SheetNames[0];
  if (!sheetName) {
    return {
      questions: [],
      issues: [{ rowNumber: 0, severity: "error", message: "Workbook has no sheets." }],
      source: "xlsx",
      needsCorrectReview: false,
    };
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "", raw: false }) as string[][];
  const result = parseTabularQuestionRows(rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? "")) : [])));
  return { ...result, source: "xlsx" };
}

/**
 * Detect MCQs from plain text / PDF extract.
 * Patterns: "1. Q?", "Q1.", options A)/A./(A), "Answer: B" / "Correct: 2"
 */
export function parseTextQuestions(text: string): TestQuestionImportResult {
  const issues: TestQuestionImportIssue[] = [];
  const normalized = text.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
  const blocks = normalized.split(/\n(?=\s*(?:\d+[.)]\s+|Q(?:uestion)?\s*\d+[.):]\s*))/i);
  const questions: TestQuestionDraft[] = [];

  const tryBlock = (block: string, rowNumber: number) => {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 3) return;

    let qLine = lines[0].replace(/^(?:\d+[.)]\s*|Q(?:uestion)?\s*\d+[.):]\s*)/i, "").trim();
    const optionLines: string[] = [];
    let correctRaw = "";
    let marksRaw = "1";

    for (let i = 1; i < lines.length; i += 1) {
      const line = lines[i];
      const ans = line.match(/^(?:answer|correct|ans)\s*[:.\-]?\s*(.+)$/i);
      if (ans) {
        correctRaw = ans[1].trim();
        continue;
      }
      const marks = line.match(/^(?:marks?|points?)\s*[:.\-]?\s*(\d+(?:\.\d+)?)/i);
      if (marks) {
        marksRaw = marks[1];
        continue;
      }
      const opt = line.match(/^(?:\(?([A-Fa-f])\)?[).:\-]\s+|([A-Fa-f])\s+)(.+)$/);
      if (opt) {
        optionLines.push((opt[3] || "").trim());
        continue;
      }
      // Continuation of question
      if (!optionLines.length && !correctRaw) {
        qLine = `${qLine} ${line}`.trim();
      }
    }

    const draft = draftFromParts(qLine, optionLines, correctRaw, marksRaw, rowNumber, issues);
    if (draft) questions.push(draft);
  };

  if (blocks.length <= 1) {
    // Alternate: split on blank lines
    const paras = normalized.split(/\n\s*\n/).filter((p) => p.trim());
    paras.forEach((p, i) => tryBlock(p, i + 1));
  } else {
    blocks.forEach((b, i) => tryBlock(b, i + 1));
  }

  if (!questions.length) {
    issues.push({
      rowNumber: 0,
      severity: "error",
      message: "Could not detect MCQ questions. Use numbered questions with A/B/C/D options (and Answer: X if available).",
    });
  }

  return {
    questions: questions.slice(0, TEST_QUESTION_MAX_ROWS),
    issues,
    source: "text",
    needsCorrectReview: issues.some((x) => /defaulted|Review/i.test(x.message)),
  };
}

/** Google Forms responses CSV: first row = question texts as headers (skip Timestamp/Email). Options unknown — not ideal. Prefer viewform. */
export function parseGoogleFormsCsv(text: string): TestQuestionImportResult {
  const rows = parseCsv(text);
  if (rows.length < 1) {
    return {
      questions: [],
      issues: [{ rowNumber: 0, severity: "error", message: "Empty Google Forms CSV." }],
      source: "gforms",
      needsCorrectReview: true,
    };
  }

  // If it looks like our template, use tabular parser
  const keys = rows[0].map(headerKey);
  if (keys.includes("question") && (keys.includes("a") || keys.includes("b"))) {
    const r = parseTabularQuestionRows(rows);
    return { ...r, source: "gforms" };
  }

  // Forms response export: columns are questions — we cannot recover options from responses alone.
  return {
    questions: [],
    issues: [
      {
        rowNumber: 0,
        severity: "error",
        message:
          "This looks like a Google Forms responses export (not questions). Paste the public form link (…/viewform) or use the Excel/CSV questions template.",
      },
    ],
    source: "gforms",
    needsCorrectReview: true,
  };
}

/**
 * Parse Google Forms FB_PUBLIC_LOAD_DATA_ payload (from public viewform HTML).
 * Structure is undocumented; we walk arrays looking for [questionText, …, [[options…]], type].
 */
export function parseGoogleFormsLoadData(rawJson: unknown): TestQuestionImportResult {
  const issues: TestQuestionImportIssue[] = [];
  const questions: TestQuestionDraft[] = [];

  const root = rawJson as unknown[];
  if (!Array.isArray(root)) {
    return {
      questions: [],
      issues: [{ rowNumber: 0, severity: "error", message: "Invalid Google Forms data." }],
      source: "gforms",
      needsCorrectReview: true,
    };
  }

  // Typical: root[1][1] is list of question items
  const formBody = Array.isArray(root[1]) ? root[1] : null;
  const items = formBody && Array.isArray(formBody[1]) ? (formBody[1] as unknown[]) : [];

  const walkItems = (list: unknown[]) => {
    for (let i = 0; i < list.length; i += 1) {
      const item = list[i];
      if (!Array.isArray(item)) continue;
      const questionText = typeof item[1] === "string" ? item[1].trim() : "";
      if (!questionText) continue;

      // item[4] holds question widgets; type codes: 0 short, 1 paragraph, 2 MCQ, 3 dropdown, 4 checkboxes…
      const widgets = Array.isArray(item[4]) ? (item[4] as unknown[]) : [];
      let options: string[] = [];
      let qType: number | null = null;

      for (const w of widgets) {
        if (!Array.isArray(w)) continue;
        const type = typeof w[0] === "number" ? w[0] : null;
        qType = type;
        // Options live at w[1] for choice types
        const optBlock = Array.isArray(w[1]) ? (w[1] as unknown[]) : [];
        const labels: string[] = [];
        for (const opt of optBlock) {
          if (Array.isArray(opt) && typeof opt[0] === "string" && opt[0].trim()) {
            labels.push(opt[0].trim());
          }
        }
        if (labels.length >= 2) {
          options = labels;
          break;
        }
      }

      // Only import choice questions (MCQ / dropdown / checkbox → treat as single MCQ)
      if (options.length < 2) {
        if (qType === 2 || qType === 3 || qType === 4) {
          issues.push({
            rowNumber: i + 1,
            severity: "warning",
            message: `Skipped "${questionText.slice(0, 40)}…" — fewer than 2 options.`,
          });
        }
        continue;
      }

      const draft = draftFromParts(questionText, options, "", "1", i + 1, issues);
      if (draft) questions.push(draft);
    }
  };

  if (items.length) walkItems(items);
  else {
    // Fallback: deep search for arrays that look like option lists under string questions
    issues.push({
      rowNumber: 0,
      severity: "warning",
      message: "Non-standard Forms layout — attempting deep scan.",
    });
  }

  if (!questions.length) {
    issues.push({
      rowNumber: 0,
      severity: "error",
      message: "No multiple-choice questions found in this Google Form.",
    });
  }

  return {
    questions: questions.slice(0, TEST_QUESTION_MAX_ROWS),
    issues,
    source: "gforms",
    needsCorrectReview: true,
  };
}

export function extractFbPublicLoadData(html: string): unknown | null {
  const markers = ["FB_PUBLIC_LOAD_DATA_ = ", "FB_PUBLIC_LOAD_DATA_="];
  let start = -1;
  for (const m of markers) {
    start = html.indexOf(m);
    if (start >= 0) {
      start += m.length;
      break;
    }
  }
  if (start < 0) return null;

  // Value ends at </script> or trailing semicolon before script end
  let i = start;
  while (i < html.length && /\s/.test(html[i])) i += 1;
  if (html[i] !== "[") return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  const from = i;
  for (; i < html.length; i += 1) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === "[") depth += 1;
    else if (ch === "]") {
      depth -= 1;
      if (depth === 0) {
        const jsonText = html.slice(from, i + 1);
        try {
          return JSON.parse(jsonText) as unknown;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

export function normalizeGoogleFormUrl(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    if (!/google\.com$/i.test(u.hostname) && !/forms\.gle$/i.test(u.hostname)) {
      if (!u.hostname.includes("google") && !u.hostname.includes("forms.gle")) return null;
    }
    // Prefer viewform
    if (u.pathname.includes("/viewform")) return u.toString();
    if (u.pathname.includes("/formResponse")) {
      u.pathname = u.pathname.replace("/formResponse", "/viewform");
      return u.toString();
    }
    if (/\/forms\/d\/e\/[^/]+/i.test(u.pathname) && !u.pathname.includes("viewform")) {
      u.pathname = u.pathname.replace(/\/?$/, "/viewform");
      return u.toString();
    }
    if (/forms\.gle/i.test(u.hostname)) return u.toString();
    return u.toString();
  } catch {
    return null;
  }
}
