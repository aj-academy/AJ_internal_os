"use client";

import { Mail, MessageCircle, Phone } from "lucide-react";
import { whatsAppHref } from "@/components/employee/leads/employeeLeadConfig";

type StudentOutreachButtonsProps = {
  mode: "phone" | "whatsapp" | "email" | "both";
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  phoneCalled?: boolean | null;
  whatsappSent?: boolean | null;
  emailSent?: boolean | null;
  onPhoneClick?: () => void;
  onWhatsAppClick?: () => void;
  onEmailClick?: () => void;
};

export function StudentOutreachButtons({
  mode,
  phone,
  whatsapp,
  email,
  phoneCalled,
  whatsappSent,
  emailSent,
  onPhoneClick,
  onWhatsAppClick,
  onEmailClick,
}: StudentOutreachButtonsProps) {
  const canPhone = Boolean(phone?.trim());
  const waTarget = whatsapp || phone;
  const canWa = Boolean(whatsAppHref(waTarget));
  const canEmail = Boolean(email?.trim());

  if (mode === "phone") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Click to call"
          disabled={!canPhone || !onPhoneClick}
          onClick={onPhoneClick}
          className={[
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition",
            phoneCalled
              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
              : "border-rose-200 bg-rose-50 text-rose-600",
            !canPhone || !onPhoneClick ? "cursor-not-allowed opacity-40" : "hover:scale-105",
          ].join(" ")}
        >
          <Phone className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs text-[#334155]">{phone || "—"}</span>
      </div>
    );
  }

  if (mode === "whatsapp") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Click to WhatsApp"
          disabled={!canWa || !onWhatsAppClick}
          onClick={onWhatsAppClick}
          className={[
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition",
            whatsappSent
              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
              : "border-rose-200 bg-rose-50 text-rose-600",
            !canWa || !onWhatsAppClick ? "cursor-not-allowed opacity-40" : "hover:scale-105",
          ].join(" ")}
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs text-[#334155]">{whatsapp || phone || "—"}</span>
      </div>
    );
  }

  if (mode === "email") {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Click to email"
          disabled={!canEmail || !onEmailClick}
          onClick={onEmailClick}
          className={[
            "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition",
            emailSent
              ? "border-emerald-200 bg-emerald-50 text-emerald-600"
              : "border-rose-200 bg-rose-50 text-rose-600",
            !canEmail || !onEmailClick ? "cursor-not-allowed opacity-40" : "hover:scale-105",
          ].join(" ")}
        >
          <Mail className="h-3.5 w-3.5" />
        </button>
        <span className="max-w-[180px] truncate text-xs text-[#334155]">{email || "—"}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        title="Click to call"
        disabled={!canPhone || !onPhoneClick}
        onClick={onPhoneClick}
        className={[
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition",
          phoneCalled
            ? "border-emerald-200 bg-emerald-50 text-emerald-600"
            : "border-rose-200 bg-rose-50 text-rose-600",
          !canPhone || !onPhoneClick ? "cursor-not-allowed opacity-40" : "hover:scale-105",
        ].join(" ")}
      >
        <Phone className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Click to WhatsApp"
        disabled={!canWa || !onWhatsAppClick}
        onClick={onWhatsAppClick}
        className={[
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition",
          whatsappSent
            ? "border-emerald-200 bg-emerald-50 text-emerald-600"
            : "border-rose-200 bg-rose-50 text-rose-600",
          !canWa || !onWhatsAppClick ? "cursor-not-allowed opacity-40" : "hover:scale-105",
        ].join(" ")}
      >
        <MessageCircle className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
