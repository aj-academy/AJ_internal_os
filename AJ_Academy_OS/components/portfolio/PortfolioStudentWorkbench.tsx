"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CrmFlash } from "@/components/ui/CrmFlash";
import {
  downloadHtmlFile,
  formatPlaceholderLabel,
  isMissingPortfolioTable,
  openPrintDialog,
  renderPortfolioDocument,
} from "@/lib/portfolio";
import type { PortfolioTemplate, StudentPortfolioEntry } from "@/types/portfolio";

export function PortfolioStudentWorkbench() {
  const [template, setTemplate] = useState<PortfolioTemplate | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fields = useMemo(() => template?.placeholder_fields ?? [], [template]);

  const previewHtml = useMemo(() => {
    if (!template) return null;
    if (template.template_format === "pdf" && template.file_url && !template.html_content?.trim()) {
      return null;
    }
    return renderPortfolioDocument(template, values);
  }, [template, values]);

  const loadPortfolio = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/student/portfolio");
    const payload = (await res.json()) as {
      template?: PortfolioTemplate | null;
      entry?: StudentPortfolioEntry | null;
      profile?: { full_name: string | null; email: string | null };
      error?: string;
    };

    if (!res.ok) {
      if (payload.error && isMissingPortfolioTable(payload.error)) setSchemaMissing(true);
      setError(payload.error ?? "Could not load portfolio.");
      setLoading(false);
      return;
    }

    setSchemaMissing(false);
    const t = payload.template ?? null;
    setTemplate(t);

    const saved = payload.entry?.field_values ?? {};
    const initial: Record<string, string> = { ...saved };
    if (t) {
      t.placeholder_fields.forEach((key) => {
        if (!(key in initial)) initial[key] = "";
      });
      if (!initial.student_name?.trim() && payload.profile?.full_name) {
        initial.student_name = payload.profile.full_name;
      }
      if (!initial.email?.trim() && payload.profile?.email) {
        initial.email = payload.profile.email;
      }
    }
    setValues(initial);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPortfolio();
  }, [loadPortfolio]);

  const patchValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!template) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    const res = await fetch("/api/student/portfolio", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template_id: template.id, field_values: values }),
    });
    const payload = (await res.json()) as { error?: string };
    setSaving(false);
    if (!res.ok) {
      setError(payload.error ?? "Could not save.");
      return;
    }
    setSuccess("Portfolio saved.");
  };

  const handleDownloadHtml = () => {
    if (!template) return;
    const html = renderPortfolioDocument(template, values);
    const name = (values.student_name || "portfolio").replace(/[^\w\-]+/g, "_");
    downloadHtmlFile(html, `${name}-portfolio.html`);
  };

  const handleDownloadPdf = () => {
    if (!template) return;
    const html = renderPortfolioDocument(template, values);
    openPrintDialog(html);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-[24px] border border-[#d4deea] bg-white p-8 text-sm text-[#64748b]">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading portfolio…
      </div>
    );
  }

  if (!template) {
    return (
      <section className="space-y-4 rounded-[24px] border border-[#d4deea] bg-white p-6 shadow-[0_20px_40px_rgba(30,64,175,0.08)] lg:p-8">
        <h2 className="text-3xl font-semibold text-slate-900">My Portfolio</h2>
        {schemaMissing ? (
          <p className="text-sm text-rose-700">Portfolio module is not set up yet. Ask admin to run portfolio_schema.sql.</p>
        ) : (
          <p className="text-sm text-slate-600">
            No active portfolio template yet. Your admin will upload a template — check back soon.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-6 rounded-[24px] border border-[#d4deea] bg-white p-4 shadow-[0_20px_40px_rgba(30,64,175,0.08)] sm:p-6 lg:p-8">
      <div>
        <h2 className="text-3xl font-semibold text-slate-900">My Portfolio</h2>
        <p className="mt-1 text-sm text-slate-600">
          Fill in your details below. Download includes <strong className="font-medium text-[#c9a227]">credits to AJ Academy</strong>.
        </p>
        <p className="mt-1 text-xs text-[#64748b]">Template: {template.title}</p>
      </div>

      {error ? <CrmFlash tone="error" message={error} onDismiss={() => setError(null)} /> : null}
      {success ? <CrmFlash tone="success" message={success} onDismiss={() => setSuccess(null)} /> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-4 rounded-2xl border border-[#dbe6f3] bg-[#f8fbff] p-4">
          <h3 className="text-lg font-semibold text-slate-900">Your information</h3>
          <div className="grid gap-3">
            {fields.map((key) => (
              <label key={key} className="block space-y-1">
                <span className="text-xs font-semibold uppercase text-[#64748b]">{formatPlaceholderLabel(key)}</span>
                {key === "about" || key === "projects" || key === "skills" || key === "education" ? (
                  <textarea
                    rows={3}
                    value={values[key] ?? ""}
                    onChange={(e) => patchValue(key, e.target.value)}
                    className="w-full rounded-xl border border-[#cfdceb] bg-white px-3 py-2 text-sm outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#dbeafe]"
                  />
                ) : (
                  <Input
                    value={values[key] ?? ""}
                    onChange={(e) => patchValue(key, e.target.value)}
                    className="border-[#cfdceb] bg-white"
                  />
                )}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              data-requires-online
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-full bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save progress
            </Button>
            <Button type="button" variant="outline" className="rounded-full border-[#d4deea]" onClick={handleDownloadHtml}>
              <Download className="mr-2 h-4 w-4" /> Download HTML
            </Button>
            <Button type="button" className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]" onClick={handleDownloadPdf}>
              <Download className="mr-2 h-4 w-4" /> Save as PDF
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-[#dbe6f3] bg-white p-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Preview</h3>
            <p className="text-xs text-[#64748b]">Live preview with your entries and AJ Academy credits.</p>
          </div>
          <div className="min-h-[420px] overflow-hidden rounded-xl border border-[#dbe6f3] bg-[#f8fafc]">
            {template.template_format === "pdf" && template.file_url && !template.html_content?.trim() ? (
              <div className="space-y-3 p-4">
                <p className="text-sm text-[#64748b]">Reference template (PDF):</p>
                <iframe title="PDF reference" src={template.file_url} className="h-[360px] w-full rounded-lg border" />
                <p className="text-xs text-[#94a3b8]">
                  Your downloaded portfolio will be generated from the fields you fill, with AJ Academy branding.
                </p>
                {previewHtml ? (
                  <iframe title="Generated preview" srcDoc={previewHtml} className="h-[280px] w-full rounded-lg border bg-white" sandbox="" />
                ) : null}
              </div>
            ) : previewHtml ? (
              <iframe title="Portfolio preview" srcDoc={previewHtml} className="h-[520px] w-full bg-white" sandbox="" />
            ) : (
              <p className="p-8 text-center text-sm text-[#64748b]">Fill in fields to see your portfolio preview.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
