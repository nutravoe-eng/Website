import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";
import "@/styles/globals.css";
import { CartProvider } from "@/components/CartContext";
// import IntroAnimation from "@/components/IntroAnimation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";

export const metadata: Metadata = {
  title: "Nutravoe — Fresh Yogurt Bowls, Delivered to Your Door",
  description:
    "Premium protein yogurt bowls made fresh daily in Bangalore. No added sugar, probiotic base, delivered 7 AM–8 PM. Order via WhatsApp.",
  keywords: [
    "protein yoghurt bowl Bangalore",
    "yogurt bowl delivery",
    "fresh oatmeal delivery",
    "nutravoe",
    "healthy food delivery Bangalore",
  ],
  authors: [{ name: "Nutravoe" }],
  openGraph: {
    title: "Nutravoe — Fresh Yogurt Bowls, Delivered",
    description:
      "Premium protein yogurt bowls made fresh daily. Delivered 7 AM–8 PM in Bangalore.",
    url: "https://nutravoe.in",
    siteName: "Nutravoe",
    locale: "en_IN",
    type: "website",
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
        {/* Intro animation setup script — disabled, kept for future use
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            if (!sessionStorage.getItem('nv-intro-shown')) {
              document.documentElement.setAttribute('data-intro', '1');
            }
          } catch(e) {}
        `}} />
        */}
      </head>
      <body className="min-h-screen flex flex-col">
        <CartProvider>
          {/* <IntroAnimation /> */}
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:bg-sage focus:text-white focus:px-4 focus:py-2 focus:rounded-sm focus:text-sm focus:font-medium"
          >
            Skip to main content
          </a>
          <Navbar />
          <main className="flex-1 pt-16">{children}</main>
          <Footer />
          {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
          <WhatsAppButton />
        </CartProvider>
      </body>
    </html>
  );
}
