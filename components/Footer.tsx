import Link from "next/link";
import Image from "next/image";
import { getWhatsAppHref } from "@/lib/contact";

export default function Footer() {
  return (
    <footer className="bg-ink text-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-16 py-20 grid grid-cols-1 md:grid-cols-3 gap-12">
        {/* Brand */}
        <div>
          <Link href="/" className="flex items-center gap-3.5 group mb-5 inline-flex">
            <div className="relative w-8 h-8 md:w-9 md:h-9 transition-all duration-300">
              <Image
                src="/circular-logo-print-2400px.png"
                alt="Nutravoe Circular Logo"
                fill
                className="object-contain"
              />
            </div>
            <span className="font-display text-[22px] md:text-[26px] lowercase tracking-[0.3em] font-light transition-all duration-300 text-white">
              nutravoe
            </span>
          </Link>
          <p className="font-body text-[13px] leading-relaxed text-[#9A9590] max-w-xs">
            Fresh protein yogurt bowls crafted daily and delivered to your door.
            7 AM–9 PM. Bangalore, Karnataka.
          </p>
        </div>

        {/* Pages */}
        <div>
          <h4 className="font-body text-xs font-medium tracking-[0.18em] uppercase text-stone mb-5">
            Pages
          </h4>
          <ul className="space-y-3 list-none p-0 m-0">
            {[
              { href: "/", label: "Home" },
              { href: "/menu", label: "Menu" },
              { href: "/about", label: "About" },
              { href: "/order", label: "Order" },
              { href: "/b2b", label: "B2B Partnerships" },
              { href: "/privacy", label: "Privacy Notice" },
              { href: "/terms", label: "Conditions of Use" },
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

        {/* Contact */}
        <div>
          <h4 className="font-body text-xs font-medium tracking-[0.18em] uppercase text-stone mb-5">
            Contact
          </h4>
          <ul className="space-y-3 list-none p-0 m-0">
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
                nutravoe@gmail.com
              </a>
            </li>
            <li>
              <a
                href="https://instagram.com/nutravoe"
                target="_blank"
                rel="noopener noreferrer"
                className="font-body text-sm text-[#9A9590] transition-colors duration-300 hover:text-sage-light"
              >
                Instagram
              </a>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/5">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 py-6 flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="font-body text-xs text-[#706e6a]">
            © 2025 Nutravoe. All rights reserved.
          </p>
          <span className="font-body text-xs text-sage tracking-wide">
            Bangalore, Karnataka
          </span>
        </div>
      </div>
    </footer>
  );
}
