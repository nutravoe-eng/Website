"use client";
import { useState, useEffect, FormEvent } from "react";

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  expiry: string;
}

export default function PaymentMethodsPage() {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ number: "", expiry: "", cvc: "" });

  useEffect(() => {
    const stored = localStorage.getItem("nutravoe_payments");
    if (stored) {
      setMethods(JSON.parse(stored));
    }
  }, []);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (formData.number.length < 15) return;
    
    const newMethod: PaymentMethod = {
      id: Date.now().toString(),
      brand: formData.number.startsWith('4') ? 'Visa' : 'Mastercard',
      last4: formData.number.slice(-4),
      expiry: formData.expiry
    };
    
    const updated = [...methods, newMethod];
    setMethods(updated);
    localStorage.setItem("nutravoe_payments", JSON.stringify(updated));
    setIsAdding(false);
    setFormData({ number: "", expiry: "", cvc: "" });
  };

  const removeMethod = (id: string) => {
    const updated = methods.filter(m => m.id !== id);
    setMethods(updated);
    localStorage.setItem("nutravoe_payments", JSON.stringify(updated));
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-display text-2xl font-medium text-ink">Payment Methods</h2>
        {methods.length > 0 && !isAdding && (
          <button onClick={() => setIsAdding(true)} className="px-4 py-2 bg-black/5 hover:bg-black/10 text-ink rounded-md font-body text-[13px] font-bold transition-colors flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
            Add Card
          </button>
        )}
      </div>
      
      {isAdding && (
        <form onSubmit={handleSave} className="mb-8 p-6 bg-[#F9F8F6] rounded-xl border border-black/5">
          <h3 className="font-display text-lg font-medium text-ink mb-4">Add a New Card</h3>
          <div className="grid grid-cols-2 gap-4 mb-5 max-w-md">
            <div className="col-span-2">
              <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Card Number</label>
              <input required type="text" maxLength={19} placeholder="xxxx xxxx xxxx xxxx" value={formData.number} onChange={e => setFormData({...formData, number: e.target.value.replace(/\D/g, '')})} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-white flex-1" />
            </div>
            <div>
              <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Expiry</label>
              <input required type="text" maxLength={5} placeholder="MM/YY" value={formData.expiry} onChange={e => setFormData({...formData, expiry: e.target.value})} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-white" />
            </div>
            <div>
              <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">CVC</label>
              <input required type="password" maxLength={4} placeholder="•••" value={formData.cvc} onChange={e => setFormData({...formData, cvc: e.target.value.replace(/\D/g, '')})} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-white" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm">Save Card</button>
            <button type="button" onClick={() => setIsAdding(false)} className="bg-white hover:bg-black/5 border border-black/10 text-ink font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors">Cancel</button>
          </div>
        </form>
      )}

      {methods.length === 0 && !isAdding ? (
        <div className="bg-[#F9F8F6] border border-black/5 rounded-xl p-8 text-center flex flex-col items-center">
          <div className="w-12 h-12 bg-white rounded-md shadow-sm border border-black/5 flex items-center justify-center text-stone mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
          </div>
          <h3 className="font-display text-lg font-medium text-ink mb-1">No saved payments</h3>
          <p className="font-body text-[13px] text-stone mb-6 max-w-xs leading-relaxed">
            When you place a subscription order or manually checkout via Razorpay, you can choose to save your card here for faster checkouts.
          </p>
          <button onClick={() => setIsAdding(true)} className="bg-ink hover:bg-black text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm">
            Add Payment Method
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
           {methods.map((method) => (
             <div key={method.id} className="border border-black/10 rounded-xl p-5 bg-white flex items-center justify-between">
               <div className="flex items-center gap-4">
                 <div className="w-14 h-9 bg-[#F9F8F6] border border-black/5 rounded flex items-center justify-center font-display font-medium text-[10px] tracking-widest text-ink">
                   {method.brand.toUpperCase()}
                 </div>
                 <div>
                   <p className="font-body text-[14px] font-bold text-ink">•••• {method.last4}</p>
                   <p className="font-body text-[12px] text-stone">Expires {method.expiry}</p>
                 </div>
               </div>
               <button onClick={() => removeMethod(method.id)} className="w-8 h-8 rounded hover:bg-black/5 flex items-center justify-center text-stone hover:text-terracotta transition-colors">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
               </button>
             </div>
           ))}
        </div>
      )}
    </div>
  );
}
