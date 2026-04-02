import Image from "next/image";

export const metadata = {
  title: "About — Nutravoe",
  description:
    "The story behind Nutravoe — inspired by Austria, built for Bangalore. Meet our founder Harshita.",
};

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="pt-28 pb-20 px-6 lg:px-16 border-b border-ink/8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <div>
            <p className="section-eyebrow mb-6">Our Story</p>
            <h1
              className="section-heading text-ink mb-8"
              style={{ fontSize: "clamp(44px, 5vw, 68px)" }}
            >
              Inspired by Austria.<br />
              <em className="text-sage">Made for India.</em>
            </h1>
            <p className="font-body text-[15px] font-light text-stone leading-loose mb-6 max-w-lg">
              Mornings decide how the rest of the day feels. Yet breakfast is often rushed,
              confusing, or skipped altogether. Nutravoe solves one simple problem: what if
              the right breakfast just showed up at your doorstep every morning?
            </p>
            <p className="font-body text-[15px] font-light text-stone leading-loose mb-6 max-w-lg">
              On a trip to Austria, Harshita noticed something simple and brilliant —
              grab-and-go breakfast bowls. Fresh, healthy, and casually available everywhere.
              She looked around and realised there was no equivalent in India.
            </p>
            <p className="font-body text-[15px] font-light text-stone leading-loose max-w-lg">
              So she built one. Nutravoe is her answer to the gap: a premium morning ritual,
              made by hand in small batches each day and delivered to your door before 10 AM.
              No apps, no aggregators — just you and a bowl worth looking forward to.
            </p>
          </div>
          <div className="relative h-[440px] rounded-sm overflow-hidden">
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

      {/* Founder quote */}
      <section className="bg-ink py-24 px-6 lg:px-16 text-center">
        <div className="max-w-2xl mx-auto">
          <blockquote
            className="font-display font-light italic text-white leading-relaxed mb-8"
            style={{ fontSize: "clamp(22px, 3vw, 34px)" }}
          >
            "Healthy food doesn&apos;t have to be bland or inconvenient.
            I built Nutravoe to prove that."
          </blockquote>
          <cite className="font-body text-xs tracking-[0.22em] uppercase text-sage not-italic">
            Harshita · Founder · Bangalore
          </cite>
        </div>
      </section>

      {/* Our commitments */}
      <section className="py-24 px-6 lg:px-16">
        <div className="max-w-7xl mx-auto">
          <p className="section-eyebrow mb-4 text-center">What we stand for</p>
          <h2
            className="section-heading text-ink text-center mb-16"
            style={{ fontSize: "clamp(36px, 4vw, 52px)" }}
          >
            Our commitments
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            {[
              {
                icon: "🥛",
                title: "Probiotic First",
                body: "Every bowl starts with a probiotic yogurt base — supporting gut health, naturally, every morning.",
              },
              {
                icon: "🍓",
                title: "No Added Sugar",
                body: "We use real fruit for sweetness. Never refined sugar, never artificial sweeteners.",
              },
              {
                icon: "📦",
                title: "Made Daily, Not Mass-Produced",
                body: "Small batches. Fresh ingredients. No preservatives. Made that morning, delivered that morning.",
              },
              {
                icon: "⏰",
                title: "Delivered 7–10 AM",
                body: "Your bowl arrives before your day starts. That's the whole point.",
              },
              {
                icon: "💬",
                title: "Direct & Personal",
                body: "You message us on WhatsApp. We confirm, prepare, and deliver. No middlemen, no algorithms.",
              },
              {
                icon: "🔁",
                title: "Built for Habit",
                body: "The goal is a subscription you look forward to. A morning ritual you can count on.",
              },
            ].map(({ icon, title, body }) => (
              <div key={title} className="border border-ink/8 p-8 rounded-sm hover:border-sage transition-colors duration-300">
                <div className="text-3xl mb-4" aria-hidden="true">{icon}</div>
                <h3 className="font-display text-[20px] font-medium text-ink mb-3">
                  {title}
                </h3>
                <p className="font-body text-sm text-stone leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-cream py-20 px-6 lg:px-16 text-center border-t border-ink/8">
        <blockquote className="font-display italic text-2xl text-ink mb-8 max-w-2xl mx-auto leading-relaxed">
          <span className="text-ink">"If you&apos;re someone who likes routine, simplicity, and good food — </span>
          <span className="text-sage-dark">I&apos;d love to hear from you."</span>
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
import { getWhatsAppHref } from "@/lib/contact";
