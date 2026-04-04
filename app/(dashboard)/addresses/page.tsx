"use client";
import { useState, useEffect, FormEvent } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";

const MapPicker = dynamic(() => import("@/components/MapPicker"), { ssr: false });

interface Address {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  pincode: string;
  is_default: boolean;
  lat: number | null;
  lng: number | null;
}

type FormData = { label: string; line1: string; line2: string; pincode: string };
const BLANK_FORM: FormData = { label: "Home", line1: "", line2: "", pincode: "560" };

export default function AddressesPage() {
  const supabase = createClient();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Add mode ──────────────────────────────────────────────────────────
  const [isAdding, setIsAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<FormData>(BLANK_FORM);
  const [showMap, setShowMap] = useState(false);
  const [pinLat, setPinLat] = useState<number | null>(null);
  const [pinLng, setPinLng] = useState<number | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | undefined>();

  // ── Edit mode ─────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormData>(BLANK_FORM);
  const [editSaving, setEditSaving] = useState(false);
  const [editShowMap, setEditShowMap] = useState(false);
  const [editPinLat, setEditPinLat] = useState<number | null>(null);
  const [editPinLng, setEditPinLng] = useState<number | null>(null);
  const [editMapCenter, setEditMapCenter] = useState<{ lat: number; lng: number } | undefined>();

  useEffect(() => { loadAddresses(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Geocode pincode for ADD form
  useEffect(() => {
    if (formData.pincode.length !== 6) return;
    fetch(`/api/geocode?pincode=${formData.pincode}`)
      .then(r => r.json())
      .then(d => { if (d.lat && d.lng) { setMapCenter({ lat: d.lat, lng: d.lng }); setPinLat(d.lat); setPinLng(d.lng); } })
      .catch(() => {});
  }, [formData.pincode]);

  // Geocode pincode for EDIT form
  useEffect(() => {
    if (editForm.pincode.length !== 6) return;
    fetch(`/api/geocode?pincode=${editForm.pincode}`)
      .then(r => r.json())
      .then(d => { if (d.lat && d.lng) { setEditMapCenter({ lat: d.lat, lng: d.lng }); } })
      .catch(() => {});
  }, [editForm.pincode]);

  async function loadAddresses() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const { data } = await supabase
      .from("addresses")
      .select("id, label, line1, line2, pincode, is_default, lat, lng")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true });
    const addrs = (data ?? []) as Address[];
    setAddresses(addrs);
    setLoading(false);
    syncNavbar(addrs);
  }

  function syncNavbar(addrs: Address[]) {
    const legacy = addrs.map(a => ({
      id: a.id, tag: a.label, line1: a.line1,
      line2: a.line2 ?? "", pincode: a.pincode, isDefault: a.is_default,
    }));
    localStorage.setItem("nutravoe_addresses", JSON.stringify(legacy));
    window.dispatchEvent(new Event("address_change"));
  }

  // ── Start editing an address ──────────────────────────────────────────
  function openEdit(addr: Address) {
    setEditingId(addr.id);
    setEditForm({ label: addr.label, line1: addr.line1, line2: addr.line2 ?? "", pincode: addr.pincode });
    setEditShowMap(false);
    setEditPinLat(addr.lat ?? null);
    setEditPinLng(addr.lng ?? null);
    setEditMapCenter(addr.lat && addr.lng ? { lat: addr.lat, lng: addr.lng } : undefined);
    // Close add form if open
    setIsAdding(false);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(BLANK_FORM);
    setEditShowMap(false);
    setEditPinLat(null);
    setEditPinLng(null);
    setEditMapCenter(undefined);
  }

  // ── Save existing address ─────────────────────────────────────────────
  const handleUpdate = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingId) return;
    setEditSaving(true);
    const { data, error } = await supabase
      .from("addresses")
      .update({
        label: editForm.label,
        line1: editForm.line1,
        line2: editForm.line2 || null,
        pincode: editForm.pincode,
        ...(editPinLat && editPinLng ? { lat: editPinLat, lng: editPinLng } : {}),
      })
      .eq("id", editingId)
      .select("id, label, line1, line2, pincode, is_default, lat, lng")
      .single();
    if (!error && data) {
      const updated = addresses.map(a => a.id === editingId ? (data as Address) : a);
      setAddresses(updated);
      syncNavbar(updated);
    }
    setEditSaving(false);
    cancelEdit();
  };

  // ── Add new address ───────────────────────────────────────────────────
  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }
    const { data, error } = await supabase
      .from("addresses")
      .insert({
        user_id: user.id,
        label: formData.label,
        line1: formData.line1,
        line2: formData.line2 || null,
        city: "Bengaluru",
        state: "Karnataka",
        pincode: formData.pincode,
        is_default: addresses.length === 0,
        ...(showMap && pinLat && pinLng ? { lat: pinLat, lng: pinLng } : {}),
      })
      .select("id, label, line1, line2, pincode, is_default, lat, lng")
      .single();
    if (!error && data) {
      const updated = [...addresses, data as Address];
      setAddresses(updated);
      syncNavbar(updated);
    }
    setSaving(false);
    setIsAdding(false);
    setFormData(BLANK_FORM);
    setShowMap(false);
    setPinLat(null); setPinLng(null); setMapCenter(undefined);
  };

  // ── Remove & set default ──────────────────────────────────────────────
  const removeAddress = async (id: string) => {
    const { error } = await supabase.from("addresses").delete().eq("id", id);
    if (!error) {
      const updated = addresses.filter(a => a.id !== id);
      setAddresses(updated);
      syncNavbar(updated);
    }
  };

  const setDefault = async (id: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("addresses").update({ is_default: false }).eq("user_id", user.id);
    await supabase.from("addresses").update({ is_default: true }).eq("id", id);
    const updated = addresses.map(a => ({ ...a, is_default: a.id === id }));
    setAddresses(updated);
    syncNavbar(updated);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-6 h-6 rounded-full border-2 border-sage border-t-transparent animate-spin" />
    </div>
  );

  // ── Shared form fields renderer ───────────────────────────────────────
  function AddressFields({
    form, setForm, mapOpen, setMapOpen, pLat, setPLat, pLng, setPLng, center,
  }: {
    form: FormData;
    setForm: (f: FormData) => void;
    mapOpen: boolean;
    setMapOpen: (v: boolean) => void;
    pLat: number | null;
    setPLat: (v: number | null) => void;
    pLng: number | null;
    setPLng: (v: number | null) => void;
    center: { lat: number; lng: number } | undefined;
  }) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <div>
          <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Address Tag</label>
          <select
            value={form.label}
            onChange={e => setForm({ ...form, label: e.target.value })}
            className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-white"
          >
            <option>Home</option>
            <option>Office</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Pincode</label>
          <input
            required type="text" maxLength={6} placeholder="5600xx"
            value={form.pincode}
            onChange={e => setForm({ ...form, pincode: e.target.value.replace(/\D/g, "") })}
            className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-white"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Flat, House no., Building</label>
          <input
            required type="text" value={form.line1}
            onChange={e => setForm({ ...form, line1: e.target.value })}
            className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-white"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Area, Street, Sector</label>
          <input
            required type="text" value={form.line2}
            onChange={e => setForm({ ...form, line2: e.target.value })}
            className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-white"
          />
        </div>
        {/* Map pin picker */}
        <div className="md:col-span-2 border border-dashed border-black/15 rounded-lg overflow-hidden">
          <button
            type="button"
            onClick={() => setMapOpen(!mapOpen)}
            className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-black/[0.02] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sage shrink-0">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            <span className="font-body text-[13px] text-ink font-medium">
              {pLat && pLng ? "Change pin location" : "Pin your exact location"}
            </span>
            {pLat && pLng && (
              <span className="font-body text-[11px] text-sage-dark font-bold ml-1">✓ Pinned</span>
            )}
            {!pLat && <span className="font-body text-[11px] text-stone ml-1">(optional)</span>}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`ml-auto text-stone transition-transform ${mapOpen ? "rotate-180" : ""}`}>
              <path d="m6 9 6 6 6-6"/>
            </svg>
          </button>
          {mapOpen && (
            <div className="px-4 pb-4">
              <p className="font-body text-[12px] text-stone mb-3">
                Drag the pin or tap the map to mark your exact gate or building entrance.
              </p>
              <MapPicker
                centerLat={center?.lat ?? pLat ?? undefined}
                centerLng={center?.lng ?? pLng ?? undefined}
                onChange={(lat, lng) => { setPLat(lat); setPLng(lng); }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-medium text-ink">Delivery Addresses</h2>
        {!isAdding && !editingId && (
          <button
            onClick={() => setIsAdding(true)}
            className="px-4 py-2 bg-black/5 hover:bg-black/10 text-ink rounded-md font-body text-[13px] font-bold transition-colors flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            Add New
          </button>
        )}
      </div>

      {/* ── Add form ──────────────────────────────────────────────────── */}
      {isAdding && (
        <form onSubmit={handleSave} className="mb-8 p-6 bg-[#F9F8F6] rounded-xl border border-black/5">
          <h3 className="font-display text-lg font-medium text-ink mb-4">Add a New Address</h3>
          <AddressFields
            form={formData} setForm={setFormData}
            mapOpen={showMap} setMapOpen={setShowMap}
            pLat={pinLat} setPLat={setPinLat}
            pLng={pinLng} setPLng={setPinLng}
            center={mapCenter}
          />
          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="bg-sage hover:bg-sage-dark disabled:opacity-50 text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm">
              {saving ? "Saving…" : "Save Address"}
            </button>
            <button type="button"
              onClick={() => { setIsAdding(false); setShowMap(false); setPinLat(null); setPinLng(null); setMapCenter(undefined); setFormData(BLANK_FORM); }}
              className="bg-white hover:bg-black/5 border border-black/10 text-ink font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* ── Address cards ─────────────────────────────────────────────── */}
      {addresses.length === 0 && !isAdding ? (
        <div className="text-center py-12 px-4 bg-black/5 rounded-xl border border-black/5 border-dashed">
          <p className="font-body text-[14px] text-stone">You don&apos;t have any saved addresses.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`border-2 rounded-xl relative transition-all ${addr.is_default ? "border-sage/50 bg-[#F9F8F6]/50" : "border-black/5 bg-white hover:border-black/15"}`}
            >
              {editingId === addr.id ? (
                /* ── Inline edit form ──────────────────────────────── */
                <form onSubmit={handleUpdate} className="p-6">
                  <h3 className="font-display text-lg font-medium text-ink mb-4">Edit Address</h3>
                  <AddressFields
                    form={editForm} setForm={setEditForm}
                    mapOpen={editShowMap} setMapOpen={setEditShowMap}
                    pLat={editPinLat} setPLat={setEditPinLat}
                    pLng={editPinLng} setPLng={setEditPinLng}
                    center={editMapCenter}
                  />
                  <div className="flex gap-3">
                    <button type="submit" disabled={editSaving}
                      className="bg-sage hover:bg-sage-dark disabled:opacity-50 text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm">
                      {editSaving ? "Saving…" : "Update Address"}
                    </button>
                    <button type="button" onClick={cancelEdit}
                      className="bg-white hover:bg-black/5 border border-black/10 text-ink font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                /* ── Card view ─────────────────────────────────────── */
                <div className="p-6">
                  {addr.is_default && (
                    <div className="absolute top-4 right-4 px-2 py-0.5 bg-sage text-white text-[9px] font-bold uppercase tracking-wider rounded-sm">Default</div>
                  )}
                  <div className="flex items-start gap-3 mb-3">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${addr.is_default ? "text-sage" : "text-stone"} mt-0.5 shrink-0`}>
                      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    <div className="pr-10">
                      <h3 className="font-display text-lg font-medium text-ink">{addr.label}</h3>
                      <p className="font-body text-[13px] text-stone mt-1 leading-relaxed">
                        {addr.line1}<br />
                        {addr.line2 && <>{addr.line2}<br /></>}
                        Karnataka {addr.pincode}
                      </p>
                      {addr.lat && addr.lng && (
                        <span className="inline-flex items-center gap-1 mt-2 font-body text-[11px] text-sage-dark font-medium">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                          Pin saved
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-5 flex gap-4 border-t border-black/5 pt-4">
                    <button
                      onClick={() => openEdit(addr)}
                      className="text-ink hover:text-sage-dark font-body text-[12px] font-bold uppercase tracking-wider transition-colors flex items-center gap-1.5"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit
                    </button>
                    {!addr.is_default && (
                      <button
                        onClick={() => setDefault(addr.id)}
                        className="text-sage hover:text-sage-dark font-body text-[12px] font-bold uppercase tracking-wider transition-colors"
                      >
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => removeAddress(addr.id)}
                      className="text-stone hover:text-terracotta font-body text-[12px] font-bold uppercase tracking-wider transition-colors ml-auto"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
