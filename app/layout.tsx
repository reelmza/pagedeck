import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { SITE_URL } from "@/lib/site";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const TITLE = "PageDeck - Organize and edit PDFs in your browser";
const DESCRIPTION =
  "Reorder, edit and organize PDF pages right in your browser. " +
  "Your files never leave your device.";

export const metadata: Metadata = {
  // Base URL so file-based OG/Twitter images resolve to absolute URLs in prod.
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s | PageDeck", // sub-pages: "PDF Organizer | PageDeck"
  },
  description: DESCRIPTION,
  // Google Search Console ownership proof (public by design).
  verification: { google: "CTnBQe-klOMrIdJdEfLj3cCCJdW5mE0XQCUbgLX6ofw" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "PageDeck",
    type: "website",
    // opengraph-image.png in app/ is picked up automatically —
    // no need to list images here.
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    // Falls back to the opengraph-image automatically.
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
