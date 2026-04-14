export interface BowlIngredient {
  id: string;
  name: string;
  extraCost: number;
  isBase?: boolean;
}

export type IngredientOption = 'default' | 'remove' | 'extra';

export interface IngredientCustomization {
  ingredientId: string;
  option: IngredientOption;
}

export interface Bowl {
  _id: string;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  price: number;
  image: string; // URL string (resolved from Sanity or local path)
  tags: BowlTag[];
  available: boolean;
  inStock?: boolean;
  displayOrder: number;
  nutrition?: {
    calories: number;
    protein: number;
    fibre: number;
  };
  ingredients?: string[];
  customizableIngredients?: BowlIngredient[];
}

export type BowlTag = "bestseller" | "high-protein" | "seasonal";

export interface OrderItem {
  bowl_name: string;
  quantity: number;
  price: number;
}

export interface Customer {
  name: string;
  phone: string;
  address: string;
}

export interface Order {
  id?: string;
  created_at?: string;
  customer_name: string;
  customer_phone: string;
  delivery_address: string;
  items: OrderItem[];
  total_amount: number; // in paise
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  status: "pending" | "paid" | "failed";
}

export interface GlobalSettings {
  whatsappNumber: string;
  swiggyUrl?: string;
  zomatoUrl?: string;
  instagramUrl?: string;
}

export interface CartItem {
  instanceId: string;
  bowl: Bowl;
  quantity: number;
  customizations: IngredientCustomization[];
  customizationCost: number;
}

export type DeliveryStyle = 'spread' | 'flexible';

export interface WalletTransaction {
  id: string;
  type: 'credit' | 'debit';
  amountPaise: number;
  description: string;
  createdAt: string;
}

export interface WalletLoad {
  id: string;
  amountPaise: number;
  remainingAmountPaise: number;
  createdAt: string;
  expiresAt: string | null;
  sourceType: 'subscription_payment' | 'refund' | 'admin_adjustment' | 'top_up';
}

export interface Wallet {
  balancePaise: number;
  transactions: WalletTransaction[];
  activeLoads?: WalletLoad[];
  nextExpiryAt?: string | null;
}
export type PlanId = 'three-bowl' | 'five-bowl' | 'daily';

export interface SubscriptionPlan {
  _id: string;
  name: string;
  slug: string; // used as plan_id in DB
  bowlsPerCycle: number;
  billingCycle: 'weekly' | 'monthly';
  priceNearPerBowl: number; // ≤10 km zone
  priceFarPerBowl: number;  // >10 km zone
  price_per_bowl?: number;  // Fallback from DB
  customisationChargePerBowl: number;
  deliveryStyles: DeliveryStyle[];
  savingsBadge?: string;
  isActive: boolean;
  displayOrder: number;
}

export interface DayBowlConfig {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  bowlId: string;
  bowlName: string;
  quantity: number;
  customizations?: IngredientCustomization[];
  customizationCost?: number;
  deliveryTimeSlot?: string;
}

export interface Subscription {
  id: string;
  planId: PlanId;
  deliveryStyle: DeliveryStyle;
  billingCycle?: 'weekly' | 'monthly';
  deliveryTimeSlot?: string; // e.g. '7:00 AM – 8:00 AM'
  dayConfigs: DayBowlConfig[];
  weeklyPrice: number;
  deliveryAddress: string;
  createdAt: string;
  status: 'active' | 'paused' | 'cancelled' | 'pending' | 'completed' | 'expired';
  paymentStatus?: string;
  nextDelivery: string;
  walletBalancePaise?: number;
  periodEndDate?: string;
  deliveriesCompleted?: number;
}
