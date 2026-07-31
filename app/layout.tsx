import type { Metadata } from "next";
import "@/styles/globals.css";
import AppChrome from "@/components/AppChrome";
import { getSiteUrl } from "@/lib/site";

const siteUrl = getSiteUrl();
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Nutravoe - Fresh Yogurt Bowls Delivered in Bangalore",
  description:
    "Premium protein yogurt bowls made fresh daily in Bangalore. No added sugar, probiotic base, delivered 7 AM-7 PM.",
  keywords: [
    "protein yoghurt bowl Bangalore",
    "yogurt bowl delivery",
    "fresh oatmeal delivery",
    "nutravoe",
    "healthy food delivery Bangalore",
  ],
  authors: [{ name: "Nutravoe" }],
  verification: googleSiteVerification
    ? {
        google: googleSiteVerification,
      }
    : undefined,
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "Nutravoe - Fresh Yogurt Bowls Delivered in Bangalore",
    description:
      "Premium protein yogurt bowls made fresh daily in Bangalore. No added sugar, probiotic base, delivered 7 AM-7 PM.",
    url: siteUrl,
    siteName: "Nutravoe",
    locale: "en_IN",
    type: "website",
    images: [
      {
        url: "/hero-image.png",
        width: 1200,
        height: 630,
        alt: "Nutravoe yogurt bowl",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Nutravoe - Fresh Yogurt Bowls Delivered in Bangalore",
    description:
      "Premium protein yogurt bowls made fresh daily in Bangalore. No added sugar, probiotic base, delivered 7 AM-7 PM.",
    images: ["/hero-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon-32px.png" type="image/png" sizes="32x32" />
        <link rel="apple-touch-icon" href="/icon-128px.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className="min-h-screen flex flex-col">
        <AppChrome gaId={gaId}>{children}</AppChrome>
      </body>
    </html>
  );
}
