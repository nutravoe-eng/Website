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

export default async function MenuPage() {
  const bowls = await getAllBowls();

  return (
    <>
      <JsonLd data={getMenuSchema(bowls)} />
      <MenuClient bowls={bowls} />
    </>
  );
}
