import type { Bowl } from "@/types";
import { getWhatsAppNumber } from "@/lib/contact";
import { getSiteUrl } from "@/lib/site";

const SITE_NAME = "Nutravoe";
const DEFAULT_OG_IMAGE = "/hero-image.png";
const DEFAULT_DESCRIPTION =
  "Premium protein yogurt bowls made fresh daily in Bangalore. No added sugar, probiotic base, delivered 7 AM-3 PM. Order via WhatsApp.";

export function getAbsoluteUrl(path = "/"): string {
  const siteUrl = getSiteUrl();
  if (!path || path === "/") return siteUrl;
  return `${siteUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getDefaultOgImage(): string {
  return getAbsoluteUrl(DEFAULT_OG_IMAGE);
}

export function buildPageMetadata({
  title,
  description = DEFAULT_DESCRIPTION,
  path,
}: {
  title: string;
  description?: string;
  path: string;
}) {
  const url = getAbsoluteUrl(path);
  const image = getDefaultOgImage();

  return {
    title,
    description,
    alternates: {
      canonical: path,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      locale: "en_IN",
      type: "website" as const,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: `${SITE_NAME} hero bowl`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      images: [image],
    },
  };
}

export function getOrganizationSchema() {
  const siteUrl = getSiteUrl();
  const whatsappNumber = getWhatsAppNumber();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${siteUrl}#organization`,
        name: SITE_NAME,
        url: siteUrl,
        logo: getAbsoluteUrl("/icon-primary-1000px.png"),
        image: getDefaultOgImage(),
        description: DEFAULT_DESCRIPTION,
        email: "nutravoe@gmail.com",
        telephone: `+91${whatsappNumber}`,
        contactPoint: [
          {
            "@type": "ContactPoint",
            contactType: "customer support",
            telephone: `+91${whatsappNumber}`,
            email: "nutravoe@gmail.com",
            areaServed: "IN",
            availableLanguage: ["en", "hi"],
          },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${siteUrl}#website`,
        url: siteUrl,
        name: SITE_NAME,
        publisher: {
          "@id": `${siteUrl}#organization`,
        },
        inLanguage: "en-IN",
      },
      {
        "@type": "LocalBusiness",
        "@id": `${siteUrl}#localbusiness`,
        name: SITE_NAME,
        url: siteUrl,
        image: getDefaultOgImage(),
        description: DEFAULT_DESCRIPTION,
        telephone: `+91${whatsappNumber}`,
        email: "nutravoe@gmail.com",
        areaServed: {
          "@type": "City",
          name: "Bengaluru",
        },
        address: {
          "@type": "PostalAddress",
          addressLocality: "Bengaluru",
          addressRegion: "Karnataka",
          addressCountry: "IN",
        },
        openingHoursSpecification: [
          {
            "@type": "OpeningHoursSpecification",
            dayOfWeek: [
              "Monday",
              "Tuesday",
              "Wednesday",
              "Thursday",
              "Friday",
              "Saturday",
              "Sunday",
            ],
            opens: "07:00",
            closes: "15:00",
          },
        ],
        priceRange: "INR 299-399",
      },
    ],
  };
}

export function getMenuSchema(bowls: Bowl[]) {
  const siteUrl = getSiteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${siteUrl}/menu#itemlist`,
    name: "Nutravoe Menu",
    itemListElement: bowls.map((bowl, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: `${siteUrl}/menu`,
      item: {
        "@type": "Product",
        name: bowl.name,
        description: bowl.description,
        image: bowl.image.startsWith("http") ? bowl.image : getAbsoluteUrl(bowl.image),
        brand: SITE_NAME,
        offers: {
          "@type": "Offer",
          priceCurrency: "INR",
          price: bowl.price,
          availability:
            bowl.inStock === false
              ? "https://schema.org/OutOfStock"
              : "https://schema.org/InStock",
          url: `${siteUrl}/menu`,
        },
      },
    })),
  };
}

export function getAboutPageSchema() {
  const siteUrl = getSiteUrl();

  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${siteUrl}/about#about-page`,
    url: `${siteUrl}/about`,
    name: "About Nutravoe",
    description:
      "The story behind Nutravoe, inspired by Austria and built for Bangalore.",
    isPartOf: {
      "@id": `${siteUrl}#website`,
    },
    about: {
      "@id": `${siteUrl}#organization`,
    },
  };
}

export function getB2BServiceSchema() {
  const siteUrl = getSiteUrl();
  const whatsappNumber = getWhatsAppNumber();

  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${siteUrl}/b2b#service`,
    name: "Nutravoe B2B Catering",
    serviceType: "Recurring healthy meal delivery for offices and teams",
    provider: {
      "@id": `${siteUrl}#organization`,
    },
    areaServed: {
      "@type": "City",
      name: "Bengaluru",
    },
    availableChannel: {
      "@type": "ServiceChannel",
      serviceUrl: `${siteUrl}/b2b`,
      telephone: `+91${whatsappNumber}`,
    },
    audience: {
      "@type": "BusinessAudience",
      audienceType: "Offices, gyms, hotels, and co-working teams",
    },
  };
}
