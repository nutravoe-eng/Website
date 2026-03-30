"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";

export default function OrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem("nutravoe_orders");
    if (stored) {
      setOrders(JSON.parse(stored));
    }
  }, []);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-display text-2xl font-medium text-ink">Order History</h2>
      </div>
      
      {orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-[#F9F8F6] rounded-xl border border-black/5 border-dashed">
          <div className="relative w-20 h-20 mb-6 grayscale opacity-40 mix-blend-multiply">
            <Image src="/nutravoe_image.jpg" alt="No Orders" fill className="object-cover rounded-full" />
          </div>
          <h3 className="font-display text-xl font-medium text-ink mb-2">No orders yet</h3>
          <p className="font-body text-[13.5px] text-stone max-w-sm mb-6 leading-relaxed">
            Looks like you haven't started your morning ritual yet. Explore our menu to find your perfect bowl.
          </p>
          <Link 
            href="/menu" 
            className="bg-terracotta hover:bg-terracotta/90 text-white font-body text-[13px] font-bold tracking-wide px-8 py-3 rounded-md transition-all shadow-sm"
          >
            Explore Menu
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order, index) => (
            <div key={index} className="bg-white border text-ink border-black/10 rounded-xl p-6 shadow-sm hover:border-sage/40 transition-colors group">
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-black/5 pb-4 mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-display text-lg font-medium text-ink">Order #{order.id}</h3>
                    <span className="px-2 py-0.5 bg-sage/10 text-sage-dark font-body text-[10px] uppercase tracking-wider font-bold rounded-sm">
                      {order.status}
                    </span>
                  </div>
                  <p className="font-body text-[12px] text-stone">Placed on {order.date}</p>
                  {order.slot && (
                    <p className="font-body text-[12px] text-stone/80 mt-0.5 flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {order.slot}
                    </p>
                  )}
                </div>
                <div className="text-left md:text-right">
                  <p className="font-display text-xl font-medium text-sage-dark">₹{order.total}</p>
                </div>
              </div>
              
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-[#F9F8F6] shrink-0 flex items-center justify-center text-stone">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                </div>
                <div>
                  <h4 className="font-body text-[13px] font-medium text-ink mb-1 group-hover:text-sage-dark transition-colors">Items</h4>
                  <p className="font-body text-[13px] text-stone/90 leading-relaxed">
                    {order.items}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
