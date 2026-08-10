"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

export default function HeroImageScroller({
  images,
  intervalMs = 3000,
  priority = false,
}: {
  images: { src: string; alt: string }[];
  intervalMs?: number;
  priority?: boolean;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (images.length <= 1) return;
    const timer = setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [images.length, intervalMs]);

  return (
    <div className="relative h-full w-full">
      {images.map((img, i) => (
        <div
          key={img.src}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            i === activeIndex ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={img.src}
            alt={img.alt}
            fill
            priority={priority && i === 0}
            className="h-full w-full object-cover"
            sizes="100vw"
          />
        </div>
      ))}
    </div>
  );
}
