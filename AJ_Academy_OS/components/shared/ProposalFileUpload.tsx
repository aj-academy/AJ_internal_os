"use client";

import { useRef, useState } from "react";
import { Download, Eye, FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PROPOSAL_ACCEPT,
  formatProposalBytes,
  hasLegacyProposalLink,
  hasUploadedProposal,
  validateProposalFile,
  type ProposalEntityKind,
  type ProposalFileMeta,
} from "@/lib/proposalFiles";

type ProposalFileUploadProps = {
  entityType: ProposalEntityKind;
  /** Null while creating a new record — file is held pending until after save. */
  entityId: string | null;
  meta: ProposalFileMeta;
  pendingFile: File | null;
  onPendingFileChange: (file: File | null) => void;
  onMetaChange: (meta: ProposalFileMeta) => void;
  disabled?: boolean;
  onError?: (message: string) => void;
  onSuccess?: (message: string) => void;
};

export function ProposalFileUpload({
  entityType,
  entityId,
  meta,
  pendingFile,
  onPendingFileChange,
  onMetaChange,
  disabled = false,
  onError,
  onSuccess,
}: ProposalFileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const uploaded = hasUploadedProposal(meta);
  const legacy = hasLegacyProposalLink(meta);
  const legacyHref = meta.proposal_pdf_url?.trim() || meta.proposal_link?.trim() || "";
  const legacyLabel = meta.proposal_pdf_name?.trim() || "Open link";

  const pickFile = (file: File | null) => {
    if (!file) {
      onPendingFileChange(null);
      return;
    }
    const err = validateProposalFile(file);
    if (err) {
      onError?.(err);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }
    onPendingFileChange(file);
  };

  const openSigned = async (download: boolean) => {
    if (!entityId || !uploaded) return;
    setBusy(true);
    try {
      const res = await fetch("/api/proposals/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, download }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "Could not open file.");
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not open file.");
    } finally {
      setBusy(false);
    }
  };

  const removeUploaded = async () => {
    if (!entityId || !uploaded) return;
    if (!confirm("Remove this proposal file? The student/college record will stay.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/proposals/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not remove file.");
      onMetaChange({
        ...meta,
        proposal_file_name: null,
        proposal_file_path: null,
        proposal_file_type: null,
        proposal_file_size: null,
        proposal_uploaded_at: null,
      });
      onPendingFileChange(null);
      onSuccess?.("Proposal file removed.");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not remove file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-[#64748b]">Upload Proposal</span>

      {uploaded ? (
        <div className="rounded-xl border border-[#e8dcc8] bg-[#fffdf8] p-3">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#faf3e3] text-[#c9a227]">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[#3d3428]">{meta.proposal_file_name || "Proposal"}</p>
              <p className="text-xs text-[#6b5d4d]">
                {formatProposalBytes(meta.proposal_file_size)}
                {meta.proposal_uploaded_at
                  ? ` · ${new Date(meta.proposal_uploaded_at).toLocaleDateString()}`
                  : ""}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg border-[#e8dcc8]"
                  disabled={disabled || busy}
                  onClick={() => void openSigned(false)}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" />
                  View
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg border-[#e8dcc8]"
                  disabled={disabled || busy}
                  onClick={() => void openSigned(true)}
                >
                  <Download className="mr-1 h-3.5 w-3.5" />
                  Download
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg border-[#e8dcc8]"
                  disabled={disabled || busy}
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="mr-1 h-3.5 w-3.5" />
                  Replace
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-lg border-rose-200 text-rose-700"
                  disabled={disabled || busy}
                  onClick={() => void removeUploaded()}
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {!uploaded && legacy && legacyHref ? (
        <div className="rounded-xl border border-dashed border-[#e8dcc8] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">Existing proposal link</p>
          <a
            href={legacyHref}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block text-sm font-semibold text-[#a68b2e] hover:underline"
          >
            {legacyLabel}
          </a>
          <p className="mt-1 text-[11px] text-[#64748b]">Read-only. Upload a file below to switch to file storage.</p>
        </div>
      ) : null}

      {pendingFile ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#c9a227]/40 bg-[#faf3e3] px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[#3d3428]">{pendingFile.name}</p>
            <p className="text-xs text-[#6b5d4d]">
              {formatProposalBytes(pendingFile.size)}
              {entityId ? " · Will replace on next save/upload" : " · Uploads after you save this record"}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 shrink-0 rounded-lg border-[#e8dcc8]"
            disabled={disabled || busy}
            onClick={() => {
              onPendingFileChange(null);
              if (inputRef.current) inputRef.current.value = "";
            }}
          >
            Clear
          </Button>
        </div>
      ) : null}

      {!uploaded || pendingFile ? (
        <label
          className={[
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#e8dcc8] bg-white px-4 py-5 text-center transition hover:border-[#c9a227] hover:bg-[#fffdf8]",
            disabled || busy ? "pointer-events-none opacity-50" : "",
            uploaded && !pendingFile ? "hidden" : "",
          ].join(" ")}
        >
          <Upload className="h-5 w-5 text-[#c9a227]" />
          <span className="text-sm font-semibold text-[#3d3428]">
            {pendingFile ? "Choose a different file" : "Choose file / Drop proposal here"}
          </span>
          <span className="text-[11px] text-[#6b5d4d]">PDF, DOC or DOCX — Maximum 10 MB</span>
          <input
            ref={inputRef}
            type="file"
            accept={PROPOSAL_ACCEPT}
            className="sr-only"
            disabled={disabled || busy}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
        </label>
      ) : (
        <input
          ref={inputRef}
          type="file"
          accept={PROPOSAL_ACCEPT}
          className="sr-only"
          disabled={disabled || busy}
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
        />
      )}

      {!uploaded && !pendingFile ? (
        <p className="text-[11px] leading-relaxed text-[#6b5d4d]">PDF, DOC or DOCX — Maximum 10 MB</p>
      ) : null}
    </div>
  );
}

/** Upload pending file after the parent record exists. */
export async function uploadProposalFile(opts: {
  entityType: ProposalEntityKind;
  entityId: string;
  file: File;
}): Promise<ProposalFileMeta> {
  const err = validateProposalFile(opts.file);
  if (err) throw new Error(err);
  const body = new FormData();
  body.set("entityType", opts.entityType);
  body.set("entityId", opts.entityId);
  body.set("file", opts.file);
  const res = await fetch("/api/proposals/upload", { method: "POST", body });
  const json = (await res.json()) as ProposalFileMeta & { error?: string; ok?: boolean };
  if (!res.ok) throw new Error(json.error || "Upload failed.");
  return {
    proposal_file_name: json.proposal_file_name ?? opts.file.name,
    proposal_file_path: json.proposal_file_path ?? null,
    proposal_file_type: json.proposal_file_type ?? null,
    proposal_file_size: json.proposal_file_size ?? opts.file.size,
    proposal_uploaded_at: json.proposal_uploaded_at ?? new Date().toISOString(),
  };
}
