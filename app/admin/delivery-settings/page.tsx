"use client";

import { useEffect, useMemo, useState } from "react";
import AdminTopNav from "../components/AdminTopNav";
import type { DeliveryPolicy } from "@/lib/delivery-policy";

interface SlotEntry {
  key: string;
  label: string;
}

interface BlockedSlotRow {
  key: string;
  label: string;
  reasons: Array<"blackoutWindow" | "disabledSlot">;
}

const DEFAULT_FORM: DeliveryPolicy = {
  asapEnabled: true,
  blackoutStartIso: null,
  blackoutEndIso: null,
  disabledSlotKeys: [],
  blackoutExemptSlotKeys: [],
};

export default function AdminDeliverySettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [policy, setPolicy] = useState<DeliveryPolicy>(DEFAULT_FORM);
  const [slots, setSlots] = useState<SlotEntry[]>([]);
  const [blackoutFilterDate, setBlackoutFilterDate] = useState<string>(() => {
    const nowIst = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const y = nowIst.getFullYear();
    const m = String(nowIst.getMonth() + 1).padStart(2, "0");
    const d = String(nowIst.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      const res = await fetch("/api/admin/delivery-settings");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Failed to load delivery settings.");
        setLoading(false);
        return;
      }
      setPolicy(data.policy ?? DEFAULT_FORM);
      setSlots(Array.isArray(data.slots) ? data.slots : []);
      setLoading(false);
    };
    load();
  }, []);

  const blackoutStartValue = policy.blackoutStartIso ? policy.blackoutStartIso.slice(0, 16) : "";
  const blackoutEndValue = policy.blackoutEndIso ? policy.blackoutEndIso.slice(0, 16) : "";

  const disabledSet = useMemo(() => new Set(policy.disabledSlotKeys), [policy.disabledSlotKeys]);
  const blackoutExemptSet = useMemo(() => new Set(policy.blackoutExemptSlotKeys), [policy.blackoutExemptSlotKeys]);
  const blockedSlotsForDate = useMemo(() => {
    const blockedMap = new Map<string, BlockedSlotRow>();
    const blackoutStartMs = policy.blackoutStartIso ? new Date(policy.blackoutStartIso).getTime() : null;
    const blackoutEndMs = policy.blackoutEndIso ? new Date(policy.blackoutEndIso).getTime() : null;

    // 1) Explicitly disabled slots are always blocked.
    for (const key of policy.disabledSlotKeys) {
      const [dateIso] = key.split("|");
      if (dateIso !== blackoutFilterDate) continue;
      const row = blockedMap.get(key) ?? { key, label: formatSlotLabelFromKey(key), reasons: [] };
      row.reasons = [...new Set([...row.reasons, "disabledSlot"])];
      blockedMap.set(key, row);
    }

    // 2) Blackout window blocks slots unless exempted.
    if (
      blackoutStartMs !== null &&
      blackoutEndMs !== null &&
      Number.isFinite(blackoutStartMs) &&
      Number.isFinite(blackoutEndMs) &&
      blackoutStartMs < blackoutEndMs
    ) {
      for (let hour = 7; hour < 20; hour += 1) {
        const slotKey = `${blackoutFilterDate}|${String(hour).padStart(2, "0")}`;
        if (blackoutExemptSet.has(slotKey)) continue;
        const slotStartMs = new Date(`${blackoutFilterDate}T${String(hour).padStart(2, "0")}:00:00+05:30`).getTime();
        if (slotStartMs >= blackoutStartMs && slotStartMs < blackoutEndMs) {
          const row = blockedMap.get(slotKey) ?? { key: slotKey, label: formatSlotLabelFromKey(slotKey), reasons: [] };
          row.reasons = [...new Set([...row.reasons, "blackoutWindow"])];
          blockedMap.set(slotKey, row);
        }
      }
    }

    return Array.from(blockedMap.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [
    blackoutFilterDate,
    blackoutExemptSet,
    policy.blackoutEndIso,
    policy.blackoutStartIso,
    policy.disabledSlotKeys,
  ]);

  function setBlackout(start: string, end: string) {
    setPolicy((prev) => ({
      ...prev,
      blackoutStartIso: start ? `${start}:00+05:30` : null,
      blackoutEndIso: end ? `${end}:00+05:30` : null,
    }));
  }

  function toggleDisabledSlot(key: string) {
    setPolicy((prev) => ({
      ...prev,
      disabledSlotKeys: prev.disabledSlotKeys.includes(key)
        ? prev.disabledSlotKeys.filter((entry) => entry !== key)
        : [...prev.disabledSlotKeys, key],
    }));
  }

  function toggleBlackoutExemptSlot(key: string) {
    setPolicy((prev) => ({
      ...prev,
      blackoutExemptSlotKeys: prev.blackoutExemptSlotKeys.includes(key)
        ? prev.blackoutExemptSlotKeys.filter((entry) => entry !== key)
        : [...prev.blackoutExemptSlotKeys, key],
    }));
  }

  function cancelBlackoutForSlot(key: string) {
    setPolicy((prev) => ({
      ...prev,
      disabledSlotKeys: prev.disabledSlotKeys.filter((entry) => entry !== key),
      blackoutExemptSlotKeys: prev.blackoutExemptSlotKeys.includes(key)
        ? prev.blackoutExemptSlotKeys
        : [...prev.blackoutExemptSlotKeys, key],
    }));
  }

  async function save() {
    setSaving(true);
    setError("");
    setSuccess("");
    const res = await fetch("/api/admin/delivery-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(policy),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      setError(typeof data?.error === "string" ? data.error : "Failed to save.");
      setSaving(false);
      return;
    }
    setSuccess("Delivery settings saved.");
    setSaving(false);
  }

  if (loading) {
    return <p className="font-body text-sm text-stone animate-pulse">Loading delivery settings...</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-ink">Delivery Settings</h1>
        <div className="flex items-center gap-2">
          <AdminTopNav current="delivery-settings" />
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-sage px-4 py-2 font-body text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {error && <p className="rounded-md border border-terracotta/25 bg-terracotta/5 px-4 py-3 font-body text-sm text-terracotta">{error}</p>}
      {success && <p className="rounded-md border border-sage/25 bg-sage/10 px-4 py-3 font-body text-sm text-sage-dark">{success}</p>}

      <section className="rounded-xl border border-black/10 bg-white p-5 space-y-4">
        <h2 className="font-body text-[12px] font-bold uppercase tracking-wider text-stone">Instant Delivery Mode</h2>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={policy.asapEnabled}
            onChange={(event) => setPolicy((prev) => ({ ...prev, asapEnabled: event.target.checked }))}
          />
          <span className="font-body text-sm text-ink">Enable "Delivery in 60 min" (available only 9:00 AM-7:00 PM)</span>
        </label>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-5 space-y-4">
        <h2 className="font-body text-[12px] font-bold uppercase tracking-wider text-stone">Temporary Blackout</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="font-body text-xs text-stone">Blackout start (IST)</span>
            <input
              type="datetime-local"
              value={blackoutStartValue}
              onChange={(event) => setBlackout(event.target.value, blackoutEndValue)}
              className="w-full rounded-md border border-black/10 px-3 py-2 font-body text-sm"
            />
          </label>
          <label className="space-y-1">
            <span className="font-body text-xs text-stone">Blackout end (IST)</span>
            <input
              type="datetime-local"
              value={blackoutEndValue}
              onChange={(event) => setBlackout(blackoutStartValue, event.target.value)}
              className="w-full rounded-md border border-black/10 px-3 py-2 font-body text-sm"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => setPolicy((prev) => ({ ...prev, blackoutStartIso: null, blackoutEndIso: null, blackoutExemptSlotKeys: [] }))}
          className="font-body text-xs font-bold uppercase tracking-wider text-stone underline"
        >
          Clear blackout window
        </button>
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-5 space-y-4">
        <h2 className="font-body text-[12px] font-bold uppercase tracking-wider text-stone">Blocked Slots by Date</h2>
        <p className="font-body text-xs text-stone">
          View slots blocked by either blackout window or disabled-slot rules, and cancel blackout per slot.
        </p>
        <div className="max-w-xs">
          <label className="space-y-1 block">
            <span className="font-body text-xs text-stone">Filter date (IST)</span>
            <input
              type="date"
              value={blackoutFilterDate}
              onChange={(event) => setBlackoutFilterDate(event.target.value)}
              className="w-full rounded-md border border-black/10 px-3 py-2 font-body text-sm"
            />
          </label>
        </div>
        {blockedSlotsForDate.length === 0 ? (
          <p className="font-body text-xs text-stone">No blocked slots on this date.</p>
        ) : (
          <div className="space-y-2">
            {blockedSlotsForDate.map((slot) => (
              <div key={slot.key} className="flex items-center justify-between gap-3 rounded-md border border-black/5 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-body text-xs text-ink truncate">{slot.label}</p>
                  <p className="font-body text-[11px] mt-0.5 text-terracotta">
                    Blocked by {slot.reasons.includes("blackoutWindow") && slot.reasons.includes("disabledSlot")
                      ? "blackout window + disabled slot"
                      : slot.reasons.includes("blackoutWindow")
                        ? "blackout window"
                        : "disabled slot"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => cancelBlackoutForSlot(slot.key)}
                  className="shrink-0 rounded-md px-3 py-1.5 font-body text-[11px] font-bold uppercase tracking-wider transition-colors bg-sage text-white hover:bg-sage-dark"
                >
                  Cancel blackout
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-xl border border-black/10 bg-white p-5 space-y-4">
        <h2 className="font-body text-[12px] font-bold uppercase tracking-wider text-stone">Disable Specific Slots</h2>
        <p className="font-body text-xs text-stone">Choose slots to hide from checkout while leaving other slots active.</p>
        <div className="grid gap-2 md:grid-cols-2">
          {slots.map((slot) => (
            <label key={slot.key} className="flex items-center gap-2 rounded-md border border-black/5 px-3 py-2">
              <input
                type="checkbox"
                checked={disabledSet.has(slot.key)}
                onChange={() => toggleDisabledSlot(slot.key)}
              />
              <span className="font-body text-xs text-ink">{slot.label}</span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatSlotLabelFromKey(key: string): string {
  const [dateIso, hourRaw] = key.split("|");
  const hour = Number(hourRaw);
  if (!dateIso || Number.isNaN(hour)) return key;
  const start = new Date(`${dateIso}T${String(hour).padStart(2, "0")}:00:00+05:30`);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  const dateLabel = start.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const startLabel = start.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  const endLabel = end.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${dateLabel}, ${startLabel} - ${endLabel}`;
}
