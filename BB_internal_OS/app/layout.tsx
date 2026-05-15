import type { Metadata, Viewport } from "next";
import { Space_Grotesk } from "next/font/google";
import { PwaProvider } from "@/components/pwa/PwaProvider";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  preload: true,
  weight: ["300", "400", "500", "600", "700"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "BB Internal OS",
  description: "Internal CRM and operations dashboard",
  applicationName: "BB Internal OS",
  appleWebApp: {
    capable: true,
    title: "BB Internal OS",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1e4f91",
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
