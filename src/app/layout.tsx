import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BASE_PATH, SITE_URL } from "@/lib/config";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

const title = "TurNær – Find hiking trips near you";
const description = "Discover hiking trips, trails, weather and terrain near your location in Norway.";

export const metadata: Metadata = {
  metadataBase: SITE_URL ? new URL(`${SITE_URL}/`) : undefined,
  title: { default: title, template: "%s · TurNær" },
  description,
  applicationName: "TurNær",
  keywords: ["hiking", "tur", "fjelltur", "Norway", "Norge", "trails", "weather", "map", "turforslag"],
  manifest: `${BASE_PATH}/manifest.webmanifest`,
  icons: {
    icon: [
      { url: `${BASE_PATH}/icons/favicon.svg`, type: "image/svg+xml" },
      { url: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: `${BASE_PATH}/icons/apple-touch-icon.png`, sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "TurNær", statusBarStyle: "default" },
  openGraph: {
    type: "website",
    title,
    description,
    siteName: "TurNær",
    locale: "en_GB",
    images: [{ url: `${BASE_PATH}/icons/og-image.png`, width: 1200, height: 630, alt: "TurNær – hiking trips near you" }],
  },
  twitter: { card: "summary_large_image", title, description },
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#245033",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[2000] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:shadow-card"
        >
          Skip to content
        </a>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
