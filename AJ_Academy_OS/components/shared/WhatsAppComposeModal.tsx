"use client";

import { useEffect, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyWhatsAppTemplate, MAX_WHATSAPP_MESSAGE_LENGTH } from "@/lib/whatsappOutreach";
import {
  appendAttachmentLinks,
  MAX_OUTREACH_ATTACHMENTS,
  MAX_OUTREACH_ATTACHMENT_BYTES,
  uploadOutreachAttachments,
} from "@/lib/outreachAttachments";
import { createClient } from "@/lib/supabase/client";

type WhatsAppComposeModalProps = {
  open: boolean;
  leadName: string;
  phone: string;
  templates: string[];
  submitting?: boolean;
  /** Set false to hide the attachment picker. */
  allowAttachments?: boolean;
  onClose: () => void;
  onSend: (message: string) => void | Promise<void>;
};

function formatBytes(size: number) {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

export function WhatsAppComposeModal({
  open,
  leadName,
  phone,
  templates,
  submitting = false,
  allowAttachments = true,
  onClose,
  onSend,
}: WhatsAppComposeModalProps) {
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setMessage("");
      setFiles([]);
      setLocalError(null);
    }
  }, [open, leadName, phone]);

  if (!open) return null;

  const busy = submitting || uploading;

  const appendTemplate = (template: string) => {
    const text = applyWhatsAppTemplate(template, leadName);
    setMessage((prev) => {
      const next = prev.trim() ? `${prev.trim()}\n\n${text}` : text;
      return next.slice(0, MAX_WHATSAPP_MESSAGE_LENGTH);
    });
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming?.length) return;
    const merged = [...files, ...Array.from(incoming)];
    if (merged.length > MAX_OUTREACH_ATTACHMENTS) {
      setLocalError(`You can attach up to ${MAX_OUTREACH_ATTACHMENTS} files.`);
      return;
    }
    const tooBig = merged.find((f) => f.size > MAX_OUTREACH_ATTACHMENT_BYTES);
    if (tooBig) {
      setLocalError(`"${tooBig.name}" is larger than 25 MB.`);
      return;
    }
    setLocalError(null);
    setFiles(merged);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setLocalError(null);
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed && !files.length) return;

    if (!files.length) {
      await onSend(trimmed);
      return;
    }

    setUploading(true);
    setLocalError(null);
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth.user?.id;
      if (!userId) throw new Error("Session expired. Sign in again to attach files.");

      const uploaded = await uploadOutreachAttachments(supabase, userId, files);
      const finalMessage = appendAttachmentLinks(trimmed, uploaded);
      if (finalMessage.length > MAX_WHATSAPP_MESSAGE_LENGTH) {
        throw new Error(
          "Message plus attachment links exceed the WhatsApp limit. Shorten the message or send fewer files.",
        );
      }
      setFiles([]);
      await onSend(finalMessage);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not upload attachments.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-[#d4deea] bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-[#eef2f7] px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-[#0f172a]">WhatsApp outreach</h3>
            <p className="mt-1 text-sm font-medium text-[#334155]">{leadName}</p>
            <p className="text-xs text-[#64748b]">{phone}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1 hover:bg-[#f1f5f9]" aria-label="Close">
            <X className="h-5 w-5 text-[#64748b]" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#64748b]">Quick templates</p>
            <div className="flex flex-wrap gap-2">
              {templates.map((template) => (
                <button
                  key={template}
                  type="button"
                  disabled={busy}
                  onClick={() => appendTemplate(template)}
                  className="rounded-full border border-[#dbe6f3] bg-[#f8fbff] px-3 py-1.5 text-left text-xs text-[#334155] transition hover:border-[#93c5fd] hover:bg-[#eff6ff] disabled:opacity-50"
                >
                  {applyWhatsAppTemplate(template, leadName).slice(0, 72)}
                  {applyWhatsAppTemplate(template, leadName).length > 72 ? "…" : ""}
                </button>
              ))}
            </div>
          </div>

          <label className="grid gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Message</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_WHATSAPP_MESSAGE_LENGTH))}
              rows={6}
              placeholder="Type your WhatsApp message…"
              disabled={busy}
              className="w-full resize-y rounded-xl border border-[#cfdceb] px-3 py-2.5 text-sm text-[#334155] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
            />
            <span className="text-right text-xs text-[#94a3b8]">
              {message.length}/{MAX_WHATSAPP_MESSAGE_LENGTH}
            </span>
          </label>

          {allowAttachments ? (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Attachments</p>
                <span className="text-[11px] text-[#94a3b8]">
                  Up to {MAX_OUTREACH_ATTACHMENTS} files · 25 MB each
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                disabled={busy}
                onChange={(e) => addFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                className="h-9 w-full rounded-xl border-dashed border-[#cfdceb] text-xs font-medium text-[#334155]"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="mr-1.5 h-4 w-4" />
                Add files
              </Button>
              {files.length ? (
                <ul className="mt-2 space-y-1.5">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-[#e2e8f0] bg-[#f8fbff] px-2.5 py-1.5"
                    >
                      <span className="min-w-0 truncate text-xs text-[#334155]" title={file.name}>
                        {file.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[11px] text-[#94a3b8]">{formatBytes(file.size)}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeFile(index)}
                          className="rounded-full p-0.5 hover:bg-[#e2e8f0] disabled:opacity-50"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="h-3.5 w-3.5 text-[#64748b]" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {localError ? (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {localError}
            </p>
          ) : null}

          <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Message is saved to activity history when you open WhatsApp.
            {allowAttachments
              ? " WhatsApp cannot carry files in a link, so attachments are uploaded and added to the message as download links."
              : ""}
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#eef2f7] px-5 py-4">
          <Button type="button" variant="outline" className="rounded-full" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full bg-[#16a34a] hover:bg-[#15803d]"
            disabled={busy || (!message.trim() && !files.length)}
            onClick={() => void handleSend()}
          >
            {uploading ? "Uploading…" : submitting ? "Opening…" : "Open in WhatsApp"}
          </Button>
        </div>
      </div>
    </div>
  );
}
