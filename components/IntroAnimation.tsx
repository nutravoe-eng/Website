'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function IntroAnimation() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  const screenRef   = useRef<HTMLDivElement>(null);
  const bowlRef     = useRef<SVGSVGElement>(null);
  const badgeRef    = useRef<HTMLDivElement>(null);
  const badgeSvgRef = useRef<SVGSVGElement>(null);
  const eyebrowRef  = useRef<HTMLParagraphElement>(null);
  const taglineRef  = useRef<HTMLParagraphElement>(null);
  const letterRefs  = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
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
    const badge    = badgeRef.current;
    const badgeSvg = badgeSvgRef.current;
    const eyebrow  = eyebrowRef.current;
    const tagline  = taglineRef.current;
    const letters  = letterRefs.current;

    if (!screen || !bowl || !badge || !badgeSvg || !eyebrow || !tagline) return;

    // Respect prefers-reduced-motion
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTimeout(() => {
        screen.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' });
        setTimeout(() => setMounted(false), 420);
      }, 600);
      return;
    }

    // Circle origins for 8 letters (radius 130px, starting top, clockwise)
    const origins: [number, number][] = [
      [0,    -130],
      [92,   -92 ],
      [130,   0  ],
      [92,    92 ],
      [0,    130 ],
      [-92,   92 ],
      [-130,  0  ],
      [-92,  -92 ],
    ];

    const ease = (duration: number, delay: number) => ({
      duration,
      delay,
      easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'forwards' as const,
    });

    // ── Phase 1: Bowl bounces in from above ──
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
        { duration: 320, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' }
      );
    }, 1650);

    // ── Phase 2: Letters spiral in from circle ──
    letters.forEach((el, i) => {
      if (!el) return;
      const [tx, ty] = origins[i];
      el.animate(
        [
          {
            opacity: 0,
            transform: `translate(${tx}px, ${ty}px) scale(0.3) rotate(${(i / 8) * 360}deg)`,
          },
          {
            opacity: 1,
            transform: 'translate(0, 0) scale(1) rotate(0deg)',
          },
        ],
        ease(520, 2150 + i * 85)
      );
    });

    // ── Phase 3: Eyebrow + tagline rise up ──
    eyebrow.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      ease(480, 3350)
    );
    tagline.animate(
      [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
      ease(520, 3680)
    );

    // ── Phase 4: Circular badge fades in + spins ──
    setTimeout(() => {
      badge.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'forwards' });
      badgeSvg.style.animation = 'intro-badge-spin 16s linear infinite';
    }, 3950);

    // ── Exit: Overlay slides upward to reveal homepage ──
    setTimeout(() => {
      screen.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-102%)' }],
        { duration: 850, easing: 'cubic-bezier(0.76, 0, 0.24, 1)', fill: 'forwards' }
      );
      setTimeout(() => setMounted(false), 870);
    }, 5100);
  }

  if (!mounted) return null;

  return (
    <div
      ref={screenRef}
      className="fixed inset-0 z-[9999] bg-cream flex items-center justify-center overflow-hidden"
      aria-hidden="true"
    >
      {/* Phase 1: Sketch bowl — centre of screen */}
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

      {/* Phase 2: Brand text — centred */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
        {/* Wordmark: each letter arrives from its own point on the circle */}
        <div className="flex items-baseline">
          {['n', 'u', 't', 'r', 'a', 'v', 'o', 'e'].map((char, i) => (
            <span
              key={i}
              ref={el => { letterRefs.current[i] = el; }}
              className="font-display font-light text-ink"
              style={{
                fontSize: 'clamp(36px, 5vw, 68px)',
                letterSpacing: '0.12em',
                opacity: 0,
                display: 'inline-block',
              }}
            >
              {char}
            </span>
          ))}
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
          <text
            fontFamily="var(--font-body)"
            fontSize="10"
            fill="#B0A090"
            letterSpacing="1.6"
          >
            <textPath href="#intro-circle-path">
              FRESH · PROBIOTIC · DELIVERED ·{' '}
            </textPath>
          </text>
        </svg>
        {/* Centre dot */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-sage" />
      </div>
    </div>
  );
}
