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
  type ProposalStoredFile,
} from "@/lib/proposalFiles";

type ProposalFileUploadProps = {
  entityType: ProposalEntityKind;
  /** Null while creating a new record — file is held pending until after save. */
  entityId: string | null;
  meta: ProposalFileMeta;
  pendingFile: File | null;
  onPendingFileChange: (file: File | null) => void;
  pendingFiles?: File[];
  onPendingFilesChange?: (files: File[]) => void;
  multiple?: boolean;
  files?: ProposalStoredFile[];
  onFilesChange?: (files: ProposalStoredFile[]) => void;
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
  pendingFiles,
  onPendingFilesChange,
  multiple = false,
  files = [],
  onFilesChange,
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

  const pendingList = multiple ? (pendingFiles ?? []) : pendingFile ? [pendingFile] : [];

  const pickFiles = (list: FileList | null) => {
    if (!list || list.length === 0) {
      if (!multiple) onPendingFileChange(null);
      return;
    }
    const picked = Array.from(list);
    const valid: File[] = [];
    for (const file of picked) {
      const err = validateProposalFile(file);
      if (err) {
        onError?.(`${file.name}: ${err}`);
        continue;
      }
      valid.push(file);
    }
    if (!valid.length) return;
    if (multiple) {
      const existing = pendingFiles ?? [];
      const byKey = new Map(existing.map((f) => [`${f.name}:${f.size}:${f.lastModified}`, f]));
      for (const f of valid) byKey.set(`${f.name}:${f.size}:${f.lastModified}`, f);
      onPendingFilesChange?.([...byKey.values()]);
    } else {
      onPendingFileChange(valid[0] ?? null);
    }
    if (inputRef.current) inputRef.current.value = "";
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

  const removeStoredFile = async (file: ProposalStoredFile) => {
    if (!entityId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/proposals/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, filePath: file.file_path, fileId: file.id }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not remove file.");
      onFilesChange?.(files.filter((f) => f.id !== file.id));
      onSuccess?.("File removed.");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not remove file.");
    } finally {
      setBusy(false);
    }
  };

  const openStored = async (file: ProposalStoredFile, download: boolean) => {
    if (!entityId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/proposals/signed-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType, entityId, filePath: file.file_path, fileName: file.file_name, download }),
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

  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium text-[#64748b]">
        {multiple ? "Upload Proposal (multiple files)" : "Upload Proposal"}
      </span>

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
                {multiple ? " · Primary / legacy file" : ""}
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
                {!multiple ? (
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
                ) : null}
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

      {multiple && files.length ? (
        <div className="space-y-2 rounded-xl border border-[#e8dcc8] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#94a3b8]">Uploaded files ({files.length})</p>
          {files.map((file) => (
            <div key={file.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#eee7d8] px-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#3d3428]">{file.file_name}</p>
                <p className="text-[11px] text-[#6b5d4d]">{formatProposalBytes(file.file_size)}</p>
              </div>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => void openStored(file, false)} disabled={busy || disabled}>
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2" onClick={() => void openStored(file, true)} disabled={busy || disabled}>
                  <Download className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-7 border-rose-200 px-2 text-rose-700" onClick={() => void removeStoredFile(file)} disabled={busy || disabled}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
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

      {pendingList.length ? (
        <div className="space-y-2 rounded-xl border border-[#c9a227]/40 bg-[#faf3e3] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#8a7020]">
              Ready to upload ({pendingList.length})
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 rounded-lg border-[#e8dcc8]"
              disabled={disabled || busy}
              onClick={() => {
                if (multiple) onPendingFilesChange?.([]);
                else onPendingFileChange(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              Clear all
            </Button>
          </div>
          {pendingList.map((file, idx) => (
            <div key={`${file.name}-${file.size}-${file.lastModified}-${idx}`} className="flex items-center justify-between gap-2 rounded-lg bg-white/70 px-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#3d3428]">{file.name}</p>
                <p className="text-[11px] text-[#6b5d4d]">
                  {formatProposalBytes(file.size)}
                  {entityId ? " · Uploads on Save" : " · Uploads after you save this record"}
                </p>
              </div>
              {multiple ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 shrink-0 border-rose-200 px-2 text-rose-700"
                  disabled={disabled || busy}
                  onClick={() =>
                    onPendingFilesChange?.(pendingList.filter((_, i) => i !== idx))
                  }
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Always show add zone in multiple mode; single mode hides it when a file is already uploaded */}
      {multiple || !uploaded || pendingList.length > 0 ? (
        <label
          className={[
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[#e8dcc8] bg-white px-4 py-5 text-center transition hover:border-[#c9a227] hover:bg-[#fffdf8]",
            disabled || busy ? "pointer-events-none opacity-50" : "",
            !multiple && uploaded && pendingList.length === 0 ? "hidden" : "",
          ].join(" ")}
        >
          <Upload className="h-5 w-5 text-[#c9a227]" />
          <span className="text-sm font-semibold text-[#3d3428]">
            {multiple
              ? uploaded || files.length || pendingList.length
                ? "Add more proposal files"
                : "Choose files / Drop proposals here"
              : pendingList.length
                ? "Choose a different file"
                : "Choose file / Drop proposal here"}
          </span>
          <span className="text-[11px] text-[#6b5d4d]">
            {multiple
              ? "PDF, DOC or DOCX — max 10 MB each · select multiple files"
              : "PDF, DOC or DOCX — Maximum 10 MB"}
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple={multiple}
            accept={PROPOSAL_ACCEPT}
            className="sr-only"
            disabled={disabled || busy}
            onChange={(e) => pickFiles(e.target.files)}
          />
        </label>
      ) : (
        <input
          ref={inputRef}
          type="file"
          multiple={multiple}
          accept={PROPOSAL_ACCEPT}
          className="sr-only"
          disabled={disabled || busy}
          onChange={(e) => pickFiles(e.target.files)}
        />
      )}

      {!uploaded && !pendingList.length && !multiple ? (
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
