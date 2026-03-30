"use client";
import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({ name: "", phone: "", email: "" });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("nutravoe_currentUser");
    if (stored) {
      const parsed = JSON.parse(stored);
      setUser(parsed);
      setFormData({ name: parsed.name || "", phone: parsed.phone || "", email: parsed.email || "" });
    }
  }, []);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Update current user
    const updatedUser = { ...user, ...formData };
    localStorage.setItem("nutravoe_currentUser", JSON.stringify(updatedUser));
    
    // Update in users array
    const storedUsers = localStorage.getItem("nutravoe_users");
    if (storedUsers) {
      const users = JSON.parse(storedUsers);
      const index = users.findIndex((u: any) => u.id === user.id);
      if (index !== -1) {
        users[index] = { ...users[index], ...formData };
        localStorage.setItem("nutravoe_users", JSON.stringify(users));
      }
    }
    
    setUser(updatedUser);
    setEditing(false);
    window.dispatchEvent(new Event("auth_change"));
  };

  const handleDeleteAccount = () => {
    if (deleteConfirmText.trim().toLowerCase() !== "i dont want healthy eating habits") return;
    
    // Remove from users array
    const storedUsers = localStorage.getItem("nutravoe_users");
    if (storedUsers) {
      const users = JSON.parse(storedUsers);
      const filtered = users.filter((u: any) => u.id !== user.id);
      localStorage.setItem("nutravoe_users", JSON.stringify(filtered));
    }
    
    // Clear session & data
    localStorage.removeItem("nutravoe_currentUser");
    localStorage.removeItem("nutravoe_addresses");
    localStorage.removeItem("nutravoe_payments");
    
    window.dispatchEvent(new Event("auth_change"));
    router.push("/");
  };

  if (!user) return null;

  return (
    <>
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
      <h2 className="font-display text-2xl font-medium text-ink mb-6">Profile Information</h2>
      
      <form onSubmit={handleSave} className="max-w-xl flex flex-col gap-6">
        <div className="flex gap-4 items-center mb-2">
          <div className="w-20 h-20 rounded-full bg-sage/10 flex items-center justify-center text-sage text-2xl font-bold uppercase ring-1 ring-sage/20">
            {user.name[0]}
          </div>
          <button type="button" className="font-body text-[13px] font-bold text-sage hover:underline">Change Photo</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Full Name</label>
            <input 
              type="text" 
              value={formData.name} 
              onChange={(e) => setFormData({...formData, name: e.target.value})}
              className={`w-full border rounded-md px-3 py-2.5 font-body text-sm outline-none transition-all ${editing ? "border-sage bg-white text-ink shadow-[0_0_0_1px_rgba(125,155,118,1)]" : "border-black/20 bg-black/5 text-ink/80 pointer-events-none"}`} 
              readOnly={!editing} 
            />
          </div>
          <div>
            <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Phone</label>
            <input 
              type="text" 
              value={formData.phone} 
              onChange={(e) => setFormData({...formData, phone: e.target.value.replace(/\D/g, '')})}
              className={`w-full border rounded-md px-3 py-2.5 font-body text-sm outline-none transition-all ${editing ? "border-sage bg-white text-ink shadow-[0_0_0_1px_rgba(125,155,118,1)]" : "border-black/20 bg-black/5 text-ink/80 pointer-events-none"}`} 
              readOnly={!editing} 
            />
          </div>
          <div className="md:col-span-2">
            <label className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Email Address</label>
            <input 
              type="email" 
              value={formData.email} 
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className={`w-full border rounded-md px-3 py-2.5 font-body text-sm outline-none transition-all ${editing ? "border-sage bg-white text-ink shadow-[0_0_0_1px_rgba(125,155,118,1)]" : "border-black/20 bg-black/5 text-ink/80 pointer-events-none"}`} 
              readOnly={!editing} 
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-4 border-t border-black/5 flex flex-col items-start gap-4">
          <div className="flex gap-3">
            {editing ? (
              <>
                <button type="submit" className="bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm">
                  Save Changes
                </button>
                <button type="button" onClick={() => {
                  setEditing(false);
                  setFormData({ name: user.name || "", phone: user.phone || "", email: user.email || "" });
                }} className="bg-black/5 hover:bg-black/10 text-ink font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm">
                Edit Details
              </button>
            )}
          </div>
          
          {!editing && (
            <button type="button" onClick={() => setShowDeleteModal(true)} className="mt-8 text-terracotta hover:underline font-body text-[12px] font-medium transition-colors">
              Delete my account
            </button>
          )}
        </div>
      </form>
    </div>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="w-12 h-12 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            </div>
            
            {deleteStep === 1 ? (
              <>
                <h3 className="font-display text-2xl font-medium text-ink mb-2">We're sad to see you go...</h3>
                <p className="font-body text-[14px] text-stone mb-4 leading-relaxed">
                  It breaks our heart to see you go! Nutravoe was built to make eating healthy effortless, and we'll miss being part of your routine. This will permanently erase your saved addresses, payment methods, and subscription history.
                </p>
                <div className="bg-[#F9F8F6] p-4 rounded-lg border border-black/5 mb-6">
                  <p className="font-body text-[13px] text-ink/80 leading-relaxed font-medium">
                    Please note: We will be retaining the account data for 30 days in line with our policies before permanent deletion. If you deleted your account by mistake, you can send us an email within this timeframe to restore it.
                  </p>
                </div>
                
                <div className="flex gap-3">
                  <button 
                    onClick={() => setDeleteStep(2)}
                    className="flex-1 bg-terracotta hover:bg-[#D55F43] text-white font-body text-[13px] font-bold py-3 rounded-md transition-colors shadow-sm"
                  >
                    Proceed to Deletion
                  </button>
                  <button 
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeleteStep(1);
                    }}
                    className="flex-[0.5] bg-white hover:bg-black/5 border border-black/10 text-ink font-body text-[13px] font-bold py-3 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="font-display text-2xl font-medium text-ink mb-2">Final Confirmation</h3>
                <p className="font-body text-[14px] text-stone mb-6 leading-relaxed">
                  You are about to permanently delete your Nutravoe profile.
                </p>
                
                <label className="block font-body text-[12px] font-bold text-ink mb-2 uppercase tracking-wide">
                  To confirm, type: <span className="text-terracotta select-all">I dont want healthy eating habits</span>
                </label>
                <input 
                  type="text" 
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type the phrasing exactly..."
                  className="w-full border border-black/20 rounded-md px-3 py-3 font-body text-sm outline-none focus:border-terracotta mb-6 text-ink" 
                />
                
                <div className="flex gap-3">
                  <button 
                    onClick={handleDeleteAccount}
                    disabled={deleteConfirmText.trim().toLowerCase() !== "i dont want healthy eating habits"}
                    className={`flex-1 font-body text-[13px] font-bold py-3 rounded-md transition-colors shadow-sm ${
                      deleteConfirmText.trim().toLowerCase() === "i dont want healthy eating habits" 
                        ? "bg-terracotta hover:bg-[#D55F43] text-white" 
                        : "bg-black/5 text-stone cursor-not-allowed"
                    }`}
                  >
                    Delete My Account
                  </button>
                  <button 
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeleteStep(1);
                      setDeleteConfirmText("");
                    }}
                    className="flex-[0.5] bg-white hover:bg-black/5 border border-black/10 text-ink font-body text-[13px] font-bold py-3 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
