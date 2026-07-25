"use client";

import { isPwaStandalone } from "@/lib/pwa/install-state";

export function isMobileUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
}

export function isIosUa(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOS = /iPhone|iPad|iPod/i.test(ua);
  const iPadOs = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return iOS || iPadOs;
}

/** iOS Safari only delivers web push when the app is installed to the Home Screen. */
export function iosNeedsHomeScreenForPush(): boolean {
  return isIosUa() && !isPwaStandalone();
}

export function pushRegisterFlagKey(): string {
  return "ajos_fcm_this_device_registered_v2";
}

export function markThisDevicePushRegistered(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(pushRegisterFlagKey(), "1");
    sessionStorage.setItem("ajos_fcm_token_present", "1");
  } catch {
    /* ignore */
  }
}

export function isThisDevicePushRegistered(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(pushRegisterFlagKey()) === "1";
  } catch {
    return false;
  }
}
