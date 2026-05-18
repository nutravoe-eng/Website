import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";
import "@/styles/globals.css";
import { CartProvider } from "@/components/CartContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import JsonLd from "@/components/JsonLd";
import { getOrganizationSchema } from "@/lib/seo";
import { getSiteUrl } from "@/lib/site";

const siteUrl = getSiteUrl();
const googleSiteVerification = process.env.GOOGLE_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Nutravoe - Fresh Yogurt Bowls Delivered in Bangalore",
  description:
    "Premium protein yogurt bowls made fresh daily in Bangalore. No added sugar, probiotic base, delivered 7 AM-3 PM. Order via WhatsApp.",
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
      "Premium protein yogurt bowls made fresh daily in Bangalore. No added sugar, probiotic base, delivered 7 AM-3 PM.",
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
      "Premium protein yogurt bowls made fresh daily in Bangalore. No added sugar, probiotic base, delivered 7 AM-3 PM.",
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
      </head>
      <body className="min-h-screen flex flex-col">
        <JsonLd data={getOrganizationSchema()} />
        <CartProvider>
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:bg-sage focus:text-white focus:px-4 focus:py-2 focus:rounded-sm focus:text-sm focus:font-medium"
          >
            Skip to main content
          </a>
          <Navbar />
          <main id="main" className="flex-1 pt-16">
            {children}
          </main>
          <Footer />
          {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
          <WhatsAppButton />
        </CartProvider>
      </body>
    </html>
  );
}
