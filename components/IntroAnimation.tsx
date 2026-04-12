'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function IntroAnimation() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  const screenRef    = useRef<HTMLDivElement>(null);
  const bowlRef      = useRef<SVGSVGElement>(null);
  const wordmarkRef  = useRef<HTMLDivElement>(null);
  const badgeRef     = useRef<HTMLDivElement>(null);
  const badgeSvgRef  = useRef<SVGSVGElement>(null);
  const eyebrowRef   = useRef<HTMLParagraphElement>(null);
  const taglineRef   = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    document.documentElement.removeAttribute('data-intro');
    if (pathname !== '/') return;
    if (sessionStorage.getItem('nv-intro-shown')) return;
    sessionStorage.setItem('nv-intro-shown', '1');
    setMounted(true);
  }, [pathname]);

  useEffect(() => {
    if (!mounted) return;
    runSequence();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  function runSequence() {
    const screen   = screenRef.current;
    const bowl     = bowlRef.current;
    const wordmark = wordmarkRef.current;
    const badge    = badgeRef.current;
    const badgeSvg = badgeSvgRef.current;
    const eyebrow  = eyebrowRef.current;
    const tagline  = taglineRef.current;

    if (!screen || !bowl || !wordmark || !badge || !badgeSvg || !eyebrow || !tagline) return;

    // Respect prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTimeout(() => {
        screen.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
        setTimeout(() => setMounted(false), 420);
      }, 600);
      return;
    }

    const ease = (duration: number, delay: number) => ({
      duration,
      delay,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'forwards' as const,
    });

    // ── Phase 1: Bowl bounces in ──
    bowl.animate(
      [
        { opacity: 0, transform: 'translateY(-110%) scale(0.5)' },
        { opacity: 1, transform: 'translateY(5%) scale(1.07)',   offset: 0.62 },
        { opacity: 1, transform: 'translateY(-2%) scale(0.97)',  offset: 0.78 },
        { opacity: 1, transform: 'translateY(1%) scale(1.01)',   offset: 0.90 },
        { opacity: 1, transform: 'translateY(0) scale(1)' },
      ],
      { duration: 700, delay: 200, easing: 'ease-out', fill: 'forwards' }
    );

    // ── Phase 1 exit: Bowl pops away ──
    setTimeout(() => {
      bowl.animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.05) rotate(15deg)' },
        ],
        { duration: 300, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' }
      );
    }, 1400);

    // ── Phase 2: "nutravoe" orbits as a whole word ──
    // The orbit centre sits 45px below the wordmark's natural resting position
    // (roughly the middle of the eyebrow+tagline block that will appear below it).
    // Radius 90px, 2 full clockwise revolutions starting & ending at the top.
    // At the top of the orbit the word is 45px above centre → translate(0, -45px).
    const R  = 90;   // orbit radius (px)
    const CY = 45;   // how far below natural position the orbit centre is
    const REVOLUTIONS = 2;
    const ORBIT_START    = 1750;  // ms after mount
    const ORBIT_DURATION = 2400;  // ms for the full orbit (2 revolutions)
    const SETTLE_DURATION = 500;  // ms to drift back to natural position

    // Build orbit keyframes — 48 steps for smooth circular motion
    const N = 48;
    const orbitKF = Array.from({ length: N + 1 }, (_, i) => {
      const t     = i / N;
      const angle = -Math.PI / 2 + t * REVOLUTIONS * 2 * Math.PI; // top → clockwise
      return {
        opacity: 1,
        transform: `translate(${R * Math.cos(angle)}px, ${CY + R * Math.sin(angle)}px)`,
        offset: t,
      };
    });

    // Flash wordmark visible at start of orbit (at top of circle)
    wordmark.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 150, delay: ORBIT_START, fill: 'forwards' }
    );

    // Orbit — linear so the speed is constant around the circle
    wordmark.animate(orbitKF, {
      duration: ORBIT_DURATION,
      delay: ORBIT_START,
      easing: 'linear',
      fill: 'forwards',
    });

    // After orbit ends, word is back at top of circle (0, CY - R) = (0, -45px).
    // Settle it down into its natural centred position.
    wordmark.animate(
      [
        { transform: `translate(0px, ${CY - R}px)` },
        { transform: 'translate(0px, 0px)' },
      ],
      ease(SETTLE_DURATION, ORBIT_START + ORBIT_DURATION)
    );

    // ── Phase 3: Eyebrow + tagline rise in after wordmark settles ──
    const TEXT_START = ORBIT_START + ORBIT_DURATION + SETTLE_DURATION;

    eyebrow.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      ease(480, TEXT_START + 100)
    );
    tagline.animate(
      [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
      ease(520, TEXT_START + 380)
    );

    // ── Phase 4: Circular badge fades in ──
    setTimeout(() => {
      badge.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'forwards' });
      badgeSvg.style.animation = 'intro-badge-spin 16s linear infinite';
    }, TEXT_START + 700);

    // ── Exit: 2 s after everything is visible, overlay slides up ──
    const EXIT_AT = TEXT_START + 700 + 500 + 2000; // badge fully in + 2s hold
    setTimeout(() => {
      screen.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-102%)' }],
        { duration: 850, easing: 'cubic-bezier(0.76, 0, 0.24, 1)', fill: 'forwards' }
      );
      setTimeout(() => setMounted(false), 870);
    }, EXIT_AT);
  }

  if (!mounted) return null;

  return (
    <div
      ref={screenRef}
      className="fixed inset-0 z-[9999] bg-cream flex items-center justify-center overflow-hidden"
      aria-hidden="true"
    >
      {/* Phase 1: Sketch bowl */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <svg
          ref={bowlRef}
          viewBox="0 0 220 190"
          xmlns="http://www.w3.org/2000/svg"
          className="w-[min(200px,22vw)]"
          style={{ opacity: 0 }}
        >
          <path className="sk-b"  d="M 22 78 Q 20 152 110 168 Q 200 152 198 78 Z" />
          <path className="sk-r"  d="M 16 76 Q 110 95 204 76 Q 110 58 16 76 Z" />
          <path className="sk-s"  d="M 38 80 Q 110 97 182 80 Q 110 64 38 80 Z" />
          <path className="sk-t"  d="M 65 73 Q 72 63 80 68 Q 75 76 65 73 Z" />
          <path className="sk-t"  d="M 88 68 Q 96 58 104 64 Q 99 73 88 68 Z" />
          <path className="sk-t"  d="M 118 69 Q 126 59 133 65 Q 128 74 118 69 Z" />
          <path className="sk-t"  d="M 140 73 Q 148 63 155 68 Q 150 77 140 73 Z" />
          <path className="sk-d"  d="M 68 77 Q 90 64 110 72 Q 130 80 152 67 Q 162 60 170 74" />
          <circle className="sk-dt" cx="97"  cy="70" r="4" />
          <circle className="sk-dt" cx="112" cy="67" r="4" />
          <circle className="sk-dt" cx="126" cy="71" r="4" />
          <path className="sk-sh" d="M 42 110 Q 110 126 178 110" />
          <path className="sk-sh" d="M 32 130 Q 110 146 188 130" />
          <path className="sk-sh" d="M 40 150 Q 110 163 180 150" />
        </svg>
      </div>

      {/* Phase 2 + 3: Brand text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">

        {/* Wordmark — orbits as one unit, then settles here */}
        <div
          ref={wordmarkRef}
          className="font-display font-light text-ink"
          style={{
            fontSize: 'clamp(36px, 5vw, 68px)',
            letterSpacing: '0.12em',
            opacity: 0,
            willChange: 'transform',
          }}
        >
          nutravoe
        </div>

        <p
          ref={eyebrowRef}
          className="font-body text-[10px] tracking-[0.24em] uppercase text-stone"
          style={{ opacity: 0 }}
        >
          Bangalore&rsquo;s morning ritual
        </p>

        <p
          ref={taglineRef}
          className="font-display italic text-ink"
          style={{ fontSize: 'clamp(16px, 2.2vw, 28px)', opacity: 0 }}
        >
          Good mornings,{' '}
          <span className="text-sage">delivered.</span>
        </p>
      </div>

      {/* Circular spinning badge — bottom-right */}
      <div
        ref={badgeRef}
        className="absolute bottom-[9%] right-[7%]"
        style={{ width: 'clamp(72px, 9vw, 100px)', opacity: 0 }}
      >
        <svg
          ref={badgeSvgRef}
          viewBox="0 0 110 110"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full"
        >
          <defs>
            <path
              id="intro-circle-path"
              d="M 55,55 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0"
            />
          </defs>
          <text fontFamily="var(--font-body)" fontSize="10" fill="#B0A090" letterSpacing="1.6">
            <textPath href="#intro-circle-path">
              FRESH · PROBIOTIC · DELIVERED ·{' '}
            </textPath>
          </text>
        </svg>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-sage" />
      </div>
    </div>
  );
}
