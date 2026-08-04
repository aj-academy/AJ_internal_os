import { NextResponse } from "next/server";
import { verifySessionRole } from "@/lib/security/auth/verifySessionRole";
import type { UserRole } from "@/types/profile";
import {
  TEST_QUESTION_MAX_BYTES,
  extractFbPublicLoadData,
  normalizeGoogleFormUrl,
  parseCsvQuestions,
  parseGoogleFormsCsv,
  parseGoogleFormsLoadData,
  parseTextQuestions,
  parseXlsxQuestions,
  type TestQuestionImportResult,
} from "@/lib/lms/testQuestionImport";

export const runtime = "nodejs";

const STAFF = new Set<UserRole>(["mentor", "admin", "super_admin"]);

async function parsePdfBuffer(buf: Buffer): Promise<TestQuestionImportResult> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  const joined = Array.isArray(text) ? text.join("\n") : String(text || "");
  const result = parseTextQuestions(joined);
  return { ...result, source: "pdf" };
}

async function fetchGoogleForm(url: string): Promise<TestQuestionImportResult> {
  const normalized = normalizeGoogleFormUrl(url);
  if (!normalized) {
    return {
      questions: [],
      issues: [{ rowNumber: 0, severity: "error", message: "Enter a valid Google Forms URL." }],
      source: "gforms",
      needsCorrectReview: true,
    };
  }

  const res = await fetch(normalized, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; AJAcademyBot/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) {
    return {
      questions: [],
      issues: [
        {
          rowNumber: 0,
          severity: "error",
          message: `Could not fetch Google Form (HTTP ${res.status}). Use a public viewform link.`,
        },
      ],
      source: "gforms",
      needsCorrectReview: true,
    };
  }
  const html = await res.text();
  const data = extractFbPublicLoadData(html);
  if (!data) {
    return {
      questions: [],
      issues: [
        {
          rowNumber: 0,
          severity: "error",
          message:
            "Could not read questions from this form. Ensure it is a public Google Form (Anyone with the link) and ends with /viewform.",
        },
      ],
      source: "gforms",
      needsCorrectReview: true,
    };
  }
  return parseGoogleFormsLoadData(data);
}

export async function POST(request: Request) {
  const gate = await verifySessionRole(STAFF);
  if (gate.response) return gate.response;

  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as {
        gforms_url?: string;
        text?: string;
      };
      if (body.gforms_url?.trim()) {
        const result = await fetchGoogleForm(body.gforms_url.trim());
        return NextResponse.json(result);
      }
      if (body.text?.trim()) {
        return NextResponse.json(parseTextQuestions(body.text));
      }
      return NextResponse.json({ error: "Provide gforms_url or text." }, { status: 400 });
    }

    const form = await request.formData();
    const file = form.get("file");
    const gformsUrl = String(form.get("gforms_url") || "").trim();
    if (gformsUrl) {
      const result = await fetchGoogleForm(gformsUrl);
      return NextResponse.json(result);
    }

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Upload a file or provide a Google Forms URL." }, { status: 400 });
    }
    if (file.size > TEST_QUESTION_MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 8 MB)." }, { status: 400 });
    }

    const name = (file.name || "").toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());

    let result: TestQuestionImportResult;
    if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      result = parseXlsxQuestions(buf);
    } else if (name.endsWith(".csv")) {
      const text = buf.toString("utf8");
      // Heuristic: Google Forms response CSV vs our template
      const firstLine = text.split(/\r?\n/)[0] || "";
      if (/timestamp|email address/i.test(firstLine) && !/\*?\s*question/i.test(firstLine)) {
        result = parseGoogleFormsCsv(text);
      } else {
        result = parseCsvQuestions(text);
      }
    } else if (name.endsWith(".pdf")) {
      result = await parsePdfBuffer(buf);
    } else if (name.endsWith(".txt")) {
      result = parseTextQuestions(buf.toString("utf8"));
    } else {
      return NextResponse.json(
        { error: "Unsupported file. Use .xlsx, .csv, .pdf, or a Google Forms link." },
        { status: 400 },
      );
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Import parse failed." },
      { status: 500 },
    );
  }
}
