import { getAllBowls, getGlobalSettings, getSubscriptionPlans } from "@/lib/sanity";
import SubscribeWizard from "./SubscribeWizard";

export default async function SubscribePage() {
  const [bowls, settings, plans] = await Promise.all([getAllBowls(), getGlobalSettings(), getSubscriptionPlans()]);
  return (
    <main className="min-h-[calc(100vh-64px)] pt-24 pb-16 px-6 bg-[#F9F8F6]">
      <SubscribeWizard bowls={bowls} whatsappNumber={settings.whatsappNumber} plans={plans} />
    </main>
  );
}
