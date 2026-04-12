import Link from "next/link";
import { getAllBowls } from "@/lib/sanity";
import BowlCard from "@/components/BowlCard";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import DeliveryMarquee from "@/components/DeliveryMarquee";
import { getWhatsAppHref } from "@/lib/contact";

export default async function HomePage() {
  const bowls = await getAllBowls();
  const featured = bowls.slice(0, 3);

  return (
    <>
      {/* ── Hero ────────────────────────────────────────── */}
      <section
        className="relative flex min-h-[max(640px,calc(100vh-64px))] flex-col"
        aria-labelledby="trust-heading"
      >
        {/* Background video bleeds up into the 64px layout padding */}
        <div className="absolute inset-x-0 bottom-0 top-[-64px] z-[-1] overflow-hidden" aria-hidden="true">
          <video
            autoPlay
            loop
            muted
            playsInline
            className="w-full h-full object-cover"
            poster="/hero-image.png"
          >
            <source src="/hero-vid-slow.mp4" type="video/mp4" />
          </video>
          {/* Warm brand tint: brown-gold left scrim, cream edge, open right */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to right, rgba(62,48,32,0.72) 0%, rgba(62,48,32,0.45) 40%, rgba(250,249,246,0.12) 72%, transparent 100%)"
          }} />
          {/* Bottom vignette so trust strip reads on any video frame */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to top, rgba(62,48,32,0.42) 0%, transparent 26%)"
          }} />
        </div>

        {/* Copy fills space above strip; strip is in-flow so it never overlaps CTAs */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-end px-6 pb-6 pt-10 lg:px-16">
          <div className="max-w-7xl mx-auto w-full -mt-4">
            <div className="max-w-2xl">
            <p className="font-body text-[11px] font-medium tracking-[0.25em] mb-4 text-sage-light" style={{ textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}>
              FRESH · BANGALORE · DELIVERED 7 AM–9 PM
            </p>
            <h1 className="font-display text-white mb-5"
              style={{ fontSize: "clamp(46px, 6vw, 76px)", lineHeight: "1.05" }}>
              Wholesome protein bowls.<br />
              Any meal.<br />
              <em className="text-sage-light">At your door.</em>
            </h1>
            <p className="font-body text-[15px] font-light text-white/90 leading-relaxed mb-8 max-w-md">
              Fresh yogurt bowls crafted daily. High protein, gut-friendly,
              no added sugar — a complete meal you'll actually look forward to.
            </p>
            <div className="flex flex-wrap gap-4 items-center">
              <Link href="/menu" className="btn-sage shadow-[0_4px_20px_rgba(196,165,116,0.35)] hover:shadow-[0_4px_25px_rgba(196,165,116,0.55)] transition-all duration-300">
                See the Menu
              </Link>
              <Link
                href="/about"
                className="font-body text-[14px] font-medium tracking-wider text-white hover:text-sage-light transition-colors duration-300 flex items-center gap-2 drop-shadow-md"
              >
                Our Story →
              </Link>
            </div>
            </div>
          </div>
        </div>

        {/* Trust strip — in document flow (was absolute + z-20, which covered CTAs on mobile) */}
        <div
          className="relative z-20 shrink-0 grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.12] border-t border-white/[0.12] text-white"
          style={{ background: "rgba(45,36,26,0.72)", backdropFilter: "blur(16px)" }}
          aria-label="Why Nutravoe"
        >
          <h2 id="trust-heading" className="sr-only">Why Nutravoe</h2>
          {[
            {
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>,
              title: "Probiotic Yogurt Base", sub: "Gut-friendly, every bowl"
            },
            {
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>,
              title: "No Added Sugar", sub: "Real fruit, honest flavour"
            },
            {
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>,
              title: "Small Batches Daily", sub: "No preservatives, ever"
            },
            {
              icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
              title: "Delivered 7 AM–9 PM", sub: "Order anytime, same day"
            },
          ].map(({ icon, title, sub }) => (
            <div key={title} className="px-4 lg:px-8 py-2.5 text-center flex flex-col justify-center items-center text-inherit">
              <div className="text-sage-light mb-1.5 drop-shadow-md [color:#f0e6d4]" aria-hidden="true">{icon}</div>
              <p
                className="font-body text-[11.5px] font-medium tracking-wide leading-tight text-white"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.45)" }}
              >
                {title}
              </p>
              <p
                className="font-body text-[10px] mt-0.5 leading-tight text-[#f5f0e8]"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}
              >
                {sub}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Delivery marquee ─────────────────────────────── */}
      <DeliveryMarquee variant="dark" />

      {/* ── Featured Bowls ──────────────────────────────── */}
      <section className="py-28 px-6 lg:px-16">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-16">
            <div>
              <p className="section-eyebrow mb-4">The Menu</p>
              <h2 className="section-heading"
                style={{ fontSize: "clamp(40px, 4.5vw, 60px)" }}>
                Five bowls.<br />
                <em className="text-sage">All considered.</em>
              </h2>
            </div>
            <p className="font-body text-sm text-stone max-w-xs mt-4 md:mt-0 md:text-right leading-relaxed">
              Made with real ingredients. Kept refrigerated.
              Best consumed within 24 hours.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {featured.map((bowl) => (
              <BowlCard key={bowl._id} bowl={bowl} />
            ))}
          </div>

          <div className="text-center mt-12">
            <Link href="/menu" className="btn-ghost">
              See All Five Bowls →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────── */}
      <TestimonialsCarousel />

      {/* ── About Strip ─────────────────────────────────── */}
      <section className="grid grid-cols-1 md:grid-cols-2" style={{ background: "#F0EDE8" }}>
        <div className="px-8 lg:px-20 py-24">
          <p className="section-eyebrow text-stone mb-6">About Nutravoe</p>
          <h2 className="font-display text-ink mb-7"
            style={{ fontSize: "clamp(36px, 3.5vw, 52px)", lineHeight: "1.15" }}>
            Inspired by Austria.<br />
            <em className="text-sage-dark">Made for India.</em>
          </h2>
          <p className="font-body text-[14px] font-light leading-loose text-stone max-w-md mb-10">
            On a trip to Austria, Harshita noticed something simple and brilliant —
            grab-and-go protein bowls. Fresh, healthy, and just there. Nothing like it
            existed in India. Nutravoe is her answer: a premium daily ritual, made by hand
            and at your door before 10 AM.
          </p>
          <p className="font-display text-[20px] italic text-stone">
            — Harshita, founder
          </p>
        </div>
        <div
          className="relative flex items-center justify-center min-h-[320px]"
          style={{ background: "linear-gradient(135deg, #C4A574 0%, #9A7B4A 100%)" }}
        >
          <div className="px-12 py-16 text-center">
            <blockquote className="font-display text-[22px] font-light italic text-white/95 leading-relaxed">
              "Healthy food doesn't have to be<br />
              bland or inconvenient.<br />
              I built Nutravoe to prove that."
            </blockquote>
            <cite className="block mt-6 font-body text-xs tracking-[0.18em] uppercase text-white/70 not-italic">
              Harshita · Nutravoe · Bangalore
            </cite>
          </div>
        </div>
      </section>

      {/* ── CTA Section ─────────────────────────────────── */}
      <section className="py-28 px-6 lg:px-16 text-center bg-cream">
        <div className="max-w-3xl mx-auto">
          <p className="font-body text-xs font-medium tracking-[0.22em] uppercase text-stone mb-8">
            Delivered 7 AM–9 PM · Order by WhatsApp · Bangalore
          </p>
          <h2 className="font-display text-ink mb-10"
            style={{ fontSize: "clamp(36px, 4vw, 60px)", lineHeight: "1.2" }}>
            A complete meal.<br />
            <strong className="font-medium italic text-sage-dark">
              At your door before you need it.
            </strong>
          </h2>
          <a
            href={getWhatsAppHref()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block btn-sage text-xs tracking-widest shadow-[0_4px_20px_rgba(196,165,116,0.35)] hover:shadow-[0_4px_25px_rgba(196,165,116,0.55)] transition-all duration-300"
          >
            Order Your First Bowl →
          </a>
        </div>
      </section>

      {/* ── B2B Section ─────────────────────────────────── */}
      <section className="py-24 px-6 lg:px-16" style={{ backgroundColor: "#F0EDE8" }}>
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">

          {/* Left column — copy */}
          <div>
            <p className="section-eyebrow mb-5">For Organisations</p>
            <h2
              className="font-display text-ink mb-6"
              style={{ fontSize: "clamp(36px, 3.5vw, 54px)", lineHeight: "1.12" }}
            >
              Feeding your team?{" "}
              <em className="text-sage-dark">We&rsquo;ve got you.</em>
            </h2>
            <p className="font-body text-[15px] font-light text-stone leading-relaxed mb-8 max-w-md">
              Volume pricing, weekly invoicing, and a dedicated point of contact.
              We deliver to corporate offices, gyms, hotels, and co-working spaces
              across Bangalore.
            </p>

            {/* Pill badges */}
            <div className="flex flex-wrap gap-2.5 mb-10">
              {["Corporate Offices", "Gyms & Studios", "Hotels & Hospitality"].map(
                (label) => (
                  <span
                    key={label}
                    className="font-body text-xs font-medium tracking-wide px-4 py-2 rounded-full border border-sage/30 text-sage-dark bg-white/60"
                  >
                    {label}
                  </span>
                )
              )}
            </div>

            <Link href="/b2b" className="btn-sage inline-block">
              Enquire for Your Organisation &rarr;
            </Link>
          </div>

          {/* Right column — stat blocks */}
          <div className="grid grid-cols-2 gap-5">
            {[
              { stat: "20+ bowls", desc: "minimum weekly order" },
              { stat: "Custom pricing", desc: "volume rates available" },
              { stat: "Weekly invoicing", desc: "no daily hassle" },
              { stat: "Dedicated manager", desc: "single point of contact" },
            ].map(({ stat, desc }) => (
              <div
                key={stat}
                className="bg-white/70 rounded-xl px-6 py-7 border border-black/[0.05]"
              >
                <p
                  className="font-display text-ink mb-1.5"
                  style={{ fontSize: "clamp(22px, 2vw, 30px)", lineHeight: "1.1", fontWeight: 300 }}
                >
                  {stat}
                </p>
                <p className="font-body text-[13px] text-stone leading-snug">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
