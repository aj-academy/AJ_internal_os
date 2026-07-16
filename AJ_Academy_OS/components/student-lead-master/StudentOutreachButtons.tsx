"use client";

import type { ReactNode } from "react";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { whatsAppHref } from "@/components/employee/leads/employeeLeadConfig";

type StudentOutreachButtonsProps = {
  mode: "phone" | "whatsapp" | "email" | "both" | "all";
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

function outreachClass(done: boolean, enabled: boolean) {
  return [
    "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition",
    done ? "border-emerald-200 bg-emerald-50 text-emerald-600" : "border-rose-200 bg-rose-50 text-rose-600",
    enabled ? "hover:scale-105" : "cursor-not-allowed opacity-40 pointer-events-none",
  ].join(" ");
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="flex justify-center">{children}</div>;
}

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
  const emailValue = email?.trim() ?? "";
  const canEmail = Boolean(emailValue);
  const iconClass = "h-4 w-4";

  if (mode === "phone") {
    const enabled = canPhone && Boolean(onPhoneClick);
    return (
      <Centered>
        <button
          type="button"
          title={canPhone ? `Call ${phone}` : "No mobile number"}
          disabled={!enabled}
          onClick={onPhoneClick}
          className={outreachClass(Boolean(phoneCalled), enabled)}
        >
          <Phone className={iconClass} />
        </button>
      </Centered>
    );
  }

  if (mode === "whatsapp") {
    const enabled = canWa && Boolean(onWhatsAppClick);
    return (
      <Centered>
        <button
          type="button"
          title={canWa ? `WhatsApp ${whatsapp || phone}` : "No WhatsApp number"}
          disabled={!enabled}
          onClick={onWhatsAppClick}
          className={outreachClass(Boolean(whatsappSent), enabled)}
        >
          <MessageCircle className={iconClass} />
        </button>
      </Centered>
    );
  }

  if (mode === "email") {
    const enabled = canEmail && Boolean(onEmailClick);
    if (enabled) {
      return (
        <Centered>
          <button type="button" title={`Email ${emailValue}`} onClick={onEmailClick} className={outreachClass(Boolean(emailSent), true)}>
            <Mail className={iconClass} />
          </button>
        </Centered>
      );
    }

    return (
      <Centered>
        <span
          role="button"
          aria-disabled
          title="No email address"
          className={outreachClass(Boolean(emailSent), false)}
        >
          <Mail className={iconClass} />
        </span>
      </Centered>
    );
  }

  if (mode === "both") {
    return (
      <Centered>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            title={canPhone ? `Call ${phone}` : "No mobile number"}
            disabled={!canPhone || !onPhoneClick}
            onClick={onPhoneClick}
            className={outreachClass(Boolean(phoneCalled), canPhone && Boolean(onPhoneClick))}
          >
            <Phone className={iconClass} />
          </button>
          <button
            type="button"
            title={canWa ? `WhatsApp ${whatsapp || phone}` : "No WhatsApp number"}
            disabled={!canWa || !onWhatsAppClick}
            onClick={onWhatsAppClick}
            className={outreachClass(Boolean(whatsappSent), canWa && Boolean(onWhatsAppClick))}
          >
            <MessageCircle className={iconClass} />
          </button>
        </div>
      </Centered>
    );
  }

  const phoneEnabled = canPhone && Boolean(onPhoneClick);
  const waEnabled = canWa && Boolean(onWhatsAppClick);
  const emailEnabled = canEmail && Boolean(onEmailClick);

  return (
    <div className="flex flex-wrap items-center justify-center gap-3">
      <button
        type="button"
        title={canPhone ? `Call ${phone}` : "No mobile number"}
        disabled={!phoneEnabled}
        onClick={onPhoneClick}
        className={outreachClass(Boolean(phoneCalled), phoneEnabled)}
        aria-label="Call"
      >
        <Phone className={iconClass} />
      </button>
      <button
        type="button"
        title={canWa ? `WhatsApp ${whatsapp || phone}` : "No WhatsApp number"}
        disabled={!waEnabled}
        onClick={onWhatsAppClick}
        className={outreachClass(Boolean(whatsappSent), waEnabled)}
        aria-label="WhatsApp"
      >
        <MessageCircle className={iconClass} />
      </button>
      {emailEnabled ? (
        <button
          type="button"
          title={`Email ${emailValue}`}
          onClick={onEmailClick}
          className={outreachClass(Boolean(emailSent), true)}
          aria-label="Email"
        >
          <Mail className={iconClass} />
        </button>
      ) : (
        <span
          role="button"
          aria-disabled
          title="No email address"
          className={outreachClass(Boolean(emailSent), false)}
          aria-label="Email"
        >
          <Mail className={iconClass} />
        </span>
      )}
    </div>
  );
}
