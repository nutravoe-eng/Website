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
    image: "/tropical-mango.png",
    tags: ["bestseller"],
    available: true,
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
    tagline: "Vibrant, colorful, nutrient-packed",
    description:
      "Mango, strawberry, banana, blueberry, pomegranate, yogurt oats, granola, nuts and seeds.",
    price: 299,
    image: "/very-fruity.png",
    tags: ["high-protein"],
    available: true,
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
    slug: "very-berry-oatmeal",
    tagline: "Fresh, slightly indulgent, antioxidant-rich",
    description:
      "Strawberry, mulberry, blueberry, yogurt oats, granola, nuts and seeds, honey drizzle.",
    price: 299,
    image: "/very-berry-bowl.png",
    tags: ["seasonal"],
    available: true,
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
    slug: "banana-peanut-butter-oatmeal",
    tagline: "Comforting, filling, protein-rich",
    description:
      "Banana, natural peanut butter, pomegranate, yogurt oats, granola, nuts and seeds.",
    price: 299,
    image: "/banana-peanut-butter-bowl.png",
    tags: ["high-protein"],
    available: true,
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
    slug: "very-nutty-oatmeal",
    tagline: "Rich, crunchy, satisfying",
    description:
      "Mixed nuts (cashews, almonds, walnuts), seed mix, yogurt oats, dates, pomegranate.",
    price: 299,
    image: "/very-nutty-bowl.png",
    tags: ["high-protein"],
    available: true,
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
];

export const STUB_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    _id: 'plan-three-bowl',
    name: '3-Bowl / Week',
    slug: 'three-bowl',
    bowlsPerCycle: 3,
    billingCycle: 'weekly',
    priceNearPerBowl: 284,
    priceFarPerBowl: 299,
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
    priceNearPerBowl: 269,
    priceFarPerBowl: 284,
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
    priceNearPerBowl: 257,
    priceFarPerBowl: 271,
    customisationChargePerBowl: 30,
    deliveryStyles: ['spread', 'flexible'],
    savingsBadge: 'Best Value',
    isActive: true,
    displayOrder: 3,
  },
];

export const STUB_SETTINGS: GlobalSettings = {
  whatsappNumber: process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || "917899858374",
  instagramUrl: "https://instagram.com/nutravoe",
};

// ─── Sanity client (only if credentials are set) ────────────────────────────

const isSanityConfigured =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID &&
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID !== "";

let sanityClient: ReturnType<typeof import("@sanity/client").createClient> | null = null;

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
  return sanityClient;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export async function getAllBowls(): Promise<Bowl[]> {
  const client = await getSanityClient();
  if (!client) return STUB_BOWLS;

  const query = `*[_type == "bowl" && available == true] | order(displayOrder asc) {
    _id,
    name,
    "slug": slug.current,
    tagline,
    description,
    price,
    "image": image.asset->url + "?w=800&fm=webp&q=80",
    tags,
    available,
    displayOrder,
    ingredients,
    nutrition,
    customizableIngredients
  }`;

  try {
    const result = await client.fetch(query);
    return result?.length ? result : STUB_BOWLS;
  } catch {
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
    "image": image.asset->url + "?w=800&fm=webp&q=80",
    tags,
    available,
    displayOrder,
    ingredients,
    nutrition,
    customizableIngredients
  }`;

  try {
    return await client.fetch(query, { slug });
  } catch {
    return STUB_BOWLS.find((b) => b.slug === slug) || null;
  }
}

export async function getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  const client = await getSanityClient();
  if (!client) return STUB_SUBSCRIPTION_PLANS;

  const query = `*[_type == "subscriptionPlan" && isActive == true] | order(displayOrder asc) {
    _id,
    name,
    "slug": slug.current,
    bowlsPerCycle,
    billingCycle,
    priceNearPerBowl,
    priceFarPerBowl,
    customisationChargePerBowl,
    deliveryStyles,
    savingsBadge,
    isActive,
    displayOrder
  }`;

  try {
    const result = await client.fetch(query);
    return result?.length ? result : STUB_SUBSCRIPTION_PLANS;
  } catch {
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
