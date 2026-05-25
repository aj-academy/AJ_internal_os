import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import { PwaProvider } from "@/components/pwa/PwaProvider";
import { PWA_APP_NAME, PWA_ICON_VERSION, PWA_THEME_COLOR } from "@/lib/pwa/branding";
import { resolvePwaSiteOrigin } from "@/lib/pwa/site-url";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  weight: ["300", "400", "500", "600", "700"],
});

const siteUrl = resolvePwaSiteOrigin() ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "AJ Academy",
  description: "AJ Academy learning and operations platform",
  applicationName: PWA_APP_NAME,
  appleWebApp: {
    capable: true,
    title: PWA_APP_NAME,
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      {
        url: `/icons/icon-192x192.png?v=${PWA_ICON_VERSION}`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: `/icons/icon-512x512.png?v=${PWA_ICON_VERSION}`,
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: `/apple-touch-icon.png?v=${PWA_ICON_VERSION}`,
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: PWA_THEME_COLOR,
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} h-full antialiased`}
    >
      <body className="min-h-full min-w-0 flex flex-col overflow-x-hidden">
        <PwaProvider>{children}</PwaProvider>
      </body>
    </html>
  );
}
