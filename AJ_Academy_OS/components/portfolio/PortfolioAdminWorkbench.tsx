"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_PORTFOLIO_HTML,
  DEFAULT_PORTFOLIO_PLACEHOLDERS,
  isMissingPortfolioTable,
  parsePlaceholders,
  renderPortfolioDocument,
  SAMPLE_PORTFOLIO_VALUES,
} from "@/lib/portfolio";
import type { PortfolioTemplate } from "@/types/portfolio";

export function PortfolioAdminWorkbench() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [templates, setTemplates] = useState<PortfolioTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("Portfolio Template");
  const [htmlContent, setHtmlContent] = useState(DEFAULT_PORTFOLIO_HTML);
  const [templateFormat, setTemplateFormat] = useState<"html" | "pdf">("html");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [placeholderFields, setPlaceholderFields] = useState<string[]>(DEFAULT_PORTFOLIO_PLACEHOLDERS);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [selectedId, templates],
  );

  const detectedPlaceholders = useMemo(() => {
    if (templateFormat === "html" && htmlContent.trim()) {
      const parsed = parsePlaceholders(htmlContent);
      return parsed.length ? parsed : placeholderFields;
    }
    return placeholderFields;
  }, [htmlContent, placeholderFields, templateFormat]);

  const previewHtml = useMemo(() => {
    if (templateFormat === "pdf" && fileUrl) {
      return null;
    }
    return renderPortfolioDocument(
      {
        template_format: templateFormat,
        html_content: htmlContent,
        placeholder_fields: detectedPlaceholders,
      },
      SAMPLE_PORTFOLIO_VALUES,
    );
  }, [detectedPlaceholders, fileUrl, htmlContent, templateFormat]);

  const selectTemplate = (t: PortfolioTemplate) => {
    setSelectedId(t.id);
    setTitle(t.title);
    setHtmlContent(t.html_content ?? DEFAULT_PORTFOLIO_HTML);
    setTemplateFormat(t.template_format);
    setFileUrl(t.file_url);
    setPlaceholderFields(t.placeholder_fields.length ? t.placeholder_fields : DEFAULT_PORTFOLIO_PLACEHOLDERS);
    setIsActive(t.is_active);
  };

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/portfolio");
    const payload = (await res.json()) as { templates?: PortfolioTemplate[]; error?: string };
    if (!res.ok) {
      if (payload.error && isMissingPortfolioTable(payload.error)) setSchemaMissing(true);
      setError(payload.error ?? "Could not load templates.");
      setTemplates([]);
      setLoading(false);
      return;
    }
    setSchemaMissing(false);
    const list = payload.templates ?? [];
    setTemplates(list);
    setLoading(false);
    return list;
  }, []);

  const initializedRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const list = await loadTemplates();
      if (!initializedRef.current && list?.length) {
        initializedRef.current = true;
        selectTemplate(list.find((t) => t.is_active) ?? list[0]);
      }
    })();
  }, [loadTemplates]);

  const handleNew = () => {
    setSelectedId(null);
    setTitle("Portfolio Template");
    setHtmlContent(DEFAULT_PORTFOLIO_HTML);
    setTemplateFormat("html");
    setFileUrl(null);
    setPlaceholderFields(DEFAULT_PORTFOLIO_PLACEHOLDERS);
    setIsActive(false);
    setError(null);
    setSuccess(null);
  };

  const handleLoadDefault = () => {
    setHtmlContent(DEFAULT_PORTFOLIO_HTML);
    setTemplateFormat("html");
    setPlaceholderFields(parsePlaceholders(DEFAULT_PORTFOLIO_HTML));
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/admin/portfolio/upload", { method: "POST", body: fd });
    const payload = (await res.json()) as {
      file_url?: string;
      html_content?: string | null;
      template_format?: "html" | "pdf";
      error?: string;
    };
    setUploading(false);
    if (!res.ok) {
      setError(payload.error ?? "Upload failed.");
      return;
    }
    setFileUrl(payload.file_url ?? null);
    if (payload.template_format) setTemplateFormat(payload.template_format);
    if (payload.html_content) {
      setHtmlContent(payload.html_content);
      setPlaceholderFields(parsePlaceholders(payload.html_content));
    } else if (payload.template_format === "pdf") {
      setPlaceholderFields(DEFAULT_PORTFOLIO_PLACEHOLDERS);
    }
    setSuccess("File uploaded.");
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const fields =
      templateFormat === "html"
        ? parsePlaceholders(htmlContent).length
          ? parsePlaceholders(htmlContent)
          : placeholderFields
        : placeholderFields;

    const body = {
      title: title.trim() || "Portfolio Template",
      template_format: templateFormat,
      html_content: templateFormat === "html" ? htmlContent : null,
      file_url: fileUrl,
      placeholder_fields: fields,
      is_active: isActive,
    };

    const res = selectedId
      ? await fetch(`/api/admin/portfolio/${selectedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch("/api/admin/portfolio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

    const payload = (await res.json()) as { template?: PortfolioTemplate; error?: string };
    setSaving(false);

    if (!res.ok) {
      setError(payload.error ?? "Save failed.");
      return;
    }

    setSuccess(selectedId ? "Template updated." : "Template created.");
    if (payload.template) selectTemplate(payload.template);
    await loadTemplates();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this portfolio template?")) return;
    const res = await fetch(`/api/admin/portfolio/${id}`, { method: "DELETE" });
    const payload = (await res.json()) as { error?: string };
    if (!res.ok) {
      setError(payload.error ?? "Delete failed.");
      return;
    }
    if (selectedId === id) handleNew();
    await loadTemplates();
  };

  return (
    <section className="space-y-6 rounded-[24px] border border-[#e8dcc8] bg-white p-4 shadow-[0_20px_40px_rgba(30,64,175,0.08)] sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748b]">Admin Control</p>
          <h2 className="mt-2 text-3xl font-semibold text-[#0f172a]">Portfolio Templates</h2>
          <p className="mt-2 text-sm text-[#64748b]">
            Upload HTML or PDF portfolio templates. Students fill <code className="rounded bg-[#faf3e3] px-1">{"{{placeholders}}"}</code> and
            download with AJ Academy credits.
          </p>
        </div>
        <Button type="button" onClick={handleNew} className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]">
          + New template
        </Button>
      </div>

      {schemaMissing ? (
        <div className="rounded-xl border border-blue-200 bg-[#faf3e3] px-4 py-3 text-sm text-blue-900">
          Run <strong>AJ_Academy_SB/portfolio_schema.sql</strong> in Supabase SQL Editor, then refresh.
        </div>
      ) : null}
      {error ? <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">{error}</div> : null}
      {success ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">{success}</div> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[#64748b]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
        </div>
      ) : null}

      {templates.length ? (
        <div className="flex flex-wrap gap-2">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTemplate(t)}
              className={[
                "rounded-full border px-3 py-1.5 text-xs font-semibold",
                selectedId === t.id
                  ? "border-[#c9a227] bg-[#faf3e3] text-[#3d3428]"
                  : "border-[#e8dcc8] bg-white text-[#64748b] hover:bg-[#fffdf8]",
              ].join(" ")}
            >
              {t.title}
              {t.is_active ? " · Active" : ""}
            </button>
          ))}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-4">
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase text-[#64748b]">Template title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="border-[#dbe6f3] bg-white" />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-[#0f172a]">HTML code</span>
            <Button type="button" variant="outline" size="sm" className="rounded-full border-[#e8dcc8]" onClick={handleLoadDefault}>
              Load default template
            </Button>
          </div>

          <textarea
            value={htmlContent}
            onChange={(e) => {
              setHtmlContent(e.target.value);
              setTemplateFormat("html");
              const parsed = parsePlaceholders(e.target.value);
              if (parsed.length) setPlaceholderFields(parsed);
            }}
            rows={16}
            disabled={templateFormat === "pdf" && !htmlContent.trim()}
            className="w-full resize-y rounded-xl border border-[#dbe6f3] bg-white px-3 py-2 font-mono text-xs text-[#0f172a] outline-none focus:border-[#c9a227] focus:ring-2 focus:ring-[#c9a227]/20"
            spellCheck={false}
          />

          <p className="text-xs text-[#64748b]">
            Placeholders:{" "}
            {detectedPlaceholders.length
              ? detectedPlaceholders.map((p) => `{{${p}}}`).join(", ")
              : "none detected — use {{field_name}} in HTML"}
          </p>

          <div className="rounded-xl border border-[#dbe6f3] bg-white p-3">
            <p className="text-xs font-semibold uppercase text-[#64748b]">Upload file (optional for HTML code)</p>
            <p className="mt-1 text-xs text-[#94a3b8]">.html, .htm, or .pdf — max 5 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,.pdf,text/html,application/pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="mt-3 rounded-full border-[#2563eb] text-[#2563eb] hover:bg-[#eef4ff]"
            >
              {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Choose file
            </Button>
            {fileUrl ? (
              <p className="mt-2 truncate text-xs text-[#64748b]">
                Uploaded:{" "}
                <a href={fileUrl} target="_blank" rel="noreferrer" className="text-[#2563eb] underline">
                  {fileUrl.split("/").pop()}
                </a>
              </p>
            ) : null}
          </div>

          {templateFormat === "pdf" ? (
            <label className="block space-y-1">
              <span className="text-xs font-semibold uppercase text-[#64748b]">Fields for PDF template (comma-separated)</span>
              <Input
                value={placeholderFields.join(", ")}
                onChange={(e) =>
                  setPlaceholderFields(
                    e.target.value
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
                className="border-[#dbe6f3] bg-white"
              />
            </label>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-[#334155]">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Set as active template for students
          </label>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              data-requires-online
              disabled={saving || schemaMissing}
              onClick={() => void handleSave()}
              className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
            >
              {saving ? "Saving…" : selectedId ? "Update template" : "Save template"}
            </Button>
            {selectedId ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full border-rose-200 text-rose-700"
                onClick={() => void handleDelete(selectedId)}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Delete
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-[#dbe6f3] bg-white p-4">
          <div>
            <h3 className="text-lg font-semibold text-[#0f172a]">Preview</h3>
            <p className="text-xs text-[#64748b]">Sample placeholder data — updates as you type or upload.</p>
          </div>
          <div className="min-h-[420px] overflow-hidden rounded-xl border border-[#dbe6f3] bg-[#f8fafc]">
            {templateFormat === "pdf" && fileUrl ? (
              <iframe title="PDF template preview" src={fileUrl} className="h-[520px] w-full" />
            ) : previewHtml ? (
              <iframe title="HTML preview" srcDoc={previewHtml} className="h-[520px] w-full bg-white" sandbox="" />
            ) : (
              <p className="p-8 text-center text-sm text-[#64748b]">
                Enter HTML code or upload a file to see a live preview here.
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
