"use client";
import { useState, useEffect, FormEvent } from "react";

interface Address {
  id: string;
  tag: string;
  line1: string;
  line2: string;
  pincode: string;
  isDefault: boolean;
}

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ tag: "Home", line1: "", line2: "", pincode: "560001" });

  useEffect(() => {
    const stored = localStorage.getItem("nutravoe_addresses");
    if (stored) {
      setAddresses(JSON.parse(stored));
    } else {
      // Default mock address
      const defaultAddy = [{ 
        id: "1", tag: "Home", isDefault: true, 
        line1: "Appt 401, Brigade Orchards", line2: "Devanahalli, Bengaluru", pincode: "562110" 
      }];
      setAddresses(defaultAddy);
      localStorage.setItem("nutravoe_addresses", JSON.stringify(defaultAddy));
    }
  }, []);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    const newAddress: Address = {
      id: Date.now().toString(),
      isDefault: addresses.length === 0,
      ...formData
    };
    const updated = [...addresses, newAddress];
    setAddresses(updated);
    localStorage.setItem("nutravoe_addresses", JSON.stringify(updated));
    window.dispatchEvent(new Event("address_change"));
    setIsAdding(false);
    setFormData({ tag: "Home", line1: "", line2: "", pincode: "560001" });
  };

  const removeAddress = (id: string) => {
    const updated = addresses.filter(a => a.id !== id);
    setAddresses(updated);
    localStorage.setItem("nutravoe_addresses", JSON.stringify(updated));
    window.dispatchEvent(new Event("address_change"));
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl font-medium text-ink">Delivery Addresses</h2>
        {!isAdding && (
          <button onClick={() => setIsAdding(true)} className="px-4 py-2 bg-black/5 hover:bg-black/10 text-ink rounded-md font-body text-[13px] font-bold transition-colors flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            Add New
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleSave} className="mb-8 p-6 bg-[#F9F8F6] rounded-xl border border-black/5">
          <h3 className="font-display text-lg font-medium text-ink mb-4">Add a New Address</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Address Tag</label>
              <select value={formData.tag} onChange={e => setFormData({...formData, tag: e.target.value})} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-white">
                <option>Home</option>
                <option>Office</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Pincode</label>
              <input required type="text" maxLength={6} placeholder="5600xx" value={formData.pincode} onChange={e => setFormData({...formData, pincode: e.target.value.replace(/\D/g, '')})} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-white" />
            </div>
            <div className="md:col-span-2">
              <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Flat, House no., Building</label>
              <input required type="text" value={formData.line1} onChange={e => setFormData({...formData, line1: e.target.value})} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-white" />
            </div>
            <div className="md:col-span-2">
              <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Area, Street, Sector</label>
              <input required type="text" value={formData.line2} onChange={e => setFormData({...formData, line2: e.target.value})} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-white" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm">Save Address</button>
            <button type="button" onClick={() => setIsAdding(false)} className="bg-white hover:bg-black/5 border border-black/10 text-ink font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {addresses.length === 0 && !isAdding ? (
        <div className="text-center py-12 px-4 bg-black/5 rounded-xl border border-black/5 border-dashed">
          <p className="font-body text-[14px] text-stone">You don't have any saved addresses.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {addresses.map((addr) => (
            <div key={addr.id} className={`border-2 rounded-xl p-6 relative transition-all ${addr.isDefault ? "border-sage/50 bg-[#F9F8F6]/50" : "border-black/5 bg-white hover:border-black/15"}`}>
              {addr.isDefault && <div className="absolute top-4 right-4 px-2 py-0.5 bg-sage text-white text-[9px] font-bold uppercase tracking-wider rounded-sm">Default</div>}
              <div className="flex items-start gap-3 mb-3 hover:cursor-default">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${addr.isDefault ? "text-sage" : "text-stone"} mt-0.5`}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                <div className="pr-10">
                  <h3 className="font-display text-lg font-medium text-ink">{addr.tag}</h3>
                  <p className="font-body text-[13px] text-stone mt-1 leading-relaxed">
                    {addr.line1}<br/>
                    {addr.line2}<br/>
                    Karnataka {addr.pincode}
                  </p>
                </div>
              </div>
              <div className="mt-5 flex gap-3 border-t border-black/5 pt-4">
                <button onClick={() => removeAddress(addr.id)} className="text-stone hover:text-terracotta font-body text-[12px] font-bold uppercase tracking-wider transition-colors">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
