"use client";

import { useState } from "react";
import type { Bowl, BowlIngredient, IngredientCustomization, IngredientOption } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface Props {
  bowl: Bowl;
  initialCustomizations?: IngredientCustomization[];
  mode: "cart" | "subscription";
  onConfirm: (customizations: IngredientCustomization[], extraCost: number) => void;
  onClose: () => void;
}

function buildInitialMap(
  ingredients: BowlIngredient[],
  initial?: IngredientCustomization[]
): Record<string, IngredientOption> {
  const map: Record<string, IngredientOption> = {};
  for (const ing of ingredients) {
    map[ing.id] = "default";
  }
  if (initial) {
    for (const c of initial) {
      map[c.ingredientId] = c.option;
    }
  }
  return map;
}

function calcCost(
  map: Record<string, IngredientOption>,
  ingredients: BowlIngredient[]
): number {
  let total = 0;
  for (const ing of ingredients) {
    if (map[ing.id] === "extra") total += ing.extraCost;
  }
  return total;
}

export default function CustomizationModal({ bowl, initialCustomizations, mode, onConfirm, onClose }: Props) {
  const ingredients = (bowl.customizableIngredients ?? []).filter(i => !i.isBase);

  const [optionMap, setOptionMap] = useState<Record<string, IngredientOption>>(
    () => buildInitialMap(ingredients, initialCustomizations)
  );

  function setOption(ingredientId: string, option: IngredientOption) {
    setOptionMap(prev => ({ ...prev, [ingredientId]: option }));
  }

  const extraCost = calcCost(optionMap, ingredients);

  function handleConfirm() {
    const customizations: IngredientCustomization[] = ingredients.map(ing => ({
      ingredientId: ing.id,
      option: optionMap[ing.id] ?? "default",
    }));
    onConfirm(customizations, extraCost);
  }

  const ctaLabel = mode === "cart" ? "Add to Cart" : "Save Customisation";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-200">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 shrink-0">
          <div>
            <h3 className="font-display text-xl font-medium text-ink">{bowl.name}</h3>
            <p className="font-body text-[12px] text-stone mt-0.5">Customise your ingredients</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-stone hover:text-ink transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        {/* Yogurt base note */}
        <div className="px-6 pt-4 shrink-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sage/10 border border-sage/20">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#7D9B76" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span className="font-body text-[11px] font-semibold text-sage-dark">Yogurt base always included</span>
          </span>
        </div>

        {/* Ingredient list */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-3">
          {ingredients.length === 0 ? (
            <p className="font-body text-[13px] text-stone text-center py-6 italic">
              Standard recipe — no customisations available
            </p>
          ) : (
            ingredients.map((ing) => {
              const current = optionMap[ing.id] ?? "default";
              return (
                <div key={ing.id} className="flex items-center justify-between gap-3">
                  <span className="font-body text-[13px] font-medium text-ink flex-1 min-w-0 truncate">
                    {ing.name}
                  </span>
                  <div className="flex items-center border border-black/10 rounded-lg overflow-hidden shrink-0">
                    {/* Remove */}
                    <button
                      onClick={() => setOption(ing.id, "remove")}
                      className={`text-[11px] font-body font-bold px-2.5 py-1.5 border-r border-black/10 transition-colors ${
                        current === "remove"
                          ? "bg-terracotta/10 border-r-terracotta/20 text-terracotta"
                          : "bg-white text-stone hover:bg-black/5"
                      }`}
                    >
                      Remove
                    </button>
                    {/* Default */}
                    <button
                      onClick={() => setOption(ing.id, "default")}
                      className={`text-[11px] font-body font-bold px-2.5 py-1.5 border-r border-black/10 transition-colors ${
                        current === "default"
                          ? "bg-sage/10 border-r-sage/20 text-sage-dark"
                          : "bg-white text-stone hover:bg-black/5"
                      }`}
                    >
                      Default
                    </button>
                    {/* Extra */}
                    <button
                      onClick={() => setOption(ing.id, "extra")}
                      className={`text-[11px] font-body font-bold px-2.5 py-1.5 transition-colors ${
                        current === "extra"
                          ? "bg-ink text-white"
                          : "bg-white text-stone hover:bg-black/5"
                      }`}
                    >
                      Extra +{formatCurrency(ing.extraCost)}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/5 shrink-0 space-y-3">
          {/* Price breakdown */}
          <div className="flex items-center gap-3 font-body text-[12px] text-stone">
            <span>Base {formatCurrency(bowl.price)}</span>
            {extraCost > 0 && (
              <>
                <span className="text-black/20">·</span>
                <span className="text-sage-dark font-semibold">Customisations +{formatCurrency(extraCost)}</span>
              </>
            )}
            <span className="text-black/20">·</span>
            <span className="font-bold text-ink ml-auto">Total {formatCurrency(bowl.price + extraCost)}</span>
          </div>

          {/* CTA */}
          <button
            onClick={handleConfirm}
            className="w-full bg-terracotta hover:bg-[#D55F43] text-white font-body text-sm font-bold tracking-wide py-3.5 rounded-md transition-colors shadow-sm"
          >
            {ctaLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
