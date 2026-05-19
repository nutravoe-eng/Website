import type { Metadata } from "next";
import JsonLd from "@/components/JsonLd";
import { getAllBowls } from "@/lib/sanity";
import { buildPageMetadata, getMenuSchema } from "@/lib/seo";
import MenuClient from "./MenuClient";

export const metadata: Metadata = buildPageMetadata({
  title: "Menu - Nutravoe",
  description:
    "Browse Nutravoe's fresh protein yogurt bowls in Bangalore. No added sugar, probiotic base, made daily and delivered fresh.",
  path: "/menu",
});

export default async function MenuPage({
  searchParams,
}: {
  searchParams?: { tier?: string };
}) {
  const bowls = await getAllBowls();
  const initialTier =
    searchParams?.tier === "standard" || searchParams?.tier === "premium"
      ? searchParams.tier
      : "all";

  return (
    <>
      <JsonLd data={getMenuSchema(bowls)} />
      <MenuClient bowls={bowls} initialTier={initialTier} />
    </>
  );
}
