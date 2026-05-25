import type { MetadataRoute } from "next";
import {
  PWA_APP_NAME,
  PWA_ICON_VERSION,
  PWA_MANIFEST_APP_ID,
  PWA_THEME_COLOR,
} from "@/lib/pwa/branding";
import { pwaAbsoluteUrl, pwaAssetUrl, resolvePwaSiteOrigin } from "@/lib/pwa/site-url";

export default function manifest(): MetadataRoute.Manifest {
  const origin = resolvePwaSiteOrigin();
  const appId = pwaAbsoluteUrl(origin, PWA_MANIFEST_APP_ID);
  const startUrl = pwaAbsoluteUrl(origin, "/login");
  const icon = (path: string) => pwaAssetUrl(origin, path, PWA_ICON_VERSION);

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
        src: icon("/icons/icon-192x192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icon("/icons/icon-512x512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: icon("/icons/maskable-icon-512x512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
