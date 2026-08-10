import Link from "next/link";
import { getAllBowls } from "@/lib/sanity";
import BowlCard from "@/components/BowlCard";
import MobileBowlCard from "@/components/MobileBowlCard";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import DeliveryMarquee from "@/components/DeliveryMarquee";
import HeroImageScroller from "@/components/HeroImageScroller";

const HERO_IMAGES = [
  { src: "/hero-scroll-1.png", alt: "Fresh yoghurt bowl with dragon fruit, blueberries, pomegranate, mango, and granola" },
  { src: "/hero-scroll-2.png", alt: "Fresh ingredients used in Nutravoe bowls: yoghurt, berries, mango, nuts, and honey" },
];

export default async function HomePage() {
  const bowls = await getAllBowls();
  const featured = bowls.slice(0, 3);

  return (
    <>
      <section className="relative pt-3 md:pt-0" aria-labelledby="trust-heading">
        <div className="px-4 md:hidden">
          <div className="relative overflow-hidden rounded-[28px] shadow-[0_24px_60px_rgba(62,48,32,0.18)]">
            <div className="relative aspect-[1.18/1] min-h-[320px]">
              <HeroImageScroller images={HERO_IMAGES} intervalMs={3000} priority />
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(to top, rgba(40,28,18,0.92) 0%, rgba(54,40,26,0.68) 42%, rgba(62,48,32,0.22) 100%)",
                }}
              />
              <div className="absolute inset-x-0 bottom-0 p-4">
                <h1
                  className="mb-3 font-display text-white"
                  style={{
                    fontSize: "clamp(28px, 7.2vw, 38px)",
                    lineHeight: "1.02",
                    textShadow: "0 8px 28px rgba(0,0,0,0.38)",
                  }}
                >
                  Wholesome
                  <br />
                  Nourishin&apos;
                  <br />
                  <em className="text-sage-light">greek yogurt bowls</em>
                </h1>
                <p
                  className="mb-4 max-w-[15.5rem] font-body text-[11px] font-light leading-relaxed text-white/95"
                  style={{ textShadow: "0 2px 10px rgba(0,0,0,0.42)" }}
                >
                  Protein milk and vegan options available
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <Link
                    href="/menu"
                    className="inline-flex min-w-[132px] items-center justify-center rounded-full bg-[#c9a562] px-5 py-2.5 font-body text-[10.5px] font-bold uppercase tracking-[0.14em] text-white shadow-[0_8px_22px_rgba(196,165,116,0.28)] transition-colors hover:bg-[#b8924f]"
                  >
                    Order Now
                  </Link>
                  <Link
                    href="/subscribe"
                    className="inline-flex min-w-[132px] items-center justify-center rounded-full border border-white/68 bg-black/10 px-5 py-2.5 font-body text-[10.5px] font-bold uppercase tracking-[0.14em] text-white backdrop-blur-sm"
                  >
                    Subscribe
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative hidden min-h-[400px] flex-col md:flex lg:min-h-[440px]">
          <div className="absolute inset-x-0 bottom-0 top-[-64px] z-[-1] overflow-hidden" aria-hidden="true">
            <HeroImageScroller images={HERO_IMAGES} intervalMs={3000} priority />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to right, rgba(62,48,32,0.72) 0%, rgba(62,48,32,0.45) 40%, rgba(250,249,246,0.12) 72%, transparent 100%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(to top, rgba(62,48,32,0.42) 0%, transparent 26%)",
              }}
            />
          </div>

          <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-end px-6 pb-24 pt-10 lg:px-16">
            <div className="mx-auto w-full max-w-7xl">
              <div className="max-w-2xl">
                <h1
                  className="mb-7 font-display text-white"
                  style={{ fontSize: "clamp(46px, 6vw, 76px)", lineHeight: "1.05" }}
                >
                  Wholesome
                  <br />
                  Nourishin&apos;
                  <br />
                  <em className="text-sage-light">greek yogurt bowls</em>
                </h1>
                <p className="mb-10 max-w-md font-body text-[15px] font-light leading-relaxed text-white/90">
                  Protein milk and vegan options available
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <Link
                    href="/menu"
                    className="btn-sage shadow-[0_4px_20px_rgba(196,165,116,0.35)] transition-all duration-300 hover:shadow-[0_4px_25px_rgba(196,165,116,0.55)]"
                  >
                    Order Now
                  </Link>
                  <Link
                    href="/subscribe"
                    className="inline-flex items-center justify-center rounded-sm border border-white/40 bg-white/8 px-8 py-3.5 font-body text-sm font-medium tracking-widest text-white backdrop-blur-sm transition-all duration-300 hover:border-white/60 hover:bg-white/14 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  >
                    Subscribe Now
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-3 grid grid-cols-2 gap-2 bg-[#f8f4ed] px-4 py-2 text-sage-dark md:absolute md:bottom-0 md:left-0 md:right-0 md:z-20 md:mt-0 md:shrink-0 md:grid-cols-4 md:gap-0 md:overflow-hidden md:divide-x md:divide-white/[0.12] md:border-t md:border-white/[0.12] md:bg-[rgba(45,36,26,0.68)] md:px-0 md:py-0 md:text-white"
          style={{ backdropFilter: "blur(16px)" }}
          aria-label="Why Nutravoe"
        >
          <h2 id="trust-heading" className="sr-only">
            Why Nutravoe
          </h2>
          {[
            {
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
                </svg>
              ),
              title: "Probiotic Yogurt Base",
              sub: "Good for your gut, every time",
            },
            {
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                  <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
                </svg>
              ),
              title: "No Added Sugar",
              sub: "Real fruit, honest flavour",
            },
            {
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
                  <path d="M5 3v4" />
                  <path d="M19 17v4" />
                  <path d="M3 5h4" />
                  <path d="M17 19h4" />
                </svg>
              ),
              title: "Small Batches Daily",
              sub: "No preservatives, ever",
            },
            {
              icon: (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              ),
              title: "Delivered 7 AM-7 PM",
              sub: "Last same-day order by 7 PM",
            },
          ].map(({ icon, title, sub }) => (
            <div
              key={title}
              className="flex flex-col items-center justify-center rounded-2xl border border-[#e8dcc8] bg-[#fffdf8] px-4 py-3 text-center text-inherit shadow-[0_8px_20px_rgba(62,48,32,0.035)] md:rounded-none md:border-0 md:bg-transparent md:px-4 md:py-2.5 md:shadow-none lg:px-8"
            >
              <div
                className="mb-1.5 [color:#bf9350] md:text-sage-light md:drop-shadow-md md:[color:#f0e6d4]"
                aria-hidden="true"
              >
                {icon}
              </div>
              <p
                className="font-body text-[11px] font-medium leading-tight tracking-wide text-inherit md:text-[11.5px] md:text-white"
                style={{ textShadow: "0 1px 2px rgba(0,0,0,0.12)" }}
              >
                {title}
              </p>
              <p
                className="mt-0.5 font-body text-[10px] leading-tight text-[#7b6750] md:text-[#f5f0e8]"
                style={{ textShadow: "0 1px 1px rgba(0,0,0,0.06)" }}
              >
                {sub}
              </p>
            </div>
          ))}
        </div>
      </section>

      <DeliveryMarquee variant="dark" />

      <section className="px-5 py-16 md:px-6 md:py-28 lg:px-16">
        <div className="mx-auto max-w-7xl">
          <div className="mb-10 flex flex-col md:mb-16 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="section-eyebrow mb-4">The Menu</p>
              <h2 className="section-heading" style={{ fontSize: "clamp(26px, 4.5vw, 60px)" }}>
                Our menu.
                <br />
                <em className="text-sage">Curated with intention.</em>
              </h2>
            </div>
            <p className="mt-2 max-w-xs font-body text-[11px] leading-relaxed text-stone md:mt-0 md:text-right md:text-sm">
              Made with real ingredients. Kept refrigerated. Best consumed within 24 hours.
            </p>
          </div>

          <div className="md:hidden">
            {featured.map((bowl) => (
              <MobileBowlCard key={bowl._id} bowl={bowl} />
            ))}
          </div>

          <div className="hidden gap-6 md:grid md:grid-cols-3">
            {featured.map((bowl) => (
              <BowlCard key={bowl._id} bowl={bowl} />
            ))}
          </div>

          <div className="mt-12 text-center">
            <Link href="/menu" className="btn-ghost">
              See All Bowls →
            </Link>
          </div>
        </div>
      </section>

      <TestimonialsCarousel />

      <section className="bg-cream px-5 py-16 text-center md:px-6 md:py-28 lg:px-16">
        <div className="mx-auto max-w-3xl">
          <p className="mb-8 font-body text-xs font-medium uppercase tracking-[0.22em] text-stone">
            Delivered 7 AM-7 PM · Bangalore
          </p>
          <h2
            className="mb-10 font-display text-ink"
            style={{ fontSize: "clamp(28px, 4vw, 60px)", lineHeight: "1.2" }}
          >
            A proper meal.
            <br />
            <strong className="font-medium italic text-sage-dark">
              At your doorstep, whenever you need one.
            </strong>
          </h2>
          <Link
            href="/menu"
            className="inline-block btn-sage px-4 py-2.5 text-[10px] tracking-[0.18em] shadow-[0_4px_20px_rgba(196,165,116,0.35)] transition-all duration-300 hover:shadow-[0_4px_25px_rgba(196,165,116,0.55)] md:px-6 md:py-3.5 md:text-[11px] md:tracking-widest"
          >
            Order Now →
          </Link>
        </div>
      </section>

      <section className="px-6 py-24 lg:px-16" style={{ backgroundColor: "#F0EDE8" }}>
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-16 lg:grid-cols-2">
          <div>
            <p className="section-eyebrow mb-5">For Organisations</p>
            <h2
              className="mb-6 font-display text-ink"
              style={{ fontSize: "clamp(28px, 3.5vw, 54px)", lineHeight: "1.12" }}
            >
              Feeding your team? <em className="text-sage-dark">We&apos;ve got you.</em>
            </h2>
            <p className="mb-8 max-w-md font-body text-[13px] font-light leading-relaxed text-stone md:text-[15px]">
              Volume pricing, weekly invoicing, and a dedicated point of contact. We deliver to
              corporate offices, gyms, hotels, and co-working spaces across Bangalore.
            </p>

            <div className="mb-10 flex flex-wrap gap-2.5">
              {["Corporate Offices", "Gyms & Studios", "Hotels & Hospitality"].map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-sage/30 bg-white/60 px-4 py-2 font-body text-[11px] font-medium tracking-wide text-sage-dark md:text-xs"
                >
                  {label}
                </span>
              ))}
            </div>

            <Link href="/b2b" className="btn-sage inline-block px-4 py-2.5 text-[10px] tracking-[0.18em] md:px-6 md:py-3.5 md:text-[11px] md:tracking-widest">
              Enquire for Your Organisation →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-5">
            {[
              { stat: "20+ bowls", desc: "minimum weekly order" },
              { stat: "Custom pricing", desc: "volume rates available" },
              { stat: "Weekly invoicing", desc: "no daily hassle" },
              { stat: "Dedicated manager", desc: "single point of contact" },
            ].map(({ stat, desc }) => (
              <div
                key={stat}
                className="rounded-xl border border-black/[0.05] bg-white/70 px-5 py-5 md:px-6 md:py-7"
              >
                <p
                  className="mb-1.5 font-display text-ink"
                  style={{
                    fontSize: "clamp(18px, 2vw, 30px)",
                    lineHeight: "1.1",
                    fontWeight: 300,
                  }}
                >
                  {stat}
                </p>
                <p className="font-body text-[12px] leading-snug text-stone md:text-[13px]">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
