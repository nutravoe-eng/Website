import type { ReactNode } from "react";
import Script from "next/script";
import { CartProvider } from "@/components/CartContext";
import Navbar from "@/components/Navbar";
import JsonLd from "@/components/JsonLd";
import MobileShell from "@/components/MobileShell";
import { getOrganizationSchema } from "@/lib/seo";

export default function AppChrome({
  children,
  gaId,
}: {
  children: ReactNode;
  gaId?: string;
}) {
  return (
    <CartProvider>
      <JsonLd data={getOrganizationSchema()} />
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:bg-sage focus:text-white focus:px-4 focus:py-2 focus:rounded-sm focus:text-sm focus:font-medium"
      >
        Skip to main content
      </a>
      <Navbar />
      <MobileShell>{children}</MobileShell>
      {gaId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${gaId}');
            `}
          </Script>
        </>
      ) : null}
    </CartProvider>
  );
}
