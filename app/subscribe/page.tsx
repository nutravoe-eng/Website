import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { getAllBowls, getSubscriptionPlans } from "@/lib/sanity";
import { buildPageMetadata } from "@/lib/seo";
import SubscribeWizard from "./SubscribeWizard";

export const metadata: Metadata = buildPageMetadata({
  title: "Subscribe - Nutravoe",
  description:
    "Set up a Nutravoe subscription for fresh probiotic yogurt bowls delivered on your schedule in Bangalore.",
  path: "/subscribe",
});

export default async function SubscribePage() {
  const [bowls, plans] = await Promise.all([getAllBowls(), getSubscriptionPlans()]);
  return (
    <section className="min-h-[calc(100vh-64px)] bg-[#F9F8F6]">

      {/* Hero banner */}
      <div className="relative w-full h-[180px] md:h-[400px] overflow-hidden">
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
        <div className="absolute inset-0 flex max-w-2xl flex-col justify-center px-5 md:px-16">
          <span className="mb-2 font-body text-[10px] font-bold tracking-[0.15em] uppercase text-white/70">
            Your Daily Ritual
          </span>
          <h1 className="mb-2 font-display text-[30px] font-medium leading-tight text-white md:text-5xl">
            A proper meal, every day.<br />Set once, enjoy always.
          </h1>
          <p className="hidden md:block font-body text-[14px] md:text-[15px] text-white/80 leading-relaxed max-w-sm">
            Subscribe and get fresh probiotic yoghurt bowls delivered on a schedule that works for you. No thinking, no planning — just good food at your doorstep.
          </p>
        </div>
      </div>

      {/* Wizard */}
      <div className="px-4 pt-6 pb-12 md:px-6 md:pt-8 md:pb-16">
        <Suspense>
          <SubscribeWizard bowls={bowls} plans={plans} />
        </Suspense>
      </div>
    </section>
  );
}
