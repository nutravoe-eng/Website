import Image from "next/image";
import { getAllBowls, getSubscriptionPlans } from "@/lib/sanity";
import SubscribeWizard from "./SubscribeWizard";

export default async function SubscribePage() {
  const [bowls, plans] = await Promise.all([getAllBowls(), getSubscriptionPlans()]);
  return (
    <main className="min-h-[calc(100vh-64px)] bg-[#F9F8F6]">

      {/* Hero banner */}
      <div className="relative w-full h-[280px] md:h-[400px] overflow-hidden">
        <Image
          src="/subscribe-hero.jpeg"
          alt="Nutravoe subscription bowls"
          fill
          priority
          className="object-cover object-center"
          sizes="100vw"
        />
        {/* Gradient overlay — stronger on left for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-r from-ink/70 via-ink/30 to-transparent" />
        {/* Gradient fade to page background at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#F9F8F6] to-transparent" />

        {/* Text overlay */}
        <div className="absolute inset-0 flex flex-col justify-center px-8 md:px-16 max-w-2xl">
          <span className="font-body text-[11px] font-bold tracking-[0.15em] uppercase text-white/70 mb-3">
            Your Daily Ritual
          </span>
          <h1 className="font-display text-4xl md:text-5xl font-medium text-white leading-tight mb-3">
            A proper meal, every day.<br />Set once, enjoy always.
          </h1>
          <p className="font-body text-[14px] md:text-[15px] text-white/80 leading-relaxed max-w-sm">
            Subscribe and get fresh probiotic yoghurt bowls delivered on a schedule that works for you. No thinking, no planning — just good food at your doorstep.
          </p>
        </div>
      </div>

      {/* Wizard */}
      <div className="pt-8 pb-16 px-6">
        <SubscribeWizard bowls={bowls} plans={plans} />
      </div>
    </main>
  );
}
