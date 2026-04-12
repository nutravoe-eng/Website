# Intro Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-screen intro animation that plays once per session when users land on the Nutravoe homepage — a sketch bowl bounces in then disappears, "nutravoe" letters spiral in from a circle, supporting text fades up, a circular spinning badge appears, then the whole screen slides upward to reveal the homepage.

**Architecture:** A single `IntroAnimation` client component renders a fixed full-screen overlay on top of everything. It uses the Web Animations API (no extra libraries) to sequence phases via `setTimeout`. It fires once per browser session via `sessionStorage`, then unmounts cleanly. The component is mounted in `layout.tsx` so it is available site-wide but only activates on the homepage.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS, Web Animations API, SVG (inline sketch bowl)

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `components/IntroAnimation.tsx` | All animation logic, SVG sketch bowl, circular badge |
| Modify | `app/layout.tsx` | Mount `<IntroAnimation />` inside the body, above Navbar |
| Modify | `styles/globals.css` | Add `@keyframes intro-spin` for badge rotation |

---

### Task 1: Create the IntroAnimation component (static structure, no animation yet)

**Files:**
- Create: `components/IntroAnimation.tsx`

- [ ] **Step 1: Create the file with static structure**

Create `website/components/IntroAnimation.tsx`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';

export default function IntroAnimation() {
  const [mounted, setMounted] = useState(false);
  const screenRef = useRef<HTMLDivElement>(null);
  const bowlRef = useRef<SVGSVGElement>(null);
  const badgeRef = useRef<HTMLDivElement>(null);
  const badgeSvgRef = useRef<SVGSVGElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);
  const letterRefs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    if (sessionStorage.getItem('nv-intro-shown')) return;
    sessionStorage.setItem('nv-intro-shown', '1');
    setMounted(true);
  }, []);

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
          {/* Outer bowl body */}
          <path className="sk-b" d="M 22 78 Q 20 152 110 168 Q 200 152 198 78 Z" />
          {/* Rim */}
          <path className="sk-r" d="M 16 76 Q 110 95 204 76 Q 110 58 16 76 Z" />
          {/* Yogurt surface */}
          <path className="sk-s" d="M 38 80 Q 110 97 182 80 Q 110 64 38 80 Z" />
          {/* Granola */}
          <path className="sk-t" d="M 65 73 Q 72 63 80 68 Q 75 76 65 73 Z" />
          <path className="sk-t" d="M 88 68 Q 96 58 104 64 Q 99 73 88 68 Z" />
          <path className="sk-t" d="M 118 69 Q 126 59 133 65 Q 128 74 118 69 Z" />
          <path className="sk-t" d="M 140 73 Q 148 63 155 68 Q 150 77 140 73 Z" />
          {/* Drizzle */}
          <path className="sk-d" d="M 68 77 Q 90 64 110 72 Q 130 80 152 67 Q 162 60 170 74" />
          {/* Berry dots */}
          <circle className="sk-dt" cx="97"  cy="70" r="4" />
          <circle className="sk-dt" cx="112" cy="67" r="4" />
          <circle className="sk-dt" cx="126" cy="71" r="4" />
          {/* Shading */}
          <path className="sk-sh" d="M 42 110 Q 110 126 178 110" />
          <path className="sk-sh" d="M 32 130 Q 110 146 188 130" />
          <path className="sk-sh" d="M 40 150 Q 110 163 180 150" />
        </svg>
      </div>

      {/* Phase 2: Brand text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
        {/* Wordmark — each letter animated individually */}
        <div className="flex items-baseline">
          {['n','u','t','r','a','v','o','e'].map((char, i) => (
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
          Good mornings, <span className="text-sage">delivered.</span>
        </p>
      </div>

      {/* Circular spinning badge */}
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
          <text className="font-body" style={{ fontSize: 10, fill: '#B0A090', letterSpacing: '1.6px' }}>
            <textPath href="#intro-circle-path">
              FRESH · PROBIOTIC · DELIVERED ·{' '}
            </textPath>
          </text>
        </svg>
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-sage"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add SVG sketch CSS classes to `styles/globals.css`**

Add this block at the end of `globals.css` (before the last closing brace if inside a layer, or at the file end):

```css
/* Intro animation — sketch bowl styles */
.sk-b, .sk-r, .sk-s, .sk-t, .sk-d, .sk-sh {
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.sk-b  { stroke: #7B6A56; stroke-width: 2;   }
.sk-r  { stroke: #7B6A56; stroke-width: 2.2; }
.sk-s  { stroke: #9A8878; stroke-width: 1.2; }
.sk-t  { stroke: #7B6A56; stroke-width: 1.2; }
.sk-d  { stroke: #C4714A; stroke-width: 1.4; }
.sk-sh { stroke: #9A8878; stroke-width: 0.8; opacity: 0.35; }
.sk-dt { fill: #C4A574;   stroke: none;      }

/* Badge spin */
@keyframes intro-badge-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
```

- [ ] **Step 3: Mount in layout.tsx**

Open `website/app/layout.tsx`. Import and add the component just before `<Navbar />`:

```tsx
import IntroAnimation from "@/components/IntroAnimation";
```

Inside the `<CartProvider>`:
```tsx
<CartProvider>
  <IntroAnimation />           {/* ← add this line */}
  <a href="#main" ...>
  ...
</CartProvider>
```

- [ ] **Step 4: Verify it renders**

Run `npm run dev` in the `website/` directory. Open http://localhost:3000. You should see a cream full-screen overlay with static (invisible, opacity-0) content. Open DevTools → Elements, confirm `div[data-fixed]` with `z-index: 9999` is present. Hard-refresh to clear sessionStorage if needed (`sessionStorage.clear()` in console).

---

### Task 2: Add the animation sequence

**Files:**
- Modify: `components/IntroAnimation.tsx` (add `runSequence` and call it in `useEffect`)

The Web Animations API is used — no library import needed. All timing is in milliseconds.

Letter positions on a circle (radius 130px), one per letter of "nutravoe" (8 letters), starting from the top and going clockwise:

| Index | Letter | Angle (°) | tx (px) | ty (px) |
|-------|--------|-----------|---------|---------|
| 0 | n | 270 | 0 | -130 |
| 1 | u | 315 | 92 | -92  |
| 2 | t | 0   | 130 | 0   |
| 3 | r | 45  | 92 | 92   |
| 4 | a | 90  | 0 | 130   |
| 5 | v | 135 | -92 | 92  |
| 6 | o | 180 | -130 | 0  |
| 7 | e | 225 | -92 | -92 |

- [ ] **Step 1: Add `runSequence` to the component**

Replace the `useEffect` block in `IntroAnimation.tsx` with this:

```tsx
useEffect(() => {
  if (sessionStorage.getItem('nv-intro-shown')) return;
  sessionStorage.setItem('nv-intro-shown', '1');
  setMounted(true);
}, []);

useEffect(() => {
  if (!mounted) return;
  runSequence();
}, [mounted]);

function runSequence() {
  const bowl      = bowlRef.current;
  const screen    = screenRef.current;
  const badge     = badgeRef.current;
  const badgeSvg  = badgeSvgRef.current;
  const eyebrow   = eyebrowRef.current;
  const tagline   = taglineRef.current;
  const letters   = letterRefs.current;

  if (!bowl || !screen || !badge || !badgeSvg || !eyebrow || !tagline) return;

  // Circle positions for each letter (radius 130)
  const origins = [
    [0,    -130],
    [92,   -92 ],
    [130,   0  ],
    [92,    92 ],
    [0,    130 ],
    [-92,   92 ],
    [-130,  0  ],
    [-92,  -92 ],
  ] as const;

  const OPTS = (duration: number, delay: number) => ({
    duration,
    delay,
    easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
    fill: 'forwards' as const,
  });

  // ── Phase 1: Bowl bounces in ──
  bowl.animate(
    [
      { opacity: 0, transform: 'translateY(-110%) scale(0.5)' },
      { opacity: 1, transform: 'translateY(5%) scale(1.07)',  offset: 0.62 },
      { opacity: 1, transform: 'translateY(-2%) scale(0.97)', offset: 0.78 },
      { opacity: 1, transform: 'translateY(1%) scale(1.01)',  offset: 0.90 },
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

  // ── Phase 2: Letters fly in from circle ──
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
      OPTS(520, 2150 + i * 85)
    );
  });

  // ── Phase 3: Eyebrow + tagline ──
  eyebrow.animate(
    [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
    OPTS(480, 3350)
  );
  tagline.animate(
    [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }],
    OPTS(520, 3680)
  );

  // ── Phase 4: Badge fades in + starts spinning ──
  setTimeout(() => {
    badge.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 500, fill: 'forwards' });
    badgeSvg.style.animation = 'intro-badge-spin 16s linear infinite';
  }, 3950);

  // ── Exit: Whole overlay slides up ──
  setTimeout(() => {
    screen.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(-102%)' }],
      {
        duration: 850,
        easing: 'cubic-bezier(0.76, 0, 0.24, 1)',
        fill: 'forwards',
      }
    );
    // Unmount after exit completes so it doesn't block interaction
    setTimeout(() => setMounted(false), 870);
  }, 5100);
}
```

- [ ] **Step 2: Add `setMounted` to the dependency-free inner scope**

Because `setMounted` is used inside `runSequence` (which is called after mount), React's closure will have it. No changes needed — `setMounted` is in scope from the component closure.

- [ ] **Step 3: Test the full sequence**

Clear sessionStorage in browser console: `sessionStorage.clear()`, then hard-refresh http://localhost:3000.

Expected sequence:
- 0.2s — cream overlay covers page, bowl drops from top with bounce
- 1.65s — bowl shrinks and disappears
- 2.15s — "n" flies in from top of circle, letters follow clockwise every 85ms
- 3.35s — eyebrow text rises up
- 3.68s — tagline rises up
- 3.95s — circular badge fades in, starts spinning
- 5.1s — cream overlay slides upward, homepage visible beneath
- ~6s — component unmounts from DOM

Reload normally (without clearing sessionStorage) — intro should NOT play again.

- [ ] **Step 4: Commit**

```bash
cd website
git add components/IntroAnimation.tsx styles/globals.css app/layout.tsx
git commit -m "feat: add intro animation — bowl bounce, letter spiral, curtain exit"
```

---

### Task 3: Mobile polish and reduced-motion support

**Files:**
- Modify: `components/IntroAnimation.tsx`

- [ ] **Step 1: Respect `prefers-reduced-motion`**

Add this at the top of `runSequence()`, before any animation calls:

```tsx
function runSequence() {
  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReduced) {
    // Skip the animation entirely — just show the overlay briefly then remove
    const screen = screenRef.current;
    if (!screen) return;
    setTimeout(() => {
      screen.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 400, fill: 'forwards' }
      );
      setTimeout(() => setMounted(false), 420);
    }, 800);
    return;
  }

  // ... rest of existing runSequence code unchanged
```

- [ ] **Step 2: Verify reduced-motion**

In Chrome DevTools → Rendering tab → check "Emulate CSS media feature prefers-reduced-motion". Hard-refresh http://localhost:3000 (after `sessionStorage.clear()`). The overlay should appear briefly and fade out without any animation.

Uncheck the emulation. Confirm full animation plays normally.

- [ ] **Step 3: Commit**

```bash
cd website
git add components/IntroAnimation.tsx
git commit -m "feat: respect prefers-reduced-motion in intro animation"
```

---

### Task 4: Only show on homepage

Currently `IntroAnimation` is in `layout.tsx` so it would show on every page if the user lands directly on `/menu`, `/about`, etc. Restrict it to the homepage.

**Files:**
- Modify: `components/IntroAnimation.tsx`

- [ ] **Step 1: Check pathname before mounting**

Add `usePathname` import and check at the top of the `useEffect`:

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

export default function IntroAnimation() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  // ... rest of refs unchanged
```

Update the first `useEffect`:

```tsx
useEffect(() => {
  if (pathname !== '/') return;                          // only homepage
  if (sessionStorage.getItem('nv-intro-shown')) return;
  sessionStorage.setItem('nv-intro-shown', '1');
  setMounted(true);
}, [pathname]);
```

- [ ] **Step 2: Test**

1. `sessionStorage.clear()` in console, navigate to http://localhost:3000 → intro plays ✓
2. `sessionStorage.clear()`, navigate to http://localhost:3000/menu directly → no intro ✓
3. From homepage after intro, navigate to /menu and back → no intro ✓

- [ ] **Step 3: Commit**

```bash
cd website
git add components/IntroAnimation.tsx
git commit -m "feat: restrict intro animation to homepage only"
```

---

### Task 5: Push to GitHub

- [ ] **Step 1: Verify clean build**

```bash
cd website
npm run build
```

Expected: build completes with no errors. Warnings about missing images or similar are acceptable.

- [ ] **Step 2: Push**

```bash
cd website
git push
```
