import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// If you rename the Vercel project/domain, update this URL so the link
// preview and OG image resolve correctly.
const SITE_URL = "https://partner-pulse-kappa.vercel.app";

const DESCRIPTION =
  "Weekly partnership signal briefings, synthesized from public news and scored the way a partnership opportunity gets scored.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Partner Pulse",
  description: DESCRIPTION,
  openGraph: {
    title: "Partner Pulse",
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: "Partner Pulse",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Partner Pulse",
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
