"use client";

import { useId, useRef } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TaskAttachment } from "@/lib/taskAttachments";

type TaskAttachmentUploadProps = {
  files: File[];
  onFilesChange: (files: File[]) => void;
  existing?: TaskAttachment[];
  disabled?: boolean;
  label?: string;
  hint?: string;
};

export function TaskAttachmentUpload({
  files,
  onFilesChange,
  existing = [],
  disabled = false,
  label = "Attachments (optional)",
  hint = "PDF, Word, Excel, images, video — max 25 MB each. Multiple files allowed.",
}: TaskAttachmentUploadProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const merged = [...files];
    Array.from(incoming).forEach((file) => {
      if (!merged.some((f) => f.name === file.name && f.size === file.size)) {
        merged.push(file);
      }
    });
    onFilesChange(merged);
  };

  const removePending = (index: number) => {
    onFilesChange(files.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2 rounded-xl border border-[#e8dcc8] bg-[#fffdf8] p-3">
      <p className="text-sm font-medium text-[#3d3428]">{label}</p>
      <p className="text-xs text-[#6b5d4d]">{hint}</p>
      <input
        id={inputId}
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          addFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="h-9 rounded-full border-[#e8dcc8] bg-white text-[#3d3428] hover:bg-[#faf6ee]"
      >
        <Paperclip className="mr-2 h-4 w-4" />
        Upload multiple files
      </Button>
      {existing.length ? (
        <ul className="space-y-1 text-xs text-[#6b5d4d]">
          {existing.map((a) => (
            <li key={a.url}>
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-[#a68b2e] underline">
                {a.name}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {files.length ? (
        <ul className="space-y-1 text-xs text-[#334155]">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1">
              <span className="truncate">{file.name}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removePending(index)}
                className="shrink-0 text-rose-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
