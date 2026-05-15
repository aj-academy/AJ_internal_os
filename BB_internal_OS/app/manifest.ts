import type { MetadataRoute } from "next";
import { pwaAbsoluteUrl, resolvePwaSiteOrigin } from "@/lib/pwa/site-url";

const PWA_APP_PATH = "/?app=bb-internal-os";

export default function manifest(): MetadataRoute.Manifest {
  const origin = resolvePwaSiteOrigin();
  const appId = pwaAbsoluteUrl(origin, PWA_APP_PATH);
  const startUrl = pwaAbsoluteUrl(origin, "/install");

  return {
    id: appId,
    name: "BB Internal OS",
    short_name: "BB OS",
    description: "Internal CRM and operations dashboard",
    start_url: startUrl,
    scope: pwaAbsoluteUrl(origin, "/"),
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#1e4f91",
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
