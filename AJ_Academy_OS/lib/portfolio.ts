import type { PortfolioTemplate } from "@/types/portfolio";

export const PORTFOLIO_MAX_FILE_BYTES = 5 * 1024 * 1024;

export const DEFAULT_PORTFOLIO_PLACEHOLDERS = [
  "student_name",
  "headline",
  "about",
  "skills",
  "projects",
  "education",
  "email",
  "phone",
];

export const DEFAULT_PORTFOLIO_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>{{student_name}} — Portfolio</title>
  <style>
    body { font-family: Georgia, "Times New Roman", serif; max-width: 820px; margin: 0 auto; padding: 48px 32px; color: #1e293b; line-height: 1.6; }
    h1 { font-size: 2rem; margin: 0 0 0.25rem; color: #0f172a; }
    .headline { font-size: 1.1rem; color: #64748b; margin-bottom: 2rem; }
    h2 { font-size: 1.1rem; text-transform: uppercase; letter-spacing: 0.08em; color: #c9a227; border-bottom: 2px solid #e8dcc8; padding-bottom: 0.35rem; margin-top: 2rem; }
    p { margin: 0.5rem 0 1rem; white-space: pre-wrap; }
    .contact { margin-top: 2rem; font-size: 0.95rem; }
  </style>
</head>
<body>
  <h1>{{student_name}}</h1>
  <p class="headline">{{headline}}</p>
  <h2>About</h2>
  <p>{{about}}</p>
  <h2>Skills</h2>
  <p>{{skills}}</p>
  <h2>Projects</h2>
  <p>{{projects}}</p>
  <h2>Education</h2>
  <p>{{education}}</p>
  <p class="contact">{{email}} · {{phone}}</p>
</body>
</html>`;

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function parsePlaceholders(source: string): string[] {
  const found = new Set<string>();
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  while ((match = re.exec(source)) !== null) {
    found.add(match[1]);
  }
  return Array.from(found);
}

export function formatPlaceholderLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function fillPlaceholders(template: string, values: Record<string, string>): string {
  return template.replace(PLACEHOLDER_RE, (_, key: string) => values[key]?.trim() ?? "");
}

export const AJ_ACADEMY_CREDITS_BLOCK = `
<footer style="margin-top:48px;padding-top:20px;border-top:2px solid #e8dcc8;text-align:center;font-family:system-ui,sans-serif;font-size:12px;color:#64748b;">
  <p style="margin:0;">Portfolio prepared with guidance from <strong style="color:#c9a227;">AJ Academy</strong></p>
  <p style="margin:4px 0 0;">Credits to AJ Academy · Professional training &amp; career development</p>
</footer>`;

export function injectCredits(html: string): string {
  if (html.includes("</body>")) {
    return html.replace("</body>", `${AJ_ACADEMY_CREDITS_BLOCK}</body>`);
  }
  return `${html}${AJ_ACADEMY_CREDITS_BLOCK}`;
}

export function buildFallbackPortfolioHtml(values: Record<string, string>): string {
  return fillPlaceholders(DEFAULT_PORTFOLIO_HTML, values);
}

export function renderPortfolioDocument(
  template: Pick<PortfolioTemplate, "template_format" | "html_content" | "placeholder_fields">,
  values: Record<string, string>,
): string {
  const base =
    template.template_format === "html" && template.html_content?.trim()
      ? fillPlaceholders(template.html_content, values)
      : buildFallbackPortfolioHtml(
          template.placeholder_fields.length
            ? Object.fromEntries(template.placeholder_fields.map((k) => [k, values[k] ?? ""]))
            : values,
        );
  return injectCredits(base);
}

export const SAMPLE_PORTFOLIO_VALUES: Record<string, string> = {
  student_name: "Alex Student",
  headline: "Aspiring Full-Stack Developer",
  about: "Motivated learner with hands-on project experience in web development and teamwork.",
  skills: "HTML, CSS, JavaScript, React, Node.js, Git",
  projects: "E-commerce demo store · College event portal · Personal blog",
  education: "B.Tech Computer Science — AJ Academy affiliated program",
  email: "alex@example.com",
  phone: "+91 98765 43210",
};

export function downloadHtmlFile(html: string, filename: string) {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function openPrintDialog(html: string) {
  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    throw new Error("Pop-up blocked. Allow pop-ups to save as PDF.");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 400);
}

export function isMissingPortfolioTable(message: string) {
  const m = message.toLowerCase();
  return (
    (m.includes("portfolio_templates") && (m.includes("does not exist") || m.includes("could not find"))) ||
    m.includes("pgrst205")
  );
}

export function parsePlaceholderFieldsJson(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}
