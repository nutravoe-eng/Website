import { Bowl, GlobalSettings, SubscriptionPlan } from "@/types";

// ─── Stub data (used when Sanity is not configured) ─────────────────────────

export const STUB_BOWLS: Bowl[] = [
  {
    _id: "1",
    name: "Tropical Mango Oatmeal",
    slug: "tropical-mango-oatmeal",
    tagline: "Bright, fruity, refreshing",
    description:
      "Fresh mango, pomegranate, grated coconut, black grapes, yogurt oats, granola, almonds, walnuts, and seed mix.",
    price: 299,
    subscriptionPriceTier: "standard",
    image: "/tropical-mango.png",
    tags: ["bestseller"],
    available: true,
    inStock: true,
    displayOrder: 1,
    nutrition: { calories: 510, protein: 20, fibre: 11 },
    ingredients: [
      "Fresh mango chunks, pomegranate",
      "Grated coconut, black grapes",
      "Yoghurt-based oats",
      "Granola, almonds, walnuts & seed mix",
    ],
    customizableIngredients: [
      { id: "oats", name: "Oats", extraCost: 10 },
      { id: "mango", name: "Mango", extraCost: 30 },
      { id: "pomegranate", name: "Pomegranate", extraCost: 30 },
      { id: "grated-coconut", name: "Grated Coconut", extraCost: 30 },
      { id: "black-grapes", name: "Black Grapes", extraCost: 30 },
      { id: "granola", name: "Granola", extraCost: 20 },
      { id: "almonds", name: "Almonds", extraCost: 30 },
      { id: "walnuts", name: "Walnuts", extraCost: 30 },
      { id: "seed-mix", name: "Seed Mix", extraCost: 30 },
    ],
  },
  {
    _id: "2",
    name: "Very Fruity Oatmeal",
    slug: "very-fruity-oatmeal",
    subscriptionPriceTier: "standard",
    tagline: "Vibrant, colorful, nutrient-packed",
    description:
      "Mango, strawberry, banana, blueberry, pomegranate, yogurt oats, granola, nuts and seeds.",
    price: 299,
    image: "/very-fruity.png",
    tags: ["high-protein"],
    available: true,
    inStock: true,
    displayOrder: 2,
    nutrition: { calories: 480, protein: 19, fibre: 12 },
    ingredients: [
      "Mango, strawberry, banana",
      "Blueberry, pomegranate",
      "Yoghurt-based oats",
      "Granola, nuts & seeds",
    ],
    customizableIngredients: [
      { id: "oats", name: "Oats", extraCost: 10 },
      { id: "mango", name: "Mango", extraCost: 30 },
      { id: "strawberry", name: "Strawberry", extraCost: 30 },
      { id: "banana", name: "Banana", extraCost: 10 },
      { id: "blueberry", name: "Blueberry", extraCost: 30 },
      { id: "pomegranate", name: "Pomegranate", extraCost: 30 },
      { id: "granola", name: "Granola", extraCost: 20 },
      { id: "mixed-nuts", name: "Mixed Nuts", extraCost: 30 },
      { id: "seeds", name: "Seeds", extraCost: 30 },
    ],
  },
  {
    _id: "3",
    name: "Very Berry Oatmeal",
    subscriptionPriceTier: "standard",
    slug: "very-berry-oatmeal",
    tagline: "Fresh, slightly indulgent, antioxidant-rich",
    description:
      "Strawberry, mulberry, blueberry, yogurt oats, granola, nuts and seeds, honey drizzle.",
    price: 299,
    image: "/very-berry-bowl.png",
    tags: ["seasonal"],
    available: true,
    inStock: true,
    displayOrder: 3,
    nutrition: { calories: 470, protein: 20, fibre: 11 },
    ingredients: [
      "Strawberry, mulberry, blueberry",
      "Yoghurt-based oats",
      "Granola, nuts & seeds",
      "Honey drizzle",
    ],
    customizableIngredients: [
      { id: "oats", name: "Oats", extraCost: 10 },
      { id: "strawberry", name: "Strawberry", extraCost: 30 },
      { id: "mulberry", name: "Mulberry", extraCost: 30 },
      { id: "blueberry", name: "Blueberry", extraCost: 30 },
      { id: "granola", name: "Granola", extraCost: 20 },
      { id: "mixed-nuts", name: "Mixed Nuts", extraCost: 30 },
      { id: "seeds", name: "Seeds", extraCost: 30 },
      { id: "honey", name: "Honey Drizzle", extraCost: 20 },
    ],
  },
  {
    _id: "4",
    name: "Banana Peanut Butter Oatmeal",
    subscriptionPriceTier: "standard",
    slug: "banana-peanut-butter-oatmeal",
    tagline: "Comforting, filling, protein-rich",
    description:
      "Banana, natural peanut butter, pomegranate, yogurt oats, granola, nuts and seeds.",
    price: 299,
    image: "/banana-peanut-butter-bowl.png",
    tags: ["high-protein"],
    available: true,
    inStock: true,
    displayOrder: 4,
    nutrition: { calories: 530, protein: 23, fibre: 13 },
    ingredients: [
      "Banana, natural peanut butter",
      "Pomegranate",
      "Yoghurt-based oats",
      "Granola, nuts & seeds",
    ],
    customizableIngredients: [
      { id: "oats", name: "Oats", extraCost: 10 },
      { id: "banana", name: "Banana", extraCost: 10 },
      { id: "peanut-butter", name: "Peanut Butter", extraCost: 30 },
      { id: "pomegranate", name: "Pomegranate", extraCost: 30 },
      { id: "granola", name: "Granola", extraCost: 20 },
      { id: "mixed-nuts", name: "Mixed Nuts", extraCost: 30 },
      { id: "seeds", name: "Seeds", extraCost: 30 },
      { id: "cinnamon", name: "Cinnamon Powder", extraCost: 5 },
    ],
  },
  {
    _id: "5",
    name: "Very Nutty Oatmeal",
    subscriptionPriceTier: "standard",
    slug: "very-nutty-oatmeal",
    tagline: "Rich, crunchy, satisfying",
    description:
      "Mixed nuts (cashews, almonds, walnuts), seed mix, yogurt oats, dates, pomegranate.",
    price: 299,
    image: "/very-nutty-bowl.png",
    tags: ["high-protein"],
    available: true,
    inStock: true,
    displayOrder: 5,
    nutrition: { calories: 550, protein: 21, fibre: 14 },
    ingredients: [
      "Mixed nuts (cashews, almonds, walnuts)",
      "Seed mix",
      "Yoghurt-based oats",
      "Dates & pomegranate",
    ],
    customizableIngredients: [
      { id: "oats", name: "Oats", extraCost: 10 },
      { id: "cashews", name: "Cashews", extraCost: 30 },
      { id: "almonds", name: "Almonds", extraCost: 30 },
      { id: "walnuts", name: "Walnuts", extraCost: 30 },
      { id: "seed-mix", name: "Seed Mix", extraCost: 30 },
      { id: "dates", name: "Dates", extraCost: 30 },
      { id: "pomegranate", name: "Pomegranate", extraCost: 30 },
      { id: "cinnamon", name: "Cinnamon Powder", extraCost: 5 },
    ],
  },
  {
    _id: "6",
    name: "Premium Bowl (Stub)",
    slug: "premium-bowl-stub",
    tagline: "Example premium-tier menu item for dev",
    description: "Placeholder for a ₹399-class bowl; mark real bowls as premium in Sanity.",
    price: 399,
    subscriptionPriceTier: "premium",
    image: "/very-berry-bowl.png",
    tags: ["high-protein"],
    available: true,
    inStock: true,
    displayOrder: 6,
    nutrition: { calories: 500, protein: 22, fibre: 12 },
    ingredients: ["Example ingredients"],
    customizableIngredients: [
      { id: "oats", name: "Oats", extraCost: 10 },
      { id: "granola", name: "Granola", extraCost: 20 },
    ],
  },
];

