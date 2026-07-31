import type { Metadata } from "next";
import Image from "next/image";
import JsonLd from "@/components/JsonLd";
import { getWhatsAppHref } from "@/lib/contact";
import { buildPageMetadata, getAboutPageSchema } from "@/lib/seo";

export const metadata: Metadata = buildPageMetadata({
  title: "About - Nutravoe",
  description:
    "The story behind Nutravoe: inspired by Austria, built for Bangalore, and created around wholesome daily yogurt bowls.",
  path: "/about",
});

const commitments = [
  {
    icon: "01",
    title: "Probiotic First",
    body: "Every bowl starts with a probiotic yogurt base, supporting gut health naturally every day.",
  },
  {
    icon: "02",
    title: "No Added Sugar",
    body: "We use real fruit for sweetness. Never refined sugar, never artificial sweeteners.",
  },
  {
    icon: "03",
    title: "Made Daily, Not Mass-Produced",
    body: "Small batches. Fresh ingredients. No preservatives. Made fresh daily and delivered same day.",
  },
  {
    icon: "04",
    title: "Delivered 7 AM–7 PM",
    body: "Order anytime and your bowl arrives the same day, whenever you need it.",
  },
  {
    icon: "05",
    title: "Direct and Personal",
    body: "You message us on WhatsApp. We confirm, prepare, and deliver. No middlemen, no algorithms.",
  },
  {
    icon: "06",
    title: "Built for Habit",
    body: "The goal is a subscription you look forward to. A wholesome ritual you can count on.",
  },
];

export default function AboutPage() {
  return (
    <>
      <JsonLd data={getAboutPageSchema()} />
      <section className="border-b border-ink/8 px-5 pb-14 pt-20 md:px-6 md:pb-20 md:pt-28 lg:px-16">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 md:gap-16 lg:grid-cols-2">
          <div>
            <p className="section-eyebrow mb-6">Our Story</p>
            <h1
              className="section-heading text-ink mb-8"
              style={{ fontSize: "clamp(30px, 5vw, 68px)" }}
            >
              Inspired by Austria.<br />
              <em className="text-sage">Made for India.</em>
            </h1>
            <p className="mb-5 max-w-lg font-body text-[13px] font-light leading-relaxed text-stone md:text-[15px] md:leading-loose">
              What you eat shapes how you feel. Yet finding a wholesome, protein-rich meal
              is often rushed, confusing, or skipped entirely. Nutravoe solves one simple
              problem: what if the right bowl just showed up at your doorstep?
            </p>
            <p className="mb-5 max-w-lg font-body text-[13px] font-light leading-relaxed text-stone md:text-[15px] md:leading-loose">
              On a trip to Austria, Harshita noticed something simple and brilliant:
              grab-and-go protein yoghurt bowls. Fresh, healthy, and casually available everywhere.
              She looked around and realised there was no equivalent in India.
            </p>
            <p className="max-w-lg font-body text-[13px] font-light leading-relaxed text-stone md:text-[15px] md:leading-loose">
              So she built one. Nutravoe is her answer to the gap: a premium daily ritual,
              made by hand in small batches each day and delivered to your doorstep.
              No apps, no aggregators, just you and a bowl worth looking forward to.
            </p>
          </div>
          <div className="relative h-[280px] overflow-hidden rounded-2xl md:h-[440px] md:rounded-sm">
            <Image
              src="/hero-image.png"
              alt="Fresh Nutravoe yogurt bowl"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>

      <section className="bg-ink px-5 py-16 text-center md:px-6 md:py-24 lg:px-16">
        <div className="max-w-2xl mx-auto">
          <blockquote
            className="font-display font-light italic text-white leading-relaxed mb-8"
            style={{ fontSize: "clamp(22px, 3vw, 34px)" }}
          >
            "Healthy food doesn't have to be bland or inconvenient.
            I built Nutravoe to prove that."
          </blockquote>
          <cite className="font-body text-xs tracking-[0.22em] uppercase text-sage not-italic">
            Harshita | Founder | Bangalore
          </cite>
        </div>
      </section>

      <section className="px-5 py-16 md:px-6 md:py-24 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <p className="section-eyebrow mb-4 text-center">What we stand for</p>
          <h2
            className="section-heading text-ink text-center mb-10 md:mb-16"
            style={{ fontSize: "clamp(28px, 4vw, 52px)" }}
          >
            Our commitments
          </h2>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-10 lg:grid-cols-3">
            {commitments.map(({ icon, title, body }) => (
              <div
                key={title}
                className="rounded-2xl border border-ink/8 p-5 transition-colors duration-300 hover:border-sage md:rounded-sm md:p-8"
              >
                <div
                  className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-sage/30 text-xs font-semibold tracking-widest text-sage-dark"
                  aria-hidden="true"
                >
                  {icon}
                </div>
                <h3 className="font-display text-[20px] font-medium text-ink mb-3">
                  {title}
                </h3>
                <p className="font-body text-sm text-stone leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-ink/8 bg-cream px-5 py-14 text-center md:px-6 md:py-20 lg:px-16">
        <blockquote className="mx-auto mb-6 max-w-2xl font-display text-[22px] italic leading-relaxed text-ink md:mb-8 md:text-2xl">
          <span className="text-ink">"If you're someone who likes routine, simplicity, and good food, </span>
          <span className="text-sage-dark">I'd love to hear from you."</span>
        </blockquote>
        <a
          href={getWhatsAppHref()}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block btn-primary text-xs tracking-widest"
        >
          Say Hello on WhatsApp
        </a>
      </section>
    </>
  );
}
