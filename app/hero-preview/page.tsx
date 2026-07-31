import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Hero variants (preview)",
  robots: { index: false, follow: false },
};

const TRUST = [
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />
      </svg>
    ),
    title: "Probiotic Yogurt Base",
    sub: "Gut-friendly, every bowl",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
      </svg>
    ),
    title: "No Added Sugar",
    sub: "Real fruit, honest flavour",
  },
  {
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
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
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
    title: "Delivered 7 AM–7 PM",
    sub: "Order anytime, same day",
  },
] as const;

function HeroVideo() {
  return (
    <video autoPlay loop muted playsInline className="w-full h-full object-cover" poster="/hero-image.png">
      <source src="/hero-vid-slow.mp4" type="video/mp4" />
    </video>
  );
}

export default function HeroPreviewPage() {
  return (
    <main className="bg-cream">
      <div className="sticky top-0 z-50 border-b border-ink/10 bg-cream/95 px-6 py-4 backdrop-blur-md">
        <p className="font-body text-xs font-medium uppercase tracking-[0.2em] text-terracotta-dark">Internal preview</p>
        <h1 className="font-display text-2xl text-ink mt-1">Homepage hero — four directions</h1>
        <p className="font-body text-sm text-stone mt-2 max-w-2xl">
          Scroll to compare. This page is not linked from the site; delete{" "}
          <code className="text-ink bg-beige/80 px-1 rounded-sm text-[13px]">app/hero-preview/page.tsx</code> when you have picked a winner.
        </p>
        <p className="font-body text-sm text-ink mt-3">
          <Link href="/" className="text-sage-dark underline underline-offset-2 hover:text-sage">
            ← Back to home
          </Link>
        </p>
      </div>

      {/* A — Current (production-style) */}
      <section className="relative min-h-[92vh] flex flex-col border-b-8 border-sage/30" aria-label="Variant A">
        <div className="sticky top-[1px] z-30 flex flex-wrap items-baseline justify-between gap-2 bg-[#1c1c1a] px-4 py-2.5 text-white">
          <span className="font-body text-sm font-semibold tracking-wide">A — Current</span>
          <span className="font-body text-xs text-white/70">Heavy charcoal scrims (live site)</span>
        </div>
        <div className="relative flex-1 min-h-[80vh] flex items-center">
          <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
            <HeroVideo />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to right, rgba(28,28,26,0.85) 0%, rgba(28,28,26,0.7) 35%, rgba(28,28,26,0.1) 65%, transparent 100%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(to top, rgba(28,28,26,0.55) 0%, transparent 22%)",
              }}
            />
          </div>
          <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 w-full pb-28">
            <div className="max-w-2xl">
              <p
                className="font-body text-[11px] font-medium tracking-[0.25em] mb-4 text-sage-light"
                style={{ textShadow: "0 2px 10px rgba(0,0,0,0.3)" }}
              >
                FRESH · BANGALORE · DELIVERED 7 AM–7 PM
              </p>
              <h1 className="font-display text-white mb-5" style={{ fontSize: "clamp(40px, 5vw, 64px)", lineHeight: "1.05" }}>
                Wholesome protein bowls.
                <br />
                Any meal.
                <br />
                <em className="text-sage-light">At your door.</em>
              </h1>
              <p className="font-body text-[15px] font-light text-white/85 leading-relaxed mb-8 max-w-md">
                Fresh yogurt bowls crafted daily. High protein, gut-friendly, no added sugar — a complete meal you&apos;ll actually look forward to.
              </p>
              <div className="flex flex-wrap gap-4 items-center">
                <span className="btn-sage pointer-events-none opacity-90">See the Menu</span>
                <span className="font-body text-[14px] font-medium tracking-wider text-white/90">Our Story →</span>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 z-20 grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.07] border-t border-white/[0.07]"
            style={{ background: "rgba(28,28,26,0.55)", backdropFilter: "blur(16px)" }}
          >
            {TRUST.map(({ icon, title, sub }) => (
              <div key={title} className="px-4 lg:px-8 py-2.5 text-center flex flex-col justify-center items-center">
                <div className="text-sage mb-1.5 opacity-90 drop-shadow-md" aria-hidden="true">
                  {icon}
                </div>
                <p className="font-body text-[11.5px] font-medium text-white/85 tracking-wide leading-tight">{title}</p>
                <p className="font-body text-[10px] text-white/60 mt-0.5 leading-tight">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* B — Lighter scrims */}
      <section className="relative min-h-[92vh] flex flex-col border-b-8 border-sage/30" aria-label="Variant B">
        <div className="sticky top-[1px] z-30 flex flex-wrap items-baseline justify-between gap-2 bg-ink px-4 py-2.5 text-white">
          <span className="font-body text-sm font-semibold tracking-wide">B — Lighter scrims</span>
          <span className="font-body text-xs text-white/70">Lower-opacity charcoal; more video visible</span>
        </div>
        <div className="relative flex-1 min-h-[80vh] flex items-center">
          <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
            <HeroVideo />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to right, rgba(28,28,26,0.48) 0%, rgba(28,28,26,0.28) 38%, rgba(28,28,26,0.08) 68%, transparent 100%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(to top, rgba(28,28,26,0.28) 0%, transparent 24%)",
              }}
            />
          </div>
          <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 w-full pb-28">
            <div className="max-w-2xl">
              <p
                className="font-body text-[11px] font-medium tracking-[0.25em] mb-4 text-sage-light"
                style={{ textShadow: "0 1px 8px rgba(0,0,0,0.45)" }}
              >
                FRESH · BANGALORE · DELIVERED 7 AM–7 PM
              </p>
              <h1
                className="font-display text-white mb-5 drop-shadow-[0_2px_24px_rgba(0,0,0,0.35)]"
                style={{ fontSize: "clamp(40px, 5vw, 64px)", lineHeight: "1.05" }}
              >
                Wholesome protein bowls.
                <br />
                Any meal.
                <br />
                <em className="text-sage-light">At your door.</em>
              </h1>
              <p className="font-body text-[15px] font-light text-white/95 leading-relaxed mb-8 max-w-md drop-shadow-md">
                Fresh yogurt bowls crafted daily. High protein, gut-friendly, no added sugar — a complete meal you&apos;ll actually look forward to.
              </p>
              <div className="flex flex-wrap gap-4 items-center">
                <span className="btn-sage pointer-events-none opacity-90">See the Menu</span>
                <span className="font-body text-[14px] font-medium tracking-wider text-white drop-shadow-md">Our Story →</span>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 z-20 grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.1] border-t border-white/[0.1]"
            style={{ background: "rgba(28,28,26,0.38)", backdropFilter: "blur(14px)" }}
          >
            {TRUST.map(({ icon, title, sub }) => (
              <div key={title} className="px-4 lg:px-8 py-2.5 text-center flex flex-col justify-center items-center">
                <div className="text-sage-light mb-1.5 drop-shadow-md" aria-hidden="true">
                  {icon}
                </div>
                <p className="font-body text-[11.5px] font-medium text-white/95 tracking-wide leading-tight drop-shadow-sm">{title}</p>
                <p className="font-body text-[10px] text-white/75 mt-0.5 leading-tight">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* C — Warm brand tint */}
      <section className="relative min-h-[92vh] flex flex-col border-b-8 border-sage/30" aria-label="Variant C">
        <div className="sticky top-[1px] z-30 flex flex-wrap items-baseline justify-between gap-2 bg-[#3d3428] px-4 py-2.5 text-[#FAF9F6]">
          <span className="font-body text-sm font-semibold tracking-wide">C — Warm tint</span>
          <span className="font-body text-xs text-[#FAF9F6]/75">Brown-gold scrim; ties to cream / terracotta</span>
        </div>
        <div className="relative flex-1 min-h-[80vh] flex items-center">
          <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
            <HeroVideo />
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
          <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 w-full pb-28">
            <div className="max-w-2xl">
              <p
                className="font-body text-[11px] font-medium tracking-[0.25em] mb-4 text-sage-light"
                style={{ textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}
              >
                FRESH · BANGALORE · DELIVERED 7 AM–7 PM
              </p>
              <h1 className="font-display text-white mb-5" style={{ fontSize: "clamp(40px, 5vw, 64px)", lineHeight: "1.05" }}>
                Wholesome protein bowls.
                <br />
                Any meal.
                <br />
                <em className="text-sage-light">At your door.</em>
              </h1>
              <p className="font-body text-[15px] font-light text-white/88 leading-relaxed mb-8 max-w-md">
                Fresh yogurt bowls crafted daily. High protein, gut-friendly, no added sugar — a complete meal you&apos;ll actually look forward to.
              </p>
              <div className="flex flex-wrap gap-4 items-center">
                <span className="btn-sage pointer-events-none opacity-90">See the Menu</span>
                <span className="font-body text-[14px] font-medium tracking-wider text-white/90">Our Story →</span>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 z-20 grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.08] border-t border-white/[0.08]"
            style={{ background: "rgba(62,48,32,0.5)", backdropFilter: "blur(16px)" }}
          >
            {TRUST.map(({ icon, title, sub }) => (
              <div key={title} className="px-4 lg:px-8 py-2.5 text-center flex flex-col justify-center items-center">
                <div className="text-sage-light mb-1.5 opacity-95 drop-shadow-md" aria-hidden="true">
                  {icon}
                </div>
                <p className="font-body text-[11.5px] font-medium text-white/88 tracking-wide leading-tight">{title}</p>
                <p className="font-body text-[10px] text-white/65 mt-0.5 leading-tight">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* D — Cream wash on video; type directly on scrim (no frosted card) */}
      <section className="relative min-h-[92vh] flex flex-col border-b-8 border-sage/30" aria-label="Variant D">
        <div className="sticky top-[1px] z-30 flex flex-wrap items-baseline justify-between gap-2 bg-beige px-4 py-2.5 text-ink border-b border-ink/10">
          <span className="font-body text-sm font-semibold tracking-wide">D — Cream wash + type on video</span>
          <span className="font-body text-xs text-stone">No card; headline sits on the gradient over the video</span>
        </div>
        <div className="relative isolate flex-1 min-h-[80vh] flex items-center">
          <div className="absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
            <HeroVideo />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to right, rgba(250,249,246,0.62) 0%, rgba(250,249,246,0.28) 48%, rgba(250,249,246,0.06) 78%, transparent 100%)",
              }}
            />
            <div
              className="absolute inset-0"
              style={{
                background: "linear-gradient(to top, rgba(250,249,246,0.42) 0%, transparent 32%)",
              }}
            />
          </div>
          <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 w-full pb-44 md:pb-28">
            <div className="max-w-2xl">
              <p
                className="font-body text-[11px] font-medium tracking-[0.25em] mb-4 text-sage-dark"
                style={{ textShadow: "0 1px 12px rgba(250,249,246,0.9), 0 1px 3px rgba(44,44,44,0.15)" }}
              >
                FRESH · BANGALORE · DELIVERED 7 AM–7 PM
              </p>
              <h1
                className="font-display text-ink mb-5"
                style={{
                  fontSize: "clamp(40px, 5vw, 64px)",
                  lineHeight: "1.05",
                  textShadow: "0 2px 24px rgba(250,249,246,0.75), 0 1px 2px rgba(44,44,44,0.12)",
                }}
              >
                Wholesome protein bowls.
                <br />
                Any meal.
                <br />
                <em className="text-sage-dark">At your door.</em>
              </h1>
              <p
                className="font-body text-[15px] font-light text-ink/90 leading-relaxed mb-8 max-w-md"
                style={{ textShadow: "0 1px 16px rgba(250,249,246,0.85)" }}
              >
                Fresh yogurt bowls crafted daily. High protein, gut-friendly, no added sugar — a complete meal you&apos;ll
                actually look forward to.
              </p>
              <div className="flex flex-wrap gap-4 items-center">
                <span className="btn-sage pointer-events-none opacity-90">See the Menu</span>
                <span className="font-body text-[14px] font-medium tracking-wider text-ink/90 drop-shadow-sm">
                  Our Story →
                </span>
              </div>
            </div>
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 z-20 grid grid-cols-2 md:grid-cols-4 divide-x divide-white/[0.07] border-t border-white/[0.07]"
            style={{ background: "rgba(28,28,26,0.45)", backdropFilter: "blur(14px)" }}
          >
            {TRUST.map(({ icon, title, sub }) => (
              <div key={title} className="px-4 lg:px-8 py-2.5 text-center flex flex-col justify-center items-center">
                <div className="text-sage mb-1.5 opacity-95 drop-shadow-md" aria-hidden="true">
                  {icon}
                </div>
                <p className="font-body text-[11.5px] font-medium text-white/90 tracking-wide leading-tight">{title}</p>
                <p className="font-body text-[10px] text-white/65 mt-0.5 leading-tight">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="px-6 py-10 text-center font-body text-sm text-stone">
        End of preview —{" "}
        <Link href="/" className="text-sage-dark underline underline-offset-2 hover:text-sage">
          Return home
        </Link>
      </footer>
    </main>
  );
}
