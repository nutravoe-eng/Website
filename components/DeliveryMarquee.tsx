// Reusable delivery info marquee — place below the hero on the home page
// and at the top of the cart page (above cart items).
// Pure CSS infinite scroll, no JS, respects prefers-reduced-motion.

const ITEMS = [
  { icon: "🌅", text: "7–10 AM deliveries if ordered before 11 PM" },
  { icon: "⚡", text: "Same-day delivery with 2 hours' notice after 9 AM" },
  { icon: "🚚", text: "Delivered 7 AM–9 PM across Bangalore" },
  { icon: "🌅", text: "7–10 AM deliveries if ordered before 11 PM" },
  { icon: "⚡", text: "Same-day delivery with 2 hours' notice after 9 AM" },
  { icon: "🚚", text: "Delivered 7 AM–9 PM across Bangalore" },
];

interface DeliveryMarqueeProps {
  /** "dark" for use on the home page (hero context), "light" for the cart / content pages */
  variant?: "dark" | "light";
}

export default function DeliveryMarquee({ variant = "light" }: DeliveryMarqueeProps) {
  const isDark = variant === "dark";

  return (
    <div
      className={`relative overflow-hidden border-y ${
        isDark
          ? "border-white/[0.08] bg-[rgba(28,28,26,0.72)] backdrop-blur-md"
          : "border-black/[0.06] bg-[#F5F3EF]"
      }`}
      aria-label="Delivery information"
    >
      {/* Fade masks on the edges */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-20 z-10"
        style={{
          background: isDark
            ? "linear-gradient(to right, rgba(28,28,26,0.75), transparent)"
            : "linear-gradient(to right, #F5F3EF, transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-20 z-10"
        style={{
          background: isDark
            ? "linear-gradient(to left, rgba(28,28,26,0.75), transparent)"
            : "linear-gradient(to left, #F5F3EF, transparent)",
        }}
      />

      {/* The scrolling track — duplicated for seamless loop */}
      <div className="flex w-max animate-marquee py-3">
        {[...ITEMS, ...ITEMS].map((item, i) => (
          <span
            key={i}
            className={`flex items-center gap-2 px-8 font-body text-[12px] tracking-wide shrink-0 ${
              isDark ? "text-white/75" : "text-stone"
            }`}
          >
            <span className="text-[14px]" aria-hidden="true">{item.icon}</span>
            {item.text}
            <span className={`mx-4 text-[10px] ${isDark ? "text-white/25" : "text-black/15"}`}>◆</span>
          </span>
        ))}
      </div>

      <style jsx>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee 28s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-marquee { animation: none; }
        }
      `}</style>
    </div>
  );
}
