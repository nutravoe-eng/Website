"use client";

import { useRef, useState } from "react";
import type {
  Bowl,
  BowlIngredient,
  BowlPresetOptions,
  IngredientCustomization,
  IngredientOption,
} from "@/types";
import { formatCurrency } from "@/lib/utils";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";

interface Props {
  bowl: Bowl;
  initialCustomizations?: IngredientCustomization[];
  initialPresetOptions?: BowlPresetOptions;
  mode: "cart" | "subscription";
  onConfirm: (
    customizations: IngredientCustomization[],
    presetOptions: BowlPresetOptions,
    extraCost: number
  ) => void;
  onClose: () => void;
}

const DEFAULT_PRESET_OPTIONS: BowlPresetOptions = {
  baseChoice: "yogurt",
  oatsChoice: "roasted",
  noSugar: false,
};

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

export default function CustomizationModal({
  bowl,
  initialCustomizations,
  initialPresetOptions,
  mode,
  onConfirm,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const ingredients = (bowl.customizableIngredients ?? []).filter(i => !i.isBase);
  const showStandardCustomizations = bowl.showStandardCustomizations !== false;
  useDialogAccessibility(dialogRef, onClose);

  const [optionMap, setOptionMap] = useState<Record<string, IngredientOption>>(
    () => buildInitialMap(ingredients, initialCustomizations)
  );
  const [presetOptions, setPresetOptions] = useState<BowlPresetOptions>(
    () => ({ ...DEFAULT_PRESET_OPTIONS, ...(initialPresetOptions ?? {}) })
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
    onConfirm(customizations, presetOptions, extraCost);
  }

  const ctaLabel = mode === "cart" ? "Add to Cart" : "Save Customisation";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end md:items-center justify-center p-0 md:p-4 bg-ink/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customization-modal-title"
        tabIndex={-1}
        className="bg-white rounded-t-2xl md:rounded-2xl w-full md:max-w-md shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 md:zoom-in-95 duration-200"
      >

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-black/5 shrink-0">
          <div>
            <h3 id="customization-modal-title" className="font-display text-xl font-medium text-ink">{bowl.name}</h3>
            <p className="font-body text-[12px] text-stone mt-0.5">Customise your ingredients</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-stone hover:text-ink transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-1"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
          {showStandardCustomizations && (
          <div className="space-y-3">
            <div>
              <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
                Base
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPresetOptions(prev => ({ ...prev, baseChoice: "yogurt" }))}
                  className={`px-3 py-2 rounded-lg text-[12px] font-body font-semibold border transition-colors ${
                    presetOptions.baseChoice === "yogurt"
                      ? "bg-sage/10 border-sage/30 text-sage-dark"
                      : "bg-white border-black/10 text-stone hover:bg-black/5"
                  }`}
                >
                  Protein yogurt base
                </button>
                <button
                  onClick={() => setPresetOptions(prev => ({ ...prev, baseChoice: "milk" }))}
                  className={`px-3 py-2 rounded-lg text-[12px] font-body font-semibold border transition-colors ${
                    presetOptions.baseChoice === "milk"
                      ? "bg-sage/10 border-sage/30 text-sage-dark"
                      : "bg-white border-black/10 text-stone hover:bg-black/5"
                  }`}
                >
                  Protein milk base
                </button>
                <button
                  onClick={() => setPresetOptions(prev => ({ ...prev, baseChoice: "vegan" }))}
                  className={`px-3 py-2 rounded-lg text-[12px] font-body font-semibold border transition-colors ${
                    presetOptions.baseChoice === "vegan"
                      ? "bg-sage/10 border-sage/30 text-sage-dark"
                      : "bg-white border-black/10 text-stone hover:bg-black/5"
                  }`}
                >
                  Vegan
                </button>
              </div>
            </div>

            <div>
              <p className="font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
                Oats
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPresetOptions(prev => ({ ...prev, oatsChoice: "soaked" }))}
                  className={`px-3 py-2 rounded-lg text-[12px] font-body font-semibold border transition-colors ${
                    presetOptions.oatsChoice === "soaked"
                      ? "bg-sage/10 border-sage/30 text-sage-dark"
                      : "bg-white border-black/10 text-stone hover:bg-black/5"
                  }`}
                >
                  Soaked oats
                </button>
                <button
                  onClick={() => setPresetOptions(prev => ({ ...prev, oatsChoice: "roasted" }))}
                  className={`px-3 py-2 rounded-lg text-[12px] font-body font-semibold border transition-colors ${
                    presetOptions.oatsChoice === "roasted"
                      ? "bg-sage/10 border-sage/30 text-sage-dark"
                      : "bg-white border-black/10 text-stone hover:bg-black/5"
                  }`}
                >
                  Roasted oats
                </button>
                <button
                  onClick={() => setPresetOptions(prev => ({ ...prev, oatsChoice: "none" }))}
                  className={`px-3 py-2 rounded-lg text-[12px] font-body font-semibold border transition-colors ${
                    presetOptions.oatsChoice === "none"
                      ? "bg-sage/10 border-sage/30 text-sage-dark"
                      : "bg-white border-black/10 text-stone hover:bg-black/5"
                  }`}
                >
                  No Oats
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-black/10 p-3 bg-[#F9F8F6]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-body text-[12px] font-semibold text-ink">No sugar</p>
                  <p className="font-body text-[11px] text-stone mt-0.5">
                    Default is natural sweetness (banana, honey, dates).
                  </p>
                </div>
                <button
                  onClick={() => setPresetOptions(prev => ({ ...prev, noSugar: !prev.noSugar }))}
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors ${
                    presetOptions.noSugar ? "bg-sage" : "bg-black/15"
                  }`}
                  aria-pressed={presetOptions.noSugar}
                  aria-label="Toggle no sugar"
                >
                  <span
                    className={`block w-5 h-5 rounded-full bg-white transition-transform ${
                      presetOptions.noSugar ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              {presetOptions.noSugar && (
                <p className="font-body text-[11px] text-terracotta mt-2">
                  No sugar means banana, honey, and dates will not be added.
                </p>
              )}
            </div>
          </div>
          )}

          <div className={showStandardCustomizations ? "border-t border-black/5 pt-4 space-y-3" : "space-y-3"}>
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
