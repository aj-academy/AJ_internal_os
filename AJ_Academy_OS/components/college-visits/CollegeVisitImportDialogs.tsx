"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type CollegeDuplicateResolution,
  resolutionLabel,
  stripFileExtension,
} from "@/lib/collegeVisitsImportResolutions";

type CollegeVisitDuplicateResolutionButtonsProps = {
  value: CollegeDuplicateResolution;
  onChange: (action: CollegeDuplicateResolution) => void;
  disabled?: boolean;
  compact?: boolean;
};

export function CollegeVisitDuplicateResolutionButtons({
  value,
  onChange,
  disabled,
  compact,
}: CollegeVisitDuplicateResolutionButtonsProps) {
  const actions: CollegeDuplicateResolution[] = ["skip", "add", "update"];
  return (
    <div className={`flex flex-wrap gap-1.5 ${compact ? "" : "mt-2"}`}>
      {actions.map((action) => (
        <button
          key={action}
          type="button"
          disabled={disabled}
          onClick={() => onChange(action)}
          className={
            value === action
              ? action === "skip"
                ? "rounded-full bg-slate-700 px-2.5 py-1 text-[11px] font-semibold text-white"
                : action === "add"
                  ? "rounded-full bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white"
                  : "rounded-full bg-[#c9a227] px-2.5 py-1 text-[11px] font-semibold text-white"
              : "rounded-full border border-[#dbe6f3] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#475569] hover:bg-[#f8fbff] disabled:opacity-50"
          }
        >
          {resolutionLabel(action)}
        </button>
      ))}
    </div>
  );
}

type CollegeVisitImportUploadDialogProps = {
  open: boolean;
  file: File | null;
  displayName: string;
  uploading?: boolean;
  onDisplayNameChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function CollegeVisitImportUploadDialog({
  open,
  file,
  displayName,
  uploading,
  onDisplayNameChange,
  onCancel,
  onConfirm,
}: CollegeVisitImportUploadDialogProps) {
  if (!open || !file) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#dbe6f3] bg-white p-5 shadow-xl">
        <h3 className="text-lg font-semibold text-[#0f172a]">Name this upload</h3>
        <p className="mt-1 text-sm text-[#64748b]">
          Choose a friendly folder name. The file on your laptop was{" "}
          <span className="font-medium text-[#334155]">{file.name}</span>.
        </p>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-[#64748b]" htmlFor="cv-import-display-name">
          Folder name
        </label>
        <Input
          id="cv-import-display-name"
          className="mt-1.5"
          value={displayName}
          onChange={(e) => onDisplayNameChange(e.target.value)}
          placeholder={stripFileExtension(file.name)}
          autoFocus
        />
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onCancel} disabled={uploading}>
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full bg-[#c9a227] text-white hover:bg-[#b8921f]"
            disabled={uploading || !displayName.trim()}
            onClick={onConfirm}
          >
            {uploading ? "Uploading…" : "Upload & preview"}
          </Button>
        </div>
      </div>
    </div>
  );
}
