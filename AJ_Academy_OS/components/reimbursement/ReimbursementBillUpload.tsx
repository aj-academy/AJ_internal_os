"use client";

import { useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

type ReimbursementBillUploadProps = {
  disabled?: boolean;
  hint?: string;
  maxMb: number;
  onUpload: (files: File[]) => Promise<void>;
};

export function ReimbursementBillUpload({
  disabled = false,
  hint = "Submit or save draft first, then upload receipts.",
  maxMb,
  onUpload,
}: ReimbursementBillUploadProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || disabled) return;
    setUploading(true);
    try {
      await onUpload(Array.from(files));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-[#dbe6f3] bg-white p-4">
      <div>
        <h3 className="font-semibold text-slate-900">Attach bills</h3>
        <p className="mt-1 text-xs text-[#64748b]">{hint}</p>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled) void handleFiles(e.dataTransfer.files);
        }}
        className={[
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-10 text-center transition-colors",
          dragOver ? "border-[#2563eb] bg-[#eef4ff]" : "border-[#bfd4f5] bg-[#f8fbff]",
          disabled ? "opacity-60" : "",
        ].join(" ")}
      >
        <Upload className="mb-3 h-10 w-10 text-[#2563eb]" />
        <p className="text-sm font-medium text-slate-800">Drag and drop bills here</p>
        <p className="mt-1 text-xs text-[#64748b]">PDF, images, Word, Excel — max {maxMb} MB each</p>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="sr-only"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,image/*,application/pdf"
          disabled={disabled || uploading}
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={disabled || uploading}
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button
            type="button"
            disabled={disabled || uploading}
            onClick={() => fileRef.current?.click()}
            className="rounded-full bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
          >
            Choose files
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled || uploading}
            onClick={() => cameraRef.current?.click()}
            className="rounded-full border-[#cfdceb]"
          >
            <Camera className="mr-2 h-4 w-4" />
            Capture photo
          </Button>
        </div>
      </div>
      <p className="text-xs text-[#94a3b8]">Cloud import (Google Drive, OneDrive, WhatsApp) — coming soon</p>
    </div>
  );
}
