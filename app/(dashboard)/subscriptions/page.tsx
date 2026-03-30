import { getAllBowls } from "@/lib/sanity";
import SubscriptionsClient from "./SubscriptionsClient";

export default async function SubscriptionsPage() {
  const bowls = await getAllBowls();
  return <SubscriptionsClient bowls={bowls} />;
}