export const STUB_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    _id: 'plan-three-bowl',
    name: '3-Bowl / Week',
    slug: 'three-bowl',
    bowlsPerCycle: 3,
    billingCycle: 'weekly',
    pricePerBowl: 280,
    pricePerBowlPremium: 380,
    customisationChargePerBowl: 30,
    deliveryStyles: ['spread', 'flexible'],
    savingsBadge: 'Save 5%',
    isActive: true,
    displayOrder: 1,
  },
  {
    _id: 'plan-five-bowl',
    name: '5-Bowl / Week',
    slug: 'five-bowl',
    bowlsPerCycle: 5,
    billingCycle: 'weekly',
    pricePerBowl: 270,
    pricePerBowlPremium: 370,
    customisationChargePerBowl: 30,
    deliveryStyles: ['spread', 'flexible'],
    savingsBadge: 'Save 10%',
    isActive: true,
    displayOrder: 2,
  },
  {
    _id: 'plan-daily',
    name: 'Daily Plan',
    slug: 'daily',
    bowlsPerCycle: 7,
    billingCycle: 'weekly',
    pricePerBowl: 260,
    pricePerBowlPremium: 360,
    customisationChargePerBowl: 30,
    deliveryStyles: ['spread', 'flexible'],
    savingsBadge: 'Best Value',
    isActive: true,
    displayOrder: 3,
  },
];

