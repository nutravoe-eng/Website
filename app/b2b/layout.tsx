import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { buildPageMetadata, getB2BServiceSchema } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "B2B Catering - Nutravoe",
  description:
    "Bulk and recurring Nutravoe bowl deliveries for offices, gyms, hotels, and teams across Bangalore.",
  path: "/b2b",
});

export default function B2BLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <JsonLd data={getB2BServiceSchema()} />
      {children}
    </>
  );
}
