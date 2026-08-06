/**
 * Same-window file downloads for PWA / installed app.
 * Never use window.open(..., "_blank") for same-origin API downloads —
 * that spawns a blank AJ Academy OS window on desktop PWAs.
 */

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf?.[1]) {
    try {
      return decodeURIComponent(utf[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header) || /filename=([^;]+)/i.exec(header);
  return plain?.[1]?.trim().replace(/^["']|["']$/g, "") || fallback;
}

export function downloadBlobInSameWindow(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename || "download";
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Delay revoke so the browser can start the download.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2_000);
}

/**
 * Fetch a URL (same-origin API or signed storage URL) and download it
 * without opening a new tab/window.
 */
export async function downloadUrlInSameWindow(
  url: string,
  fallbackFilename = "download",
  init?: RequestInit,
): Promise<void> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const json = (await res.json()) as { error?: string };
      detail = json.error || "";
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Download failed (${res.status}).`);
  }
  const blob = await res.blob();
  const name = filenameFromContentDisposition(res.headers.get("Content-Disposition"), fallbackFilename);
  downloadBlobInSameWindow(blob, name);
}

/** True if the URL is same-origin (or relative) and should never use target=_blank in the PWA. */
export function isSameOriginAppUrl(href: string): boolean {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  try {
    return new URL(href, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Open an external resource without spawning a second AJ OS PWA window.
 * Same-origin → navigate this window. External → system browser tab (not AJ OS).
 */
export function navigateWithoutAppPopup(href: string): void {
  if (!href) return;
  if (isSameOriginAppUrl(href)) {
    window.location.assign(href);
    return;
  }
  // External (WhatsApp, Maps, GitHub, etc.): use a temporary anchor without
  // opening a blank same-origin PWA window.
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Print HTML in a hidden iframe (no blank PWA window). */
export function printHtmlInSameWindow(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    throw new Error("Could not open print view.");
  }
  doc.open();
  doc.write(html);
  doc.close();
  win.focus();
  window.setTimeout(() => {
    try {
      win.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 1_000);
    }
  }, 300);
}
