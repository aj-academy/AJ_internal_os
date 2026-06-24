import Image from "next/image";
import { PWA_ICON_VERSION } from "@/lib/pwa/branding";
import { cn } from "@/lib/utils";

type AppLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

/** AJ Academy mark — used in sidebar, topbar, login, and dashboard (not BB / legacy PWA assets). */
export function AppLogo({ size = 36, className = "", priority = false }: AppLogoProps) {
  return (
    <Image
      src={`/icons/icon-192x192.png?v=${PWA_ICON_VERSION}`}
      alt="AJ Academy"
      width={size}
      height={size}
      priority={priority}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
