import { getAllBowls } from "@/lib/sanity";
import SubscribeWizard from "./SubscribeWizard";

export default async function SubscribePage() {
  const bowls = await getAllBowls();
  return (
    <main className="min-h-[calc(100vh-64px)] pt-24 pb-16 px-6 bg-[#F9F8F6]">
      <SubscribeWizard bowls={bowls} />
    </main>
  );
}
