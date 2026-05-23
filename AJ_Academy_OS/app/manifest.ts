import type { MetadataRoute } from "next";
import { pwaAbsoluteUrl, resolvePwaSiteOrigin } from "@/lib/pwa/site-url";

const PWA_APP_PATH = "/?app=aj-academy";

export default function manifest(): MetadataRoute.Manifest {
  const origin = resolvePwaSiteOrigin();
  const appId = pwaAbsoluteUrl(origin, PWA_APP_PATH);
  const startUrl = pwaAbsoluteUrl(origin, "/login");

  return {
    id: appId,
    name: "AJ Academy",
    short_name: "AJ Academy",
    description: "AJ Academy learning and operations platform",
    start_url: startUrl,
    scope: pwaAbsoluteUrl(origin, "/"),
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#c9a227",
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
