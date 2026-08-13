"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Bowl } from "@/types";
import HomeMenuCard from "@/components/HomeMenuCard";

const AUTO_ADVANCE_MS = 5500;

type HomeMenuCarouselProps = {
  bowls: Bowl[];
};

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === "left" ? <path d="m15 18-6-6 6-6" /> : <path d="m9 18 6-6-6-6" />}
    </svg>
  );
}

export default function HomeMenuCarousel({ bowls }: HomeMenuCarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(0);
  const pauseAutoRef = useRef(false);
  const inViewRef = useRef(true);

  const goTo = useCallback(
    (index: number) => {
      const track = trackRef.current;
      if (!track || bowls.length === 0) return;

      const nextIndex = ((index % bowls.length) + bowls.length) % bowls.length;
      const target = track.children[nextIndex] as HTMLElement | undefined;
      if (!target) return;

      // Scroll only the carousel track — never the page.
      track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: "smooth" });
      activeIndexRef.current = nextIndex;
    },
    [bowls.length],
  );

  const scrollByStep = useCallback(
    (direction: "left" | "right") => {
      pauseAutoRef.current = true;
      goTo(activeIndexRef.current + (direction === "right" ? 1 : -1));
      window.setTimeout(() => {
        pauseAutoRef.current = false;
      }, AUTO_ADVANCE_MS);
    },
    [goTo],
  );

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    const syncActiveIndex = () => {
      const children = Array.from(track.children) as HTMLElement[];
      if (children.length === 0) return;

      const trackLeft = track.scrollLeft;
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      children.forEach((child, index) => {
        const distance = Math.abs(child.offsetLeft - track.offsetLeft - trackLeft);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });

      activeIndexRef.current = closestIndex;
    };

    syncActiveIndex();
    track.addEventListener("scroll", syncActiveIndex, { passive: true });
    window.addEventListener("resize", syncActiveIndex);

    return () => {
      track.removeEventListener("scroll", syncActiveIndex);
      window.removeEventListener("resize", syncActiveIndex);
    };
  }, [bowls.length]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry?.isIntersecting ?? false;
      },
      { threshold: 0.2 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (bowls.length <= 1) return;

    const intervalId = window.setInterval(() => {
      if (pauseAutoRef.current || !inViewRef.current) return;
      goTo(activeIndexRef.current + 1);
    }, AUTO_ADVANCE_MS);

    return () => window.clearInterval(intervalId);
  }, [bowls.length, goTo]);

  if (bowls.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className="group/carousel relative"
      onMouseEnter={() => {
        pauseAutoRef.current = true;
      }}
      onMouseLeave={() => {
        pauseAutoRef.current = false;
      }}
    >
      <button
        type="button"
        onClick={() => scrollByStep("left")}
        className="absolute left-1 top-[84px] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-ink shadow-[0_8px_24px_rgba(0,0,0,0.12)] opacity-0 pointer-events-none transition-opacity duration-200 hover:border-ink/20 hover:bg-cream md:left-2 md:top-[110px] md:flex md:h-11 md:w-11 md:group-hover/carousel:opacity-100 md:group-hover/carousel:pointer-events-auto md:focus-visible:opacity-100 md:focus-visible:pointer-events-auto"
        aria-label="Show previous bowls"
      >
        <ChevronIcon direction="left" />
      </button>

      <button
        type="button"
        onClick={() => scrollByStep("right")}
        className="absolute right-1 top-[84px] z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-black/10 bg-white text-ink shadow-[0_8px_24px_rgba(0,0,0,0.12)] opacity-0 pointer-events-none transition-opacity duration-200 hover:border-ink/20 hover:bg-cream md:right-2 md:top-[110px] md:flex md:h-11 md:w-11 md:group-hover/carousel:opacity-100 md:group-hover/carousel:pointer-events-auto md:focus-visible:opacity-100 md:focus-visible:pointer-events-auto"
        aria-label="Show next bowls"
      >
        <ChevronIcon direction="right" />
      </button>

      <div
        ref={trackRef}
        className="-mx-5 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-5 pb-1 md:-mx-6 md:gap-5 md:px-6 lg:-mx-16 lg:px-16 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {bowls.map((bowl) => (
          <HomeMenuCard key={bowl._id} bowl={bowl} />
        ))}
      </div>
    </div>
  );
}
