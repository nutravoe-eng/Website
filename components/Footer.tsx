import Link from "next/link";
import Image from "next/image";
import { getWhatsAppHref } from "@/lib/contact";

const SOCIAL_LINKS = [
  {
    href: "https://instagram.com/nutravoe",
    label: "Instagram",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2.5" y="2.5" width="19" height="19" rx="5" />
        <circle cx="12" cy="12" r="4.25" />
        <circle cx="17.4" cy="6.6" r="1" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    href: "https://x.com/nutravoe",
    label: "X",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.27l-4.91-7.48L5.48 22H2.37l7.24-8.28L1.8 2h6.43l4.44 6.78L18.9 2Zm-1.1 18h1.73L7.3 3.9H5.45L17.8 20Z" />
      </svg>
    ),
  },
  {
    href: "https://www.linkedin.com/company/nutravoe/",
    label: "LinkedIn",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M6.94 8.5H3.56V20h3.38V8.5ZM5.25 3A2.03 2.03 0 1 0 5.3 7.06 2.03 2.03 0 0 0 5.25 3ZM20.44 12.6c0-3.47-1.85-5.08-4.33-5.08-1.99 0-2.88 1.09-3.37 1.86V8.5H9.36c.05.58 0 11.5 0 11.5h3.38v-6.43c0-.34.02-.68.13-.92.27-.68.9-1.39 1.95-1.39 1.37 0 1.92 1.05 1.92 2.58V20h3.38v-7.4Z" />
      </svg>
    ),
  },
] as const;

function SocialIcons({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "justify-center gap-3" : "gap-3.5"}`}>
      {SOCIAL_LINKS.map(({ href, label, icon }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          className={`flex items-center justify-center rounded-full border border-white/10 text-[#9A9590] transition-colors duration-300 hover:border-sage hover:text-sage-light ${
            compact ? "h-8 w-8 bg-white/[0.04]" : "h-9 w-9 bg-white/[0.03]"
          }`}
        >
          {icon}
        </a>
      ))}
    </div>
  );
}

function FullFooter() {
  return (
    <footer className="bg-ink text-white">
      <div className="max-w-7xl mx-auto grid grid-cols-1 gap-8 px-6 py-10 md:grid-cols-3 lg:px-16">
        <div>
          <Link href="/" className="group mb-5 inline-flex items-center gap-3.5">
            <div className="relative h-8 w-8 transition-all duration-300 md:h-9 md:w-9">
              <Image
                src="/Nutravoe Logo.png"
                alt="Nutravoe Circular Logo"
                fill
                sizes="36px"
                className="object-contain"
              />
            </div>
            <span className="font-display text-[22px] lowercase tracking-[0.3em] font-light text-white transition-all duration-300 md:text-[26px]">
              nutravoe
            </span>
          </Link>
          <p className="max-w-xs font-body text-[13px] leading-relaxed text-[#9A9590]">
            Fresh protein yogurt bowls crafted daily and delivered to your door.
            7 AM-7 PM. Bangalore, Karnataka.
          </p>
          <div className="mt-5">
            <SocialIcons />
          </div>
        </div>

        <div>
          <h4 className="mb-5 font-body text-xs font-medium uppercase tracking-[0.18em] text-stone">
            Pages
          </h4>
          <ul className="m-0 list-none space-y-3 p-0">
            {[
              { href: "/", label: "Home" },
              { href: "/menu", label: "Menu" },
              { href: "/about", label: "About" },
              { href: "/b2b", label: "Partnerships" },
            ].map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="font-body text-sm text-[#9A9590] transition-colors duration-300 hover:text-sage-light"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="mb-5 font-body text-xs font-medium uppercase tracking-[0.18em] text-stone">
            Contact
          </h4>
          <ul className="m-0 list-none space-y-3 p-0">
            <li>
              <a
                href={getWhatsAppHref()}
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-sm text-[#9A9590] transition-colors duration-300 hover:text-sage-light"
              >
                WhatsApp Us
              </a>
            </li>
            <li>
              <a
                href="mailto:nutravoe@gmail.com"
                className="font-body text-sm text-[#9A9590] transition-colors duration-300 hover:text-sage-light"
              >
                Email Us
              </a>
            </li>
            <li>
              <Link
                href="/privacy"
                className="font-body text-sm text-[#9A9590] transition-colors duration-300 hover:text-sage-light"
              >
                Privacy Notice
              </Link>
            </li>
            <li>
              <Link
                href="/terms"
                className="font-body text-sm text-[#9A9590] transition-colors duration-300 hover:text-sage-light"
              >
                Terms & Conditions
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto flex flex-col items-center justify-between gap-2 px-6 py-6 md:flex-row lg:px-16">
          <p className="font-body text-xs text-[#706e6a]">
            Copyright {new Date().getFullYear()} Nutravoe. All rights reserved.
          </p>
          <span className="font-body text-xs tracking-wide text-sage">
            Bangalore, Karnataka
          </span>
        </div>
      </div>
    </footer>
  );
}

export default function Footer({ minimal = false }: { minimal?: boolean }) {
  if (minimal) {
    return (
      <>
        <footer className="border-t border-white/5 bg-ink text-white md:hidden">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-5 py-4 text-center">
            <p className="font-body text-[10px] tracking-wide text-[#9A9590]">
              Fresh protein yogurt bowls, made daily in Bangalore.
            </p>
            <SocialIcons compact />
            <div className="flex items-center gap-4">
              <Link href="/about" className="font-body text-[10px] text-[#9A9590] transition-colors hover:text-sage-light">
                About
              </Link>
              <a
                href="mailto:nutravoe@gmail.com"
                className="font-body text-[10px] text-[#9A9590] transition-colors hover:text-sage-light"
              >
                Email Us
              </a>
              <Link href="/privacy" className="font-body text-[10px] text-[#9A9590] transition-colors hover:text-sage-light">
                Privacy
              </Link>
              <Link href="/terms" className="font-body text-[10px] text-[#9A9590] transition-colors hover:text-sage-light">
                Terms
              </Link>
            </div>
          </div>
        </footer>
        <div className="hidden md:block">
          <FullFooter />
        </div>
      </>
    );
  }

  return <FullFooter />;
}
