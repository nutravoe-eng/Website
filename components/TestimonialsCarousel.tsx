'use client';

interface Review {
  name: string;
  initials: string;
  avatarColor: string;
  stars: number;
  text: string;
}

const reviews: Review[] = [
  {
    name: "Priya Raghunathan",
    initials: "PR",
    avatarColor: "#7D9B76",
    stars: 5,
    text: "Ordered the Mango Chia bowl for the first time last week and honestly I don't think I can go back to my old breakfast 😭 It's so fresh and fills me up till lunch!",
  },
  {
    name: "Karthik Balaji",
    initials: "KB",
    avatarColor: "#C4714A",
    stars: 5,
    text: "I'm a gym person so I was sceptical but the protein content is legit. The berry bowl is my go-to now, delivered right before my 8am workout. Zero complaints.",
  },
  {
    name: "Ananya Menon",
    initials: "AM",
    avatarColor: "#4E6B49",
    stars: 4,
    text: "Tastes like something you'd get at a fancy cafe but at a much more reasonable price. The packaging is also super clean, no leaks even when I shake my bag 😄",
  },
  {
    name: "Rohit Sharma",
    initials: "RS",
    avatarColor: "#8C4A2F",
    stars: 5,
    text: "My wife ordered for both of us and now it's become a whole morning ritual. We fight over the last mango one lol. Great stuff Harshita, keep it up!",
  },
  {
    name: "Deepika Iyer",
    initials: "DI",
    avatarColor: "#7D9B76",
    stars: 4,
    text: "Super convenient for a WFH person like me. I used to skip breakfast all the time but now I actually look forward to it. The fig and honey one is incredible 🍯",
  },
  {
    name: "Aditya Krishnamurthy",
    initials: "AK",
    avatarColor: "#9A9590",
    stars: 5,
    text: "Honestly this is one of the best things I've subscribed to in Bangalore. Fresh, no chemicals, no weird aftertaste. And Harshita replies on WhatsApp instantly which is so nice.",
  },
  {
    name: "Shruti Nambiar",
    initials: "SN",
    avatarColor: "#C4714A",
    stars: 5,
    text: "I've been ordering every weekday for 2 months now. My skin and energy have genuinely improved, I'm not even joking. The probiotic base must be doing something right ✨",
  },
];

function StarRating({ count }: { count: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${count} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill={i < count ? "#C4714A" : "none"}
          stroke={i < count ? "#C4714A" : "#9A9590"}
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      ))}
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="#25D366"
      aria-hidden="true"
    >
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function ReviewCard({ review }: { review: Review }) {
  return (
    <div
      className="flex-shrink-0 w-[300px] sm:w-[320px] bg-cream rounded-2xl shadow-sm border border-sage/10 border-l-4 px-5 py-4 mx-3 flex flex-col gap-3"
      style={{ borderLeftColor: "rgba(125, 155, 118, 0.35)" }}
      aria-label={`Review by ${review.name}`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* Initials avatar */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: review.avatarColor }}
            aria-hidden="true"
          >
            <span className="font-body text-[11px] font-medium text-white leading-none">
              {review.initials}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-body text-[13px] font-medium text-ink leading-tight">
              {review.name}
            </span>
            <StarRating count={review.stars} />
          </div>
        </div>
        <WhatsAppIcon />
      </div>

      {/* Review text */}
      <p className="font-body text-[13px] leading-relaxed text-stone italic">
        "{review.text}"
      </p>
    </div>
  );
}

// Triple the array so the CSS marquee loop is seamless
const tripled = [...reviews, ...reviews, ...reviews];

export default function TestimonialsCarousel() {
  return (
    <section className="bg-beige py-20 overflow-hidden" aria-label="Customer testimonials">
      {/* Section header */}
      <div className="max-w-7xl mx-auto px-6 lg:px-16 mb-14 text-center">
        <p className="section-eyebrow text-terracotta mb-4">
          What our customers say
        </p>
        <h2
          className="font-display text-ink"
          style={{ fontSize: "clamp(36px, 3.5vw, 52px)", lineHeight: "1.15" }}
        >
          Real people.{" "}
          <em className="text-terracotta">Real stories.</em>
        </h2>
      </div>

      {/* Marquee track — full-width, clips at edges */}
      <div
        className="relative w-full"
        aria-hidden="true"
      >
        {/* Left fade */}
        <div
          className="pointer-events-none absolute left-0 top-0 bottom-0 w-24 z-10"
          style={{
            background: "linear-gradient(to right, #E8E3DA, transparent)",
          }}
        />
        {/* Right fade */}
        <div
          className="pointer-events-none absolute right-0 top-0 bottom-0 w-24 z-10"
          style={{
            background: "linear-gradient(to left, #E8E3DA, transparent)",
          }}
        />

        {/* Scrolling track */}
        <div
          className="flex motion-reduce:animate-none"
          style={{
            animation: "marquee 45s linear infinite",
            width: "max-content",
          }}
        >
          {tripled.map((review, i) => (
            <ReviewCard key={`${review.name}-${i}`} review={review} />
          ))}
        </div>
      </div>

      {/* Screen-reader accessible list (hidden visually) */}
      <ul className="sr-only">
        {reviews.map((review) => (
          <li key={review.name}>
            <strong>{review.name}</strong>, {review.stars} stars:{" "}
            {review.text}
          </li>
        ))}
      </ul>
    </section>
  );
}
