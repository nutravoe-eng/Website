// Reusable delivery info marquee — place below the hero on the home page
// and at the top of the cart page (above cart items).
// Animation defined in styles/globals.css as @keyframes marquee.

const ITEMS = [
  { icon: "🌅", text: "Want delivery between 7–10 AM? Place your order before 11 PM the night before" },
  { icon: "⚡", text: "Order after 9 AM and get same-day delivery — we only need 2 hours" },
  { icon: "🚚", text: "We deliver across Bangalore daily, any time between 7 AM and 9 PM" },
];

interface DeliveryMarqueeProps {
  /** "dark" for use on the home page (hero context), "light" for the cart / content pages */
  variant?: "dark" | "light";
}

export default function DeliveryMarquee({ variant = "light" }: DeliveryMarqueeProps) {
  const isDark = variant === "dark";

  // Warm brown glass — matches homepage hero trust strip (not flat charcoal)
  const darkBar = "rgba(45,36,26,0.78)";

  return (
    <div
      className={`relative overflow-hidden border-y ${
        isDark
          ? "border-white/[0.12] bg-[rgba(45,36,26,0.78)] backdrop-blur-md"
          : "border-black/[0.06] bg-[#F5F3EF]"
      }`}
      aria-label="Delivery information"
    >
      {/* Fade masks on the edges */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-20 z-10"
        style={{
          background: isDark
            ? `linear-gradient(to right, ${darkBar}, transparent)`
            : "linear-gradient(to right, #F5F3EF, transparent)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-20 z-10"
        style={{
          background: isDark
            ? `linear-gradient(to left, ${darkBar}, transparent)`
            : "linear-gradient(to left, #F5F3EF, transparent)",
        }}
      />

      {/* Scrolling track — duplicated once for seamless loop (-50% translate in keyframe) */}
      <div
        className="flex w-max py-3"
        style={{ animation: "marquee 28s linear infinite" }}
      >
        {[...ITEMS, ...ITEMS].map((item, i) => (
          <span
            key={i}
            className={`flex items-center gap-2 px-8 font-body text-[12px] tracking-wide shrink-0 ${
              isDark
                ? "text-sage-light [text-shadow:0_1px_3px_rgba(0,0,0,0.35)]"
                : "text-stone"
            }`}
          >
            <span className="text-[14px]" aria-hidden="true">{item.icon}</span>
            {item.text}
            <span
              className={`mx-4 text-[10px] ${
                isDark ? "text-sage-dark/55" : "text-black/15"
              }`}
            >
              ◆
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