/** Strip stega / invisible chars; normalize tier strings from CMS. */
function cleanCmsString(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim();
}

/**
 * Coerce `subscriptionPriceTier` to the enum the app uses (Studio can send different casing; stega
 * can add invisible characters that break `=== "premium"` and subscription bowl filters.
 */
function normalizeBowlFromCms(raw: Bowl): Bowl {
  const t = cleanCmsString((raw as { subscriptionPriceTier?: unknown }).subscriptionPriceTier).toLowerCase();
  let subscriptionPriceTier: Bowl["subscriptionPriceTier"] = undefined;
  if (t === "standard" || t === "premium") {
    subscriptionPriceTier = t;
  }
  return { ...raw, subscriptionPriceTier };
}

function toFiniteNumber(v: unknown, fallback: number | undefined): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v > 0) return v;
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(cleanCmsString(v).replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n > 0) return n;
  }
  return fallback;
}

function normalizeSubscriptionPlan(plan: SubscriptionPlan): SubscriptionPlan {
  const fallback = STUB_SUBSCRIPTION_PLANS.find((p) => p.slug === plan.slug);
  const fromSanity = plan as {
    pricePerBowl?: number;
    price_per_bowl?: number;
    pricePerBowlPremium?: number;
    price_per_bowl_premium?: number;
  };
  const rawStd = fromSanity.pricePerBowl ?? fromSanity.price_per_bowl ?? fallback?.pricePerBowl;
  const pricePerBowl =
    toFiniteNumber(rawStd, fallback?.pricePerBowl) ?? fallback?.pricePerBowl ?? 0;
  const rawPrem = fromSanity.pricePerBowlPremium ?? fromSanity.price_per_bowl_premium;
  const coercedPrem = toFiniteNumber(rawPrem, fallback?.pricePerBowlPremium);
  const pricePerBowlPremium =
    coercedPrem != null && coercedPrem > 0 ? coercedPrem : undefined;
  return {
    ...plan,
    pricePerBowl,
    ...(pricePerBowlPremium != null && pricePerBowlPremium > 0 ? { pricePerBowlPremium } : {}),
  };
}

export const STUB_SETTINGS: GlobalSettings = {
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "917899858374",
  instagramUrl: "https://instagram.com/nutravoe",
};

// ─── Sanity client (only if credentials are set) ────────────────────────────

const isSanityConfigured =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID &&
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID !== "";

let sanityClient: ReturnType<typeof import("@sanity/client").createClient> | null = null;
let devWarnedUsingStubsNoSanityEnv = false;
let devLoggedSanityClientReady = false;

