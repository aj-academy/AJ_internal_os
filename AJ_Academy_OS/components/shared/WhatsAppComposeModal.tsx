"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { applyWhatsAppTemplate, MAX_WHATSAPP_MESSAGE_LENGTH } from "@/lib/whatsappOutreach";

type WhatsAppComposeModalProps = {
  open: boolean;
  leadName: string;
  phone: string;
  templates: string[];
  submitting?: boolean;
  onClose: () => void;
  onSend: (message: string) => void | Promise<void>;
};

export function WhatsAppComposeModal({
  open,
  leadName,
  phone,
  templates,
  submitting = false,
  onClose,
  onSend,
}: WhatsAppComposeModalProps) {
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open) setMessage("");
  }, [open, leadName, phone]);

  if (!open) return null;

  const appendTemplate = (template: string) => {
    const text = applyWhatsAppTemplate(template, leadName);
    setMessage((prev) => {
      const next = prev.trim() ? `${prev.trim()}\n\n${text}` : text;
      return next.slice(0, MAX_WHATSAPP_MESSAGE_LENGTH);
    });
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
                  disabled={submitting}
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
              disabled={submitting}
              className="w-full resize-y rounded-xl border border-[#cfdceb] px-3 py-2.5 text-sm text-[#334155] outline-none focus:border-[#2563eb] focus:ring-2 focus:ring-[#2563eb]/20"
            />
            <span className="text-right text-xs text-[#94a3b8]">
              {message.length}/{MAX_WHATSAPP_MESSAGE_LENGTH}
            </span>
          </label>

          <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            Message is saved to activity history when you open WhatsApp.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#eef2f7] px-5 py-4">
          <Button type="button" variant="outline" className="rounded-full" disabled={submitting} onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-full bg-[#16a34a] hover:bg-[#15803d]"
            disabled={submitting || !message.trim()}
            onClick={() => void onSend(message.trim())}
          >
            {submitting ? "Opening…" : "Open in WhatsApp"}
          </Button>
        </div>
      </div>
    </div>
  );
}
