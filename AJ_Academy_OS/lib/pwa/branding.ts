/** PWA install name shown in browser prompt, manifest, and install UI. */
export const PWA_APP_NAME = "AJ Academy OS";

export const PWA_THEME_COLOR = "#c9a227";
export const PWA_THEME_HOVER = "#b8921f";

/**
 * Bump when home-screen / manifest icons change — busts CDN/browser caches and
 * must change together with {@link PWA_MANIFEST_APP_ID} so Android treats reinstall as new.
 */
export const PWA_ICON_VERSION = "2";

/** Manifest `id` — changing this forces a new WebAPK instead of reusing the old blue icon. */
export const PWA_MANIFEST_APP_ID = "/?app=aj-academy-os-v2";