async function getSanityClient() {
  if (!isSanityConfigured) return null;
  if (sanityClient) return sanityClient;
  const { createClient } = await import("@sanity/client");
  sanityClient = createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
    apiVersion: "2024-01-01",
    useCdn: false,
  });
  if (process.env.NODE_ENV === "development" && !devLoggedSanityClientReady) {
    devLoggedSanityClientReady = true;
    const ds = process.env.NEXT_PUBLIC_SANITY_DATASET || "production";
    // eslint-disable-next-line no-console
    console.info(
      `[sanity] Live CMS enabled (project=${process.env.NEXT_PUBLIC_SANITY_PROJECT_ID}, dataset=${ds}). No [sanity] warnings = fetch ok.`,
    );
  }
  return sanityClient;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getAllBowls(): Promise<Bowl[]> {
  const client = await getSanityClient();
  if (!client) {
    if (process.env.NODE_ENV === "development" && !isSanityConfigured && !devWarnedUsingStubsNoSanityEnv) {
      devWarnedUsingStubsNoSanityEnv = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[sanity] NEXT_PUBLIC_SANITY_PROJECT_ID is not set. Bowls and plans use built-in STUBS — your Studio content is not loaded.",
      );
    }
    return STUB_BOWLS;
  }

  const query = `*[_type == "bowl" && available == true] | order(displayOrder asc) {
    _id,
    name,
    "slug": slug.current,
    tagline,
    description,
    price,
    subscriptionPriceTier,
    "image": image.asset->url + "?w=800&fm=webp&q=80",
    tags,
    available,
    inStock,
    displayOrder,
    ingredients,
    nutrition,
    customizableIngredients,
    variants,
    "category": category->{title, "slug": slug.current, displayOrder}
  }`;

  try {
    const result = (await client.fetch(query)) as Bowl[] | null;
    if (result?.length) {
      return result.map(normalizeBowlFromCms);
    }
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn(
        "[sanity] getAllBowls: 0 published bowls (query: available==true). Using stub bowls — publish documents or check dataset.",
      );
    }
    return STUB_BOWLS;
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[sanity] getAllBowls fetch failed, using stub bowls:", e);
    }
    return STUB_BOWLS;
  }
}

export async function getBowlBySlug(slug: string): Promise<Bowl | null> {
  const client = await getSanityClient();
  if (!client) return STUB_BOWLS.find((b) => b.slug === slug) || null;

  const query = `*[_type == "bowl" && slug.current == $slug][0] {
    _id,
    name,
    "slug": slug.current,
    tagline,
    description,
    price,
    subscriptionPriceTier,
    "image": image.asset->url + "?w=800&fm=webp&q=80",
    tags,
    available,
    inStock,
    displayOrder,
    ingredients,
    nutrition,
    customizableIngredients,
    variants,
    "category": category->{title, "slug": slug.current, displayOrder}
  }`;

  try {
    const row = (await client.fetch(query, { slug })) as Bowl | null;
    return row ? normalizeBowlFromCms(row) : STUB_BOWLS.find((b) => b.slug === slug) || null;
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[sanity] getBowlBySlug fetch failed:", e);
    }
    return STUB_BOWLS.find((b) => b.slug === slug) || null;
  }
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const client = await getSanityClient();
  if (!client) {
    if (process.env.NODE_ENV === "development" && !isSanityConfigured && !devWarnedUsingStubsNoSanityEnv) {
      devWarnedUsingStubsNoSanityEnv = true;
      // eslint-disable-next-line no-console
      console.warn(
        "[sanity] NEXT_PUBLIC_SANITY_PROJECT_ID is not set. Subscription plan prices use built-in STUBS — your Studio content is not loaded.",
      );
    }
    return STUB_SUBSCRIPTION_PLANS;
  }

  const query = `*[_type == "subscriptionPlan" && isActive == true] | order(displayOrder asc) {
    _id,
    name,
    "slug": slug.current,
    bowlsPerCycle,
    billingCycle,
    pricePerBowl,
    pricePerBowlPremium,
    customisationChargePerBowl,
    deliveryStyles,
    savingsBadge,
    isActive,
    displayOrder
  }`;

  try {
    const result = (await client.fetch(query)) as SubscriptionPlan[] | null;
    if (result?.length) {
      return result.map(normalizeSubscriptionPlan);
    }
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn(
        "[sanity] getSubscriptionPlans: 0 active plans (check isActive, publish, or dataset). Using stub plan prices.",
      );
    }
    return STUB_SUBSCRIPTION_PLANS;
  } catch (e) {
    if (process.env.NODE_ENV === "development") {
      // eslint-disable-next-line no-console
      console.warn("[sanity] getSubscriptionPlans fetch failed, using stub plans:", e);
    }
    return STUB_SUBSCRIPTION_PLANS;
  }
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const client = await getSanityClient();
  if (!client) return STUB_SETTINGS;

  const query = `*[_type == "settings"][0] {
    whatsappNumber,
    swiggyUrl,
    zomatoUrl,
    instagramUrl
  }`;

  try {
    const result = await client.fetch(query);
    return result || STUB_SETTINGS;
  } catch {
    return STUB_SETTINGS;
  }
}
