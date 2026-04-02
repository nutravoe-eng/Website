"use client";

import { useState } from "react";
import { Bowl, BowlTag } from "@/types";
import BowlCard from "@/components/BowlCard";

const TAG_OPTIONS: { label: string; value: BowlTag | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Bestseller", value: "bestseller" },
  { label: "High Protein", value: "high-protein" },
  { label: "Seasonal", value: "seasonal" },
];

export default function MenuClient({ bowls }: { bowls: Bowl[] }) {
  const [activeTag, setActiveTag] = useState<BowlTag | "all">("all");

  const filtered =
    activeTag === "all"
      ? bowls
      : bowls.filter((b) => b.tags?.includes(activeTag));

  return (
    <>
      {/* Header */}
      <section className="pt-24 pb-16 px-6 lg:px-16 border-b border-ink/8">
        <div className="max-w-7xl mx-auto">
          <p className="section-eyebrow mb-4">The Menu</p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
            <h1
              className="section-heading"
              style={{ fontSize: "clamp(48px, 5vw, 72px)" }}
            >
              Five bowls.<br />
              <em className="text-sage">All considered.</em>
            </h1>
            <p className="font-body text-sm text-stone max-w-xs leading-relaxed">
              Made fresh daily. No added sugar. Probiotic yogurt base.
              Best consumed within 24 hours.
            </p>
          </div>
        </div>
      </section>

      {/* Filter bar */}
      <section className="sticky top-16 z-40 bg-cream/95 backdrop-blur-sm border-b border-ink/8 px-6 lg:px-16 py-4">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-2">
          {TAG_OPTIONS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setActiveTag(value)}
              className={`font-body text-xs font-medium tracking-widest uppercase px-4 py-2 rounded-sm transition-all duration-300 border cursor-pointer ${
                activeTag === value
                  ? "bg-sage text-white border-sage"
                  : "bg-white text-stone border-ink/10 hover:border-sage hover:text-sage-dark"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* Bowl grid */}
      <section className="py-20 px-6 lg:px-16">
        <div className="max-w-7xl mx-auto">
          {filtered.length === 0 ? (
            <div className="text-center py-24">
              <p className="font-display text-2xl italic text-stone">
                No bowls match this filter.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((bowl) => (
                <BowlCard key={bowl._id} bowl={bowl} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Nutrition Snapshot */}
      <section className="py-20 px-6 lg:px-16 bg-ink">
        <div className="max-w-7xl mx-auto">
          <p className="section-eyebrow text-sage mb-4 text-center">What&apos;s Inside</p>
          <h2
            className="font-display text-white text-center mb-3"
            style={{ fontSize: "clamp(32px, 4vw, 48px)" }}
          >
            Nutrition Snapshot
          </h2>
          <p className="font-body text-sm text-stone text-center mb-12 max-w-md mx-auto leading-relaxed">
            Every bowl is made fresh, using real ingredients. Here&apos;s our estimated nutrition for each bowl.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#2a2a28]">
                  {["Bowl", "Calories", "Protein", "Carbs", "Fibre", "Healthy Fats"].map((h) => (
                    <th
                      key={h}
                      scope="col"
                      className="font-body text-xs font-medium tracking-widest uppercase text-stone px-6 py-4 text-left"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { name: "Tropical Mango", cal: "510 kcal", protein: "20 g", carbs: "58 g", fibre: "11 g", fats: "18 g" },
                  { name: "Very Fruity", cal: "480 kcal", protein: "19 g", carbs: "56 g", fibre: "12 g", fats: "16 g" },
                  { name: "Very Berry", cal: "470 kcal", protein: "20 g", carbs: "58 g", fibre: "11 g", fats: "20 g" },
                  { name: "Banana Peanut Butter", cal: "530 kcal", protein: "23 g", carbs: "62 g", fibre: "13 g", fats: "26 g" },
                  { name: "Very Nutty", cal: "550 kcal", protein: "21 g", carbs: "67 g", fibre: "14 g", fats: "30 g" },
                ].map(({ name, cal, protein, carbs, fibre, fats }, i) => (
                  <tr key={name} className={`border-t border-white/8 ${i % 2 === 1 ? "bg-white/2" : ""}`}>
                    <td className="font-display text-[16px] font-medium text-white px-6 py-5">{name}</td>
                    <td className="font-body text-sm text-stone px-6 py-5">{cal}</td>
                    <td className="font-body text-sm text-terracotta px-6 py-5 font-medium">{protein}</td>
                    <td className="font-body text-sm text-stone px-6 py-5">{carbs}</td>
                    <td className="font-body text-sm text-sage px-6 py-5">{fibre}</td>
                    <td className="font-body text-sm text-stone px-6 py-5">{fats}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="font-body text-xs tracking-[0.2em] uppercase text-stone/60 text-center mt-8">
            No added sugar · Probiotic yoghurt base · Made fresh daily
          </p>
        </div>
      </section>

      {/* Order CTA banner */}
      <section className="bg-sage-dark py-16 px-6 lg:px-16 text-center">
        <p className="font-display text-white italic mb-4" style={{ fontSize: "clamp(22px, 3vw, 32px)" }}>
          Ready to order?
        </p>
        <p className="font-body text-sm text-sage-light mb-8 tracking-wide">
          Message us on WhatsApp and we'll confirm same-day delivery.
        </p>
        <a
          href={getWhatsAppHref()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block bg-white text-sage-dark font-body text-xs font-medium tracking-widest uppercase px-8 py-3.5 rounded-sm hover:bg-sage-light transition-colors duration-300"
        >
          Order on WhatsApp →
        </a>
      </section>
    </>
  );
}
import { getWhatsAppHref } from "@/lib/contact";
