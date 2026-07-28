"use client";

import type { ReactNode } from "react";
import { Monitor, Smartphone, FileText } from "lucide-react";

export type PortfolioPreviewMode = "a4" | "laptop" | "phone";

const MODES: {
  id: PortfolioPreviewMode;
  label: string;
  hint: string;
  icon: typeof FileText;
}[] = [
  { id: "a4", label: "A4 sheet", hint: "Print / PDF page (210×297 mm)", icon: FileText },
  { id: "laptop", label: "Laptop", hint: "Desktop browser window", icon: Monitor },
  { id: "phone", label: "Phone", hint: "Mobile screen (~390×844)", icon: Smartphone },
];

type Props = {
  mode: PortfolioPreviewMode;
  onModeChange: (mode: PortfolioPreviewMode) => void;
  previewHtml: string | null;
  pdfUrl?: string | null;
  emptyText?: string;
  subtitle?: string;
};

export function PortfolioPreviewPanel({
  mode,
  onModeChange,
  previewHtml,
  pdfUrl = null,
  emptyText = "Enter HTML code or upload a file to see a live preview here.",
  subtitle = "Sample placeholder data — updates as you type or upload.",
}: Props) {
  const showPdf = Boolean(pdfUrl) && !previewHtml;

  return (
    <div className="space-y-3 rounded-2xl border border-[#dbe6f3] bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-[#0f172a]">Preview</h3>
          <p className="text-xs text-[#64748b]">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 rounded-full border border-[#e8dcc8] bg-[#fffdf8] p-1">
          {MODES.map((m) => {
            const Icon = m.icon;
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                title={m.hint}
                onClick={() => onModeChange(m.id)}
                className={[
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                  active
                    ? "bg-[#c9a227] text-white shadow-sm"
                    : "text-[#64748b] hover:bg-white hover:text-[#3d3428]",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-[#94a3b8]">{MODES.find((m) => m.id === mode)?.hint}</p>

      <div className="flex min-h-[480px] justify-center overflow-auto rounded-xl border border-[#dbe6f3] bg-[#e8eef5] p-4 sm:p-6">
        {showPdf ? (
          <DeviceFrame mode={mode}>
            <iframe title="PDF template preview" src={pdfUrl!} className="h-full w-full bg-white" />
          </DeviceFrame>
        ) : previewHtml ? (
          <DeviceFrame mode={mode}>
            <iframe
              title="HTML portfolio preview"
              srcDoc={previewHtml}
              className="h-full w-full bg-white"
              sandbox=""
            />
          </DeviceFrame>
        ) : (
          <p className="self-center p-8 text-center text-sm text-[#64748b]">{emptyText}</p>
        )}
      </div>
    </div>
  );
}

function DeviceFrame({ mode, children }: { mode: PortfolioPreviewMode; children: ReactNode }) {
  if (mode === "a4") {
    return (
      <div className="flex w-full max-w-[620px] flex-col items-center gap-2">
        <div
          className="w-full overflow-hidden bg-white shadow-[0_18px_40px_rgba(15,23,42,0.18)] ring-1 ring-[#cbd5e1]"
          style={{ aspectRatio: "210 / 297", maxHeight: "min(78vh, 900px)" }}
        >
          <div className="h-full w-full origin-top">{children}</div>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wide text-[#64748b]">A4 portrait</span>
      </div>
    );
  }

  if (mode === "phone") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="rounded-[2rem] border-[10px] border-[#0f172a] bg-[#0f172a] p-1 shadow-[0_18px_40px_rgba(15,23,42,0.28)]">
          <div className="mb-1 flex justify-center">
            <span className="h-1.5 w-16 rounded-full bg-[#334155]" />
          </div>
          <div className="h-[640px] w-[320px] overflow-hidden rounded-[1.25rem] bg-white sm:h-[700px] sm:w-[360px]">
            {children}
          </div>
          <div className="mt-1.5 flex justify-center">
            <span className="h-1 w-10 rounded-full bg-[#475569]" />
          </div>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wide text-[#64748b]">Phone screen</span>
      </div>
    );
  }

  // laptop
  return (
    <div className="flex w-full max-w-[980px] flex-col items-center gap-2">
      <div className="w-full overflow-hidden rounded-t-xl border-[10px] border-[#1e293b] border-b-0 bg-[#1e293b] shadow-[0_18px_40px_rgba(15,23,42,0.22)]">
        <div className="flex items-center gap-1.5 border-b border-[#334155] bg-[#0f172a] px-3 py-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f87171]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#fbbf24]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#34d399]" />
          <span className="ml-3 flex-1 truncate rounded bg-[#1e293b] px-2 py-0.5 text-[10px] text-[#94a3b8]">
            portfolio.preview
          </span>
        </div>
        <div className="h-[480px] w-full bg-white sm:h-[520px]">{children}</div>
      </div>
      <div className="h-3 w-[102%] max-w-[1020px] rounded-b-xl bg-[#1e293b]" />
      <div className="h-2 w-40 rounded-b-md bg-[#334155]" />
      <span className="text-[10px] font-medium uppercase tracking-wide text-[#64748b]">Laptop screen</span>
    </div>
  );
}
