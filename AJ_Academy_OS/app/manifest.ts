import type { MetadataRoute } from "next";
import { PWA_APP_NAME, PWA_THEME_COLOR } from "@/lib/pwa/branding";
import { pwaAbsoluteUrl, resolvePwaSiteOrigin } from "@/lib/pwa/site-url";

const PWA_APP_PATH = "/?app=aj-academy";

export default function manifest(): MetadataRoute.Manifest {
  const origin = resolvePwaSiteOrigin();
  const appId = pwaAbsoluteUrl(origin, PWA_APP_PATH);
  const startUrl = pwaAbsoluteUrl(origin, "/login");

  return {
    id: appId,
    name: PWA_APP_NAME,
    short_name: PWA_APP_NAME,
    description: "AJ Academy learning and operations platform",
    start_url: startUrl,
    scope: pwaAbsoluteUrl(origin, "/"),
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: PWA_THEME_COLOR,
    categories: ["business", "productivity"],
    icons: [
      {
        src: pwaAbsoluteUrl(origin, "/icons/icon-192x192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: pwaAbsoluteUrl(origin, "/icons/icon-512x512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: pwaAbsoluteUrl(origin, "/icons/maskable-icon-512x512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
