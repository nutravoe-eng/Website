"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Bowl } from "@/types";
import BowlCard from "@/components/BowlCard";
import MobileBowlCard from "@/components/MobileBowlCard";
import { getWhatsAppHref } from "@/lib/contact";

const NUTRITION_SNAPSHOT_ROWS = [
  { name: "Tropical Mango", calories: "510 kcal", protein: "20 g", carbs: "58 g", fibre: "11 g", healthyFats: "18 g" },
  { name: "Very Fruity", calories: "480 kcal", protein: "19 g", carbs: "56 g", fibre: "12 g", healthyFats: "16 g" },
  { name: "Very Berry", calories: "470 kcal", protein: "20 g", carbs: "58 g", fibre: "11 g", healthyFats: "20 g" },
  { name: "Banana Peanut Butter", calories: "530 kcal", protein: "23 g", carbs: "62 g", fibre: "13 g", healthyFats: "26 g" },
  { name: "Very Nutty", calories: "550 kcal", protein: "21 g", carbs: "67 g", fibre: "14 g", healthyFats: "30 g" },
] as const;

export default function MenuClient({ bowls }: { bowls: Bowl[] }) {
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const allCategories = useMemo(() => {
    const seen = new Map<string, { title: string; slug: string; displayOrder: number }>();
    for (const bowl of bowls) {
      if (!bowl.category) continue;
      const { slug, title, displayOrder } = bowl.category;
      if (!seen.has(slug)) {
        seen.set(slug, { title, slug, displayOrder: displayOrder ?? Number.MAX_SAFE_INTEGER });
      }
    }
    return Array.from(seen.values()).sort((a, b) => a.displayOrder - b.displayOrder);
  }, [bowls]);

  const filtered = useMemo(() => {
    if (activeCategory === "all") return bowls;
    return bowls.filter((bowl) => bowl.category?.slug === activeCategory);
  }, [activeCategory, bowls]);

  const groupedByCategory = useMemo(() => {
    const groups = new Map<string, { title: string; slug: string; displayOrder: number; bowls: Bowl[] }>();
    const UNCATEGORIZED_KEY = "__uncategorized";

    for (const bowl of filtered) {
      const key = bowl.category?.slug ?? UNCATEGORIZED_KEY;
      const title = bowl.category?.title ?? "More Bowls";
      const slug = bowl.category?.slug ?? UNCATEGORIZED_KEY;
      const displayOrder = bowl.category?.displayOrder ?? Number.MAX_SAFE_INTEGER;
      if (!groups.has(key)) {
        groups.set(key, { title, slug, displayOrder, bowls: [] });
      }
      groups.get(key)!.bowls.push(bowl);
    }

    return Array.from(groups.values()).sort((a, b) => a.displayOrder - b.displayOrder);
  }, [filtered]);

  return (
    <>
      <section className="border-b border-ink/8 px-5 pb-5 pt-24 md:px-6 md:pb-12 md:pt-28 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <p className="section-eyebrow mb-4">The Menu</p>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="section-heading" style={{ fontSize: "clamp(26px, 4.5vw, 72px)" }}>
                Bowls for every
                <br />
                <em className="text-sage">kind of craving.</em>
              </h1>
              <p className="mt-2 max-w-md font-body text-[11px] leading-relaxed text-stone md:hidden">
                Pick a category below to jump straight to what you&apos;re craving.
              </p>
            </div>
            <p className="hidden max-w-xs font-body text-sm leading-relaxed text-stone md:block">
              Made fresh daily. No added sugar. Yogurt or milk base. Delivered cold and best enjoyed within 24 hours.
            </p>
          </div>
        </div>
      </section>

      <section className="sticky top-16 z-40 border-b border-ink/8 bg-cream/95 px-5 py-3.5 backdrop-blur-sm md:px-6 lg:px-16">
        <div className="mx-auto flex max-w-7xl gap-2.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setActiveCategory("all")}
            className={`shrink-0 rounded-full border-2 px-5 py-2.5 font-body text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
              activeCategory === "all"
                ? "border-ink bg-ink text-white"
                : "border-black/12 bg-white text-ink hover:border-ink/40"
            }`}
          >
            All
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              onClick={() => setActiveCategory(cat.slug)}
              className={`shrink-0 rounded-full border-2 px-5 py-2.5 font-body text-[11px] font-bold uppercase tracking-[0.14em] transition-colors ${
                activeCategory === cat.slug
                  ? "border-sage bg-sage text-white"
                  : "border-sage/30 bg-sage/8 text-sage-dark hover:border-sage hover:bg-sage/15"
              }`}
            >
              {cat.title}
            </button>
          ))}
        </div>
      </section>

      <section className="px-5 py-6 md:px-6 md:py-14 lg:px-16">
        <div className="mx-auto max-w-7xl">
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-black/6 bg-[#F9F8F6] px-6 py-16 text-center">
              <p className="font-display text-2xl italic text-stone">No bowls in this category yet.</p>
              <p className="mt-2 font-body text-[13px] text-stone">
                Try another category or browse all bowls.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-10 md:gap-14">
              {groupedByCategory.map((group) => (
                <div key={group.title} id={`category-${group.slug}`} className="scroll-mt-32">
                  <h2 className="mb-4 font-display text-[22px] italic text-ink md:mb-6 md:text-[32px]">
                    {group.title}
                  </h2>

                  <div className="md:hidden">
                    {group.bowls.map((bowl) => (
                      <MobileBowlCard key={bowl._id} bowl={bowl} />
                    ))}
                  </div>

                  <div className="hidden grid-cols-1 gap-6 md:grid md:grid-cols-2 lg:grid-cols-3">
                    {group.bowls.map((bowl) => (
                      <BowlCard key={bowl._id} bowl={bowl} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="bg-ink px-5 py-12 md:px-6 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <p className="section-eyebrow mb-4 text-center text-sage">What&apos;s Inside</p>
          <h2 className="text-center font-display text-white" style={{ fontSize: "clamp(26px, 4vw, 48px)" }}>
            Nutrition snapshot
          </h2>
          <p className="mx-auto mt-2 max-w-md text-center font-body text-[12px] leading-relaxed text-stone">
            Every bowl is made fresh, using real ingredients. Here&apos;s our estimated nutrition for each bowl.
          </p>

          <div className="mt-8 grid gap-3 md:hidden">
            {NUTRITION_SNAPSHOT_ROWS.map((row) => {
              return (
                <div key={row.name} className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-display text-[18px] leading-tight text-white">{row.name}</p>
                    <span className="rounded-full bg-white/8 px-2 py-1 font-body text-[10px] font-bold uppercase tracking-[0.16em] text-stone">
                      {row.calories}
                    </span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white/[0.05] px-3 py-3">
                      <p className="font-body text-[10px] uppercase tracking-[0.14em] text-stone">Calories</p>
                      <p className="mt-1 font-body text-[15px] font-bold text-white">{row.calories}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.05] px-3 py-3">
                      <p className="font-body text-[10px] uppercase tracking-[0.14em] text-stone">Protein</p>
                      <p className="mt-1 font-body text-[15px] font-bold text-terracotta">{row.protein}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.05] px-3 py-3">
                      <p className="font-body text-[10px] uppercase tracking-[0.14em] text-stone">Carbs</p>
                      <p className="mt-1 font-body text-[15px] font-bold text-white">{row.carbs}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.05] px-3 py-3">
                      <p className="font-body text-[10px] uppercase tracking-[0.14em] text-stone">Fibre</p>
                      <p className="mt-1 font-body text-[15px] font-bold text-sage-light">{row.fibre}</p>
                    </div>
                    <div className="rounded-xl bg-white/[0.05] px-3 py-3 col-span-2">
                      <p className="font-body text-[10px] uppercase tracking-[0.14em] text-stone">Healthy fats</p>
                      <p className="mt-1 font-body text-[15px] font-bold text-white">{row.healthyFats}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-10 hidden overflow-x-auto md:block">
            <table className="w-full border-collapse overflow-hidden rounded-2xl border border-white/8">
              <thead>
                <tr className="bg-white/6">
                  {["Bowl", "Calories", "Protein", "Carbs", "Fibre", "Healthy Fats"].map((heading) => (
                    <th
                      key={heading}
                      scope="col"
                      className="px-4 py-4 text-left font-body text-[11px] font-bold uppercase tracking-[0.18em] text-stone md:px-6"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {NUTRITION_SNAPSHOT_ROWS.map((row, index) => {
                  return (
                    <tr key={row.name} className={`border-t border-white/8 ${index % 2 === 1 ? "bg-white/[0.03]" : ""}`}>
                      <td className="px-4 py-4 font-display text-[16px] text-white md:px-6">{row.name}</td>
                      <td className="px-4 py-4 font-body text-sm text-stone md:px-6">{row.calories}</td>
                      <td className="px-4 py-4 font-body text-sm font-medium text-terracotta md:px-6">{row.protein}</td>
                      <td className="px-4 py-4 font-body text-sm text-stone md:px-6">{row.carbs}</td>
                      <td className="px-4 py-4 font-body text-sm text-sage-light md:px-6">{row.fibre}</td>
                      <td className="px-4 py-4 font-body text-sm text-stone md:px-6">{row.healthyFats}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-8 text-center font-body text-xs uppercase tracking-[0.2em] text-stone/60">
            No added sugar - Yogurt or milk base - Made fresh daily
          </p>
        </div>
      </section>

      <section className="bg-[#F9F8F6] px-5 py-10 text-center md:px-6 lg:px-16">
        <p className="font-display text-[21px] italic text-ink md:text-[34px]">Need help before you order?</p>
        <p className="mx-auto mt-2 max-w-md font-body text-[11px] leading-relaxed text-stone">
          Ordering is now cart-first on mobile, but WhatsApp support is still available if you need help with delivery windows or a custom request.
        </p>
        <a
          href={getWhatsAppHref()}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex rounded-full border border-sage/30 px-4 py-2 font-body text-[10px] font-bold uppercase tracking-[0.16em] text-sage-dark transition-colors hover:border-sage hover:bg-sage/8"
        >
          Chat on WhatsApp
        </a>
        <div className="mt-6">
          <Link
            href="/subscribe"
            className="font-body text-[11px] font-bold uppercase tracking-[0.14em] text-ink underline decoration-black/15 underline-offset-4"
          >
            Explore subscriptions
          </Link>
        </div>
      </section>
    </>
  );
}
