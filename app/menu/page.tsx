import { getAllBowls } from "@/lib/sanity";
import MenuClient from "./MenuClient";

export const metadata = {
  title: "Menu — Nutravoe",
  description:
    "All five fresh protein yogurt bowls. No added sugar, probiotic base. Made daily in Bangalore.",
};

export default async function MenuPage() {
  const bowls = await getAllBowls();
  return <MenuClient bowls={bowls} />;
}
