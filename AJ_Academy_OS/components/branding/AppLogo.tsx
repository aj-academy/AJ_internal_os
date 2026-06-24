import Image from "next/image";
import { cn } from "@/lib/utils";

/** From `public/icons/` — generated via `npm run generate-pwa-icons`. */
export const APP_LOGO_SRC = "/icons/icon-192x192.png";

type AppLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

/** AJ Academy mark — sidebar, topbar, login, and dashboard. */
export function AppLogo({ size = 36, className = "", priority = false }: AppLogoProps) {
  return (
    <Image
      src={APP_LOGO_SRC}
      alt="AJ Academy"
      width={size}
      height={size}
      priority={priority}
      unoptimized
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
