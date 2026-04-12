'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

const CHARS = ['n', 'u', 't', 'r', 'a', 'v', 'o', 'e'];

export default function IntroAnimation() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  const screenRef          = useRef<HTMLDivElement>(null);
  const bowlRef            = useRef<SVGSVGElement>(null);
  const badgeRef           = useRef<HTMLDivElement>(null);
  const badgeSvgRef        = useRef<SVGSVGElement>(null);
  const eyebrowRef         = useRef<HTMLParagraphElement>(null);
  const taglineRef         = useRef<HTMLParagraphElement>(null);
  // Snake segments (orbit phase)
  const snakeRefs          = useRef<(HTMLSpanElement | null)[]>([]);
  // Wordmark letters (typewriter phase)
  const wordmarkLetterRefs = useRef<(HTMLSpanElement | null)[]>([]);

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
    const badge    = badgeRef.current;
    const badgeSvg = badgeSvgRef.current;
    const eyebrow  = eyebrowRef.current;
    const tagline  = taglineRef.current;

    if (!screen || !bowl || !badge || !badgeSvg || !eyebrow || !tagline) return;

    // Reduced-motion: brief fade and done
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

    // Bowl pops away
    setTimeout(() => {
      bowl.animate(
        [
          { opacity: 1, transform: 'scale(1)' },
          { opacity: 0, transform: 'scale(0.05) rotate(15deg)' },
        ],
        { duration: 300, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' }
      );
    }, 1400);

    // ── Phase 2a: Snake orbit ──
    // Each letter follows the one before it with SNAKE_GAP ms delay.
    // N is the head. All letters rotate to stay tangent to the circle
    // (α radians swept = α degrees rotation) — the "toppling" effect.
    //
    // Coordinate system (letter centred at screen centre):
    //   x =  R · sin(α)          (right at α=π/2)
    //   y = -R · cos(α) + CY     (top at α=0, starts CY above centre)
    //   rotation = α in degrees
    //
    const R          = 95;   // orbit radius px
    const CY         = 28;   // orbit centre is CY px below screen centre
    const SNAKE_GAP  = 90;   // ms between each letter starting
    const ORBIT_START    = 1750;
    const ORBIT_DURATION = 1700;
    const N_FRAMES       = 60;  // keyframe resolution

    // Build the shared circular-path keyframes — NO rotation so letters stay
    // upright and readable as they travel around the circle.
    const circleKF = Array.from({ length: N_FRAMES + 1 }, (_, i) => {
      const t     = i / N_FRAMES;
      const alpha = t * 2 * Math.PI;   // 0 → 2π (one full loop)
      const x     = R * Math.sin(alpha);
      const y     = -R * Math.cos(alpha) + CY;
      return {
        opacity: 1,
        transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
        offset: t,
      };
    });

    // Each letter orbits once (staggered), then fades out individually the
    // moment it finishes — no pile-up, no overlap at the end position.
    snakeRefs.current.forEach((el, i) => {
      if (!el) return;
      const letterDelay = ORBIT_START + i * SNAKE_GAP;

      // Orbit
      el.animate(circleKF, {
        duration: ORBIT_DURATION,
        delay: letterDelay,
        easing: 'linear',
        fill: 'forwards',
      });

      // Fade out as soon as this letter's loop is done
      el.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 150, delay: letterDelay + ORBIT_DURATION, fill: 'forwards' }
      );
    });

    // Typewriter starts after the last letter has faded out
    const LAST_DONE = ORBIT_START + (CHARS.length - 1) * SNAKE_GAP + ORBIT_DURATION + 150;

    // ── Phase 2b: Typewriter reveal on the wordmark ──
    const TYPEWRITER_START = LAST_DONE + 220;
    const TYPEWRITER_GAP   = 85;  // ms between each letter appearing
    wordmarkLetterRefs.current.forEach((el, i) => {
      if (!el) return;
      el.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: 60, delay: TYPEWRITER_START + i * TYPEWRITER_GAP, fill: 'forwards' }
      );
    });

    const TYPEWRITER_DONE = TYPEWRITER_START + (CHARS.length - 1) * TYPEWRITER_GAP + 60;

    // ── Phase 3: Eyebrow + tagline rise in ──
    eyebrow.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      ease(480, TYPEWRITER_DONE + 120)
    );
    tagline.animate(
      [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
      ease(520, TYPEWRITER_DONE + 400)
    );

    // ── Phase 4: Circular badge ──
    const BADGE_START = TYPEWRITER_DONE + 700;
    setTimeout(() => {
      badge.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'forwards' });
      badgeSvg.style.animation = 'intro-badge-spin 16s linear infinite';
    }, BADGE_START);

    // ── Exit: 2 s hold after badge visible, then slide up ──
    const EXIT_AT = BADGE_START + 500 + 2000;
    setTimeout(() => {
      screen.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-102%)' }],
        { duration: 850, easing: 'cubic-bezier(0.76, 0, 0.24, 1)', fill: 'forwards' }
      );
      setTimeout(() => setMounted(false), 870);
    }, EXIT_AT);
  }

  if (!mounted) return null;

  // Shared style for both the snake letters and the wordmark letters
  const letterStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontWeight: 300,
    fontSize: 'clamp(36px, 5vw, 68px)',
    letterSpacing: '0.12em',
    color: '#2C2C2C',
  };

  return (
    <div
      ref={screenRef}
      className="fixed inset-0 z-[9999] bg-cream overflow-hidden"
      aria-hidden="true"
    >

      {/* ── Phase 1: Sketch bowl ── */}
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

      {/* ── Phase 2a: Snake letters (orbit) ──
          Each span is absolutely positioned at centre; the animation
          translates it along the circular path and rotates it to match
          the tangent — the "toppling" effect. */}
      <div className="absolute inset-0 pointer-events-none">
        {CHARS.map((char, i) => (
          <span
            key={`snake-${i}`}
            ref={el => { snakeRefs.current[i] = el; }}
            style={{
              ...letterStyle,
              position: 'absolute',
              left: '50%',
              top: '50%',
              opacity: 0,
              willChange: 'transform',
              // transform-origin stays at centre of letter
              transformOrigin: 'center center',
            }}
          >
            {char}
          </span>
        ))}
      </div>

      {/* ── Phase 2b + 3: Brand text (typewriter wordmark + eyebrow + tagline) ── */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">

        {/* Wordmark: letters appear one-by-one (typewriter) */}
        <div className="flex items-baseline">
          {CHARS.map((char, i) => (
            <span
              key={`wm-${i}`}
              ref={el => { wordmarkLetterRefs.current[i] = el; }}
              style={{ ...letterStyle, opacity: 0, display: 'inline-block' }}
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

      {/* ── Circular spinning badge — bottom-right ── */}
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
