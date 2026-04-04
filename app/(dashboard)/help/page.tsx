"use client";
import { useState } from "react";

const faqs = [
  {q: "What time do deliveries happen?", a: "All deliveries are completed between 7:00 AM and 9:00 PM. Our partners will leave the package at your door or with security if instructed."},
  {q: "What are the cutoff times for ordering?", a: "For early morning deliveries (7:00–10:00 AM), please place your order before 11:00 PM the night before — this gives our kitchen overnight preparation time. For all other time slots (10:00 AM–9:00 PM), same-day delivery is available with at least 2 hours' notice after 9:00 AM. Orders placed before 9:00 AM are eligible from the 10:00 AM slot onwards."},
  {q: "Can I order at midnight for a 7 AM delivery?", a: "Yes! As long as you place your order before 11:00 PM the previous night, your 7:00–10:00 AM delivery slot will be honoured. Orders placed after 11:00 PM will not show early morning slots for next-day delivery — the earliest available will be 10:00 AM."},
  {q: "Can I cancel my order?", a: "Once an order has been placed, cancellations are not processed through the website. If you need urgent help with an order, please contact Nutravoe support directly."},
  {q: "How do refunds work after cancellation?", a: "Refunds are not initiated through the website after an order has been placed. Any exceptional support cases are handled manually by the Nutravoe team."},
  {q: "What if I need urgent help after placing an order?", a: "Please reach out immediately via WhatsApp or our support form. Our team will review the order status and guide you on the next steps."},
  {q: "Can I pause my subscription?", a: "Yes, you can pause your subscription at any time. Just visit the Subscriptions tab and click 'Pause'. Changes take effect 24 hours prior to the next scheduled delivery."},
  {q: "What is the shelf life of a bowl?", a: "Because we use absolutely no artificial preservatives or industrial stabilisers, our bowls are strictly fresh. They are best consumed within 24 hours and must be kept refrigerated at all times."},
  {q: "Are the bowls suitable for a vegan diet?", a: "Our traditional bowls use a probiotic dairy yogurt base. However, we occasionally run seasonal plant-based specials. Check the menu tags for 'Vegan Friendly'."},
  {q: "Is there any added sugar?", a: "None. We rely entirely on the natural sweetness of whole fruits, berries, and raw dates. No refined sugars, syrups, or artificial sweeteners are ever used."},
  {q: "How do I update my delivery address?", a: "You can manage your addresses from the 'Addresses' tab in your dashboard. Make sure to set your preferred address as 'Default' to route your subscription correctly."},
  {q: "What if I miss my delivery?", a: "Since the product requires refrigeration, our delivery partners will attempt to call you. If unreachable, they will follow your default fallback instructions (e.g., leave with security point)."},
  {q: "Do you cater for events or offices?", a: "Yes! We offer bulk corporate drops. Please send us an email specifying the headcount, and we will get back to you with custom pricing."},
  {q: "How does billing work for subscriptions?", a: "Subscription payments are reviewed and approved by the Nutravoe team before the wallet is loaded for the selected plan cycle. Once approved, the credited amount is used against deliveries within that plan window."},
  {q: "How are the bowls packaged?", a: "We use premium, food-safe, environmentally conscious packaging that seals in freshness while minimising our carbon footprint. Please recycle the empty containers."},
];


export default function HelpPage() {
  const [ticketSent, setTicketSent] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between mb-8">
        <h2 className="font-display text-2xl font-medium text-ink">Help & Support</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        
        {/* Quick Contact Option + FAQs */}
        <div className="flex flex-col gap-6 w-full">
          <div className="bg-[#F9F8F6] rounded-xl p-6 border border-black/5">
            <div className="w-12 h-12 rounded-full bg-sage/10 text-sage flex items-center justify-center mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </div>
            <h3 className="font-display text-lg font-medium text-ink mb-1">WhatsApp Support</h3>
            <p className="font-body text-[13px] text-stone mb-4">
              Get an instant resolution for your delivery via our concierge channel.
            </p>
            <button className="bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm w-fit">
              Message Us Now
            </button>
          </div>
          
          <div className="bg-white rounded-xl border border-black/5 shadow-sm overflow-hidden flex flex-col w-full">
            <div className="p-6 border-b border-black/5 bg-[#F9F8F6]">
              <h3 className="font-display text-lg font-medium text-ink">Frequently Asked Questions</h3>
            </div>
            <div className="divide-y divide-black/5 flex flex-col w-full">
              {faqs.map((faq, idx) => (
                <div key={idx} className="w-full">
                  <button 
                    onClick={() => toggleFaq(idx)}
                    className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-black/[0.02] transition-colors"
                  >
                    <span className={`font-body text-[13.5px] pr-4 ${openFaq === idx ? "font-bold text-sage" : "font-medium text-ink"}`}>
                      {faq.q}
                    </span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-stone shrink-0 transition-transform duration-300 ${openFaq === idx ? "rotate-45" : ""}`}><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                  </button>
                  <div className={`overflow-hidden transition-all duration-300 ${openFaq === idx ? "max-h-40 border-b border-black/5" : "max-h-0"}`}>
                    <p className="px-6 pb-4 pt-1 font-body text-[13px] text-stone leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Support Ticket Form */}
        <div className="bg-white rounded-xl p-6 border border-black/5 shadow-sm w-full sticky top-24">
          {ticketSent ? (
             <div className="h-full flex flex-col items-center justify-center py-8 text-center animate-in zoom-in-95 duration-300">
               <div className="w-12 h-12 rounded-full bg-sage/20 flex items-center justify-center text-sage mb-3">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
               </div>
               <h3 className="font-display text-xl font-medium text-ink mb-1">Message Sent</h3>
               <p className="font-body text-[13px] text-stone">Our team will get back to your registered email shortly.</p>
               <button onClick={() => setTicketSent(false)} className="mt-4 text-sage font-body text-[13px] font-bold hover:underline">Send another message</button>
             </div>
          ) : (
            <>
              <h3 className="font-display text-lg font-medium text-ink mb-1">Send us an email</h3>
              <p className="font-body text-[13px] text-stone mb-5">We typically reply within a few hours.</p>
              
              <form onSubmit={(e) => { e.preventDefault(); setTicketSent(true); }} className="flex flex-col gap-4">
                <div>
                  <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Topic</label>
                  <select className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-transparent text-ink">
                    <option>Where is my order?</option>
                    <option>Cancel my order</option>
                    <option>Refund status</option>
                    <option>Modify subscription</option>
                    <option>Product issue</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Message</label>
                  <textarea required rows={4} className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage bg-transparent resize-none"></textarea>
                </div>
                <button type="submit" className="bg-ink hover:bg-black text-white font-body text-[13px] font-bold px-6 py-3 rounded-md transition-colors shadow-sm w-full mt-2">
                  Send Message
                </button>
              </form>
            </>
          )}
        </div>

      </div>
    </div>
  );
}
