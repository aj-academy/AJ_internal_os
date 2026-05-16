/** User finished install flow or uses the installed app — do not show install UI again. */
export const PWA_INSTALL_COMPLETE_KEY = "bb-os-pwa-install-complete";

export const PWA_INSTALL_DISMISS_KEY = "bb-os-pwa-install-dismissed";

export const PWA_MOBILE_HELP_DISMISS_KEY = "bb-os-mobile-install-help-dismissed";

export const PWA_INSTALLED_PENDING_ICON_KEY = "bb-os-pwa-installed-pending-icon";

export function isPwaStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: fullscreen)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function hasCompletedPwaInstall(): boolean {
  if (typeof window === "undefined") return false;
  if (isPwaStandalone()) return true;
  return window.localStorage.getItem(PWA_INSTALL_COMPLETE_KEY) === "1";
}

export function markPwaInstallComplete(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PWA_INSTALL_COMPLETE_KEY, "1");
  window.localStorage.setItem(PWA_INSTALL_DISMISS_KEY, "1");
  window.localStorage.setItem(PWA_MOBILE_HELP_DISMISS_KEY, "1");
  window.localStorage.removeItem(PWA_INSTALLED_PENDING_ICON_KEY);
}
