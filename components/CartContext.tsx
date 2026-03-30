"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Bowl, CartItem, IngredientCustomization } from "@/types";

interface CartContextValue {
  items: CartItem[];
  addItem: (bowl: Bowl, customizations?: IngredientCustomization[], customizationCost?: number) => void;
  removeItem: (bowlId: string) => void;
  updateQuantity: (bowlId: string, quantity: number) => void;
  updateCustomizations: (bowlId: string, customizations: IngredientCustomization[], customizationCost: number) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback(
    (bowl: Bowl, customizations?: IngredientCustomization[], customizationCost?: number) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.bowl._id === bowl._id);
        if (existing) {
          // Increment quantity only — keep existing customizations
          return prev.map((i) =>
            i.bowl._id === bowl._id ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [
          ...prev,
          {
            bowl,
            quantity: 1,
            customizations: customizations ?? [],
            customizationCost: customizationCost ?? 0,
          },
        ];
      });
    },
    []
  );

  const removeItem = useCallback((bowlId: string) => {
    setItems((prev) => prev.filter((i) => i.bowl._id !== bowlId));
  }, []);

  const updateQuantity = useCallback((bowlId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.bowl._id !== bowlId));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.bowl._id === bowlId ? { ...i, quantity } : i))
      );
    }
  }, []);

  const updateCustomizations = useCallback(
    (bowlId: string, customizations: IngredientCustomization[], customizationCost: number) => {
      setItems((prev) =>
        prev.map((i) =>
          i.bowl._id === bowlId ? { ...i, customizations, customizationCost } : i
        )
      );
    },
    []
  );

  const clearCart = useCallback(() => setItems([]), []);

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
