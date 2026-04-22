"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { Bowl, BowlPresetOptions, CartItem, IngredientCustomization } from "@/types";

const CART_STORAGE_KEY = "nutravoe_cart";

function loadCartFromStorage(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CartItem[];
    return parsed.map((item) => ({
      ...item,
      presetOptions: {
        baseChoice: item.presetOptions?.baseChoice ?? "yogurt",
        oatsChoice: item.presetOptions?.oatsChoice ?? "roasted",
        noSugar: item.presetOptions?.noSugar ?? false,
      },
    }));
  } catch {
    return [];
  }
}

function saveCartToStorage(items: CartItem[]) {
  try {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage quota exceeded or private browsing — silently ignore
  }
}

interface CartContextValue {
  items: CartItem[];
  addItem: (
    bowl: Bowl,
    customizations?: IngredientCustomization[],
    presetOptions?: BowlPresetOptions,
    customizationCost?: number
  ) => void;
  removeItem: (instanceId: string) => void;
  updateQuantity: (instanceId: string, quantity: number) => void;
  updateCustomizations: (
    instanceId: string,
    customizations: IngredientCustomization[],
    presetOptions: BowlPresetOptions,
    customizationCost: number
  ) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextValue | null>(null);
const DEFAULT_PRESET_OPTIONS: BowlPresetOptions = {
  baseChoice: "yogurt",
  oatsChoice: "roasted",
  noSugar: false,
};

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  // Hydrate from localStorage once on mount
  useEffect(() => {
    const stored = loadCartFromStorage();
    if (stored.length > 0) setItems(stored);
  }, []);

  // Persist to localStorage on every change
  useEffect(() => {
    saveCartToStorage(items);
  }, [items]);

  const addItem = useCallback(
    (
      bowl: Bowl,
      customizations?: IngredientCustomization[],
      presetOptions?: BowlPresetOptions,
      customizationCost?: number
    ) => {
      setItems((prev) => {
        const sortedCustomizations = [...(customizations || [])].sort((a,b) => a.ingredientId.localeCompare(b.ingredientId));
        const resolvedPresetOptions = { ...DEFAULT_PRESET_OPTIONS, ...(presetOptions ?? {}) };
        const instanceId = `${bowl._id}-${sortedCustomizations.map(c => c.ingredientId + c.option).join('-')}-${resolvedPresetOptions.baseChoice}-${resolvedPresetOptions.oatsChoice}-${resolvedPresetOptions.noSugar ? "nosugar" : "natural"}`;
        
        const existing = prev.find((i) => i.instanceId === instanceId);
        if (existing) {
          // Increment quantity only — keep existing customizations
          return prev.map((i) =>
            i.instanceId === instanceId ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [
          ...prev,
          {
            instanceId,
            bowl,
            quantity: 1,
            customizations: customizations ?? [],
            presetOptions: resolvedPresetOptions,
            customizationCost: customizationCost ?? 0,
          },
        ];
      });
    },
    []
  );

  const removeItem = useCallback((instanceId: string) => {
    setItems((prev) => prev.filter((i) => i.instanceId !== instanceId));
  }, []);

  const updateQuantity = useCallback((instanceId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.instanceId !== instanceId));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.instanceId === instanceId ? { ...i, quantity } : i))
      );
    }
  }, []);

  const updateCustomizations = useCallback(
    (
      instanceId: string,
      customizations: IngredientCustomization[],
      presetOptions: BowlPresetOptions,
      customizationCost: number
    ) => {
      setItems((prev) =>
        prev.map((i) =>
          i.instanceId === instanceId
            ? { ...i, customizations, presetOptions, customizationCost }
            : i
        )
      );
    },
    []
  );

  const clearCart = useCallback(() => {
    setItems([]);
    try { localStorage.removeItem(CART_STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const total = items.reduce(
    (sum, i) => sum + (i.bowl.price + i.customizationCost) * i.quantity,
    0
  );
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, removeItem, updateQuantity, updateCustomizations, clearCart, total, itemCount }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
