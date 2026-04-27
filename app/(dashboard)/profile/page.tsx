"use client";
import { useState, useEffect, FormEvent, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useDialogAccessibility } from "@/lib/use-dialog-accessibility";

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();

  const [userId, setUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", phone: "", email: "" });
  const [originalData, setOriginalData] = useState({ name: "", phone: "", email: "" });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteStep, setDeleteStep] = useState<1 | 2>(1);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [saveError, setSaveError] = useState("");
  const deleteDialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(deleteDialogRef, () => setShowDeleteModal(false));

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwEmailWarning, setPwEmailWarning] = useState("");
  const passwordDialogRef = useRef<HTMLDivElement>(null);
  useDialogAccessibility(passwordDialogRef, () => { setShowPasswordModal(false); setPwForm({ current: "", next: "", confirm: "" }); setPwError(""); setPwSuccess(false); });

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: profile } = await supabase
        .from("users")
        .select("full_name, phone")
        .eq("id", user.id)
        .single();

      const d = {
        name: profile?.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? "",
        phone: profile?.phone ?? "",
        email: user.email ?? "",
      };
      setFormData(d);
      setOriginalData(d);
      setLoaded(true);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    setSaving(true);
    setSaveError("");
    const [profileRes, authResult] = await Promise.all([
      fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: formData.name, phone: formData.phone || null }),
      }),
      supabase.auth.updateUser({ data: { full_name: formData.name } }),
    ]);
    if (!profileRes.ok || authResult.error) {
      setSaveError("Failed to save profile changes. Please try again.");
      setSaving(false);
      return;
    }
    setOriginalData(formData);
    setSaving(false);
    setEditing(false);
  };

  const handleChangePassword = async () => {
    setPwError("");
    if (pwForm.next.length < 8) { setPwError("New password must be at least 8 characters."); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError("New passwords don't match."); return; }
    setPwSaving(true);
    // Verify current password by re-authenticating
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: formData.email, password: pwForm.current });
    if (signInError) { setPwError("Current password is incorrect."); setPwSaving(false); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password: pwForm.next });
    if (updateError) { setPwError("Failed to update password. Please try again."); setPwSaving(false); return; }
    
    // Trigger automated email and surface warning if trigger fails.
    try {
      const emailRes = await fetch("/api/account/email/password-changed", { method: "POST" });
      if (!emailRes.ok) {
        const payload = await emailRes.json().catch(() => null);
        const msg = typeof payload?.error === "string" ? payload.error : "Password changed email could not be sent.";
        setPwEmailWarning(msg);
        console.warn("[profile] password changed email trigger failed:", msg);
      } else {
        setPwEmailWarning("");
      }
    } catch (err) {
      setPwEmailWarning("Password changed, but confirmation email could not be sent.");
      console.warn("[profile] password changed email trigger errored:", err);
    }
    
    setPwSaving(false);
    setPwSuccess(true);
    setPwForm({ current: "", next: "", confirm: "" });
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toLowerCase() !== "i dont want healthy eating habits") return;

    const res = await fetch("/api/auth/delete-account", { method: "POST" });
    if (!res.ok) {
      const { error } = await res.json().catch(() => ({}));
      alert(error ?? "Something went wrong. Please try again.");
      return;
    }

    // Auth record is gone — clear local session and redirect
    await supabase.auth.signOut();
    router.push("/?account=deleted");
  };

  if (!loaded) {
    return <div className="h-48 animate-pulse rounded-xl bg-black/5" />;
  }

  return (
    <>
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
        <h2 className="font-display text-2xl font-medium text-ink mb-6">Profile Information</h2>

        <form onSubmit={handleSave} className="max-w-xl flex flex-col gap-6">
          <div className="flex gap-4 items-center mb-2">
            <div className="w-20 h-20 rounded-full bg-sage/10 flex items-center justify-center text-sage text-2xl font-bold uppercase ring-1 ring-sage/20">
              {formData.name?.[0] ?? formData.email?.[0] ?? "?"}
            </div>
            <button type="button" className="font-body text-[13px] font-bold text-sage hover:underline">Change Photo</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="profile-name" className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Full Name</label>
              <input
                id="profile-name"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={`w-full border rounded-md px-3 py-2.5 font-body text-sm outline-none transition-all ${editing ? "border-sage bg-white text-ink shadow-[0_0_0_1px_rgba(125,155,118,1)]" : "border-black/20 bg-black/5 text-ink/80 pointer-events-none"}`}
                readOnly={!editing}
              />
            </div>
            <div>
              <label htmlFor="profile-phone" className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Phone</label>
              <input
                id="profile-phone"
                type="text"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value.replace(/\D/g, "") })}
                className={`w-full border rounded-md px-3 py-2.5 font-body text-sm outline-none transition-all ${editing ? "border-sage bg-white text-ink shadow-[0_0_0_1px_rgba(125,155,118,1)]" : "border-black/20 bg-black/5 text-ink/80 pointer-events-none"}`}
                readOnly={!editing}
              />
            </div>
            <div className="md:col-span-2">
              <label htmlFor="profile-email" className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Email Address</label>
              <input
                id="profile-email"
                type="email"
                value={formData.email}
                className="w-full border rounded-md px-3 py-2.5 font-body text-sm outline-none border-black/20 bg-black/5 text-ink/80 pointer-events-none"
                readOnly
              />
              <p className="font-body text-[11px] text-stone/70 mt-1">Email cannot be changed here. Contact support if needed.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-black/5 flex flex-col items-start gap-4">
            <div className="flex gap-3">
              {editing ? (
                <>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-sage hover:bg-sage-dark disabled:opacity-50 text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm"
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setFormData(originalData); }}
                    className="bg-black/5 hover:bg-black/10 text-ink font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm"
                >
                  Edit Details
                </button>
              )}
            </div>

            {saveError && (
              <p id="profile-save-error" role="alert" className="font-body text-[12px] text-terracotta">
                {saveError}
              </p>
            )}

            {!editing && (
              <div className="flex flex-col items-start gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => { setPwError(""); setPwSuccess(false); setPwForm({ current: "", next: "", confirm: "" }); setShowPasswordModal(true); }}
                  className="font-body text-[13px] font-medium text-ink/70 hover:text-ink transition-colors flex items-center gap-1.5"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  Change Password
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="mt-6 text-terracotta hover:underline font-body text-[12px] font-medium transition-colors"
                >
                  Deactivate my account
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div
            ref={passwordDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-password-title"
            tabIndex={-1}
            className="bg-white rounded-2xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-300"
          >
            <div className="flex items-center justify-between mb-6">
              <h3 id="change-password-title" className="font-display text-2xl font-medium text-ink">Change Password</h3>
              <button
                onClick={() => { setShowPasswordModal(false); setPwForm({ current: "", next: "", confirm: "" }); setPwError(""); setPwSuccess(false); }}
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center rounded-full bg-black/5 hover:bg-black/10 text-stone hover:text-ink transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>

            {pwSuccess ? (
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="w-12 h-12 rounded-full bg-sage/10 flex items-center justify-center text-sage">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p className="font-body text-[14px] text-ink text-center">Your password has been updated successfully.</p>
                <button
                  onClick={() => { setShowPasswordModal(false); setPwSuccess(false); }}
                  className="bg-sage hover:bg-sage-dark text-white font-body text-[13px] font-bold px-6 py-2.5 rounded-md transition-colors shadow-sm"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div>
                  <label htmlFor="pw-current" className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Current Password</label>
                  <input
                    id="pw-current"
                    type="password"
                    value={pwForm.current}
                    onChange={(e) => setPwForm(f => ({ ...f, current: e.target.value }))}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage focus:shadow-[0_0_0_1px_rgba(125,155,118,1)] transition-all text-ink"
                    placeholder="Enter current password"
                  />
                </div>
                <div>
                  <label htmlFor="pw-new" className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">New Password</label>
                  <input
                    id="pw-new"
                    type="password"
                    value={pwForm.next}
                    onChange={(e) => setPwForm(f => ({ ...f, next: e.target.value }))}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage focus:shadow-[0_0_0_1px_rgba(125,155,118,1)] transition-all text-ink"
                    placeholder="At least 8 characters"
                  />
                </div>
                <div>
                  <label htmlFor="pw-confirm" className="block font-body text-[12px] font-medium text-stone mb-1.5 uppercase tracking-wider">Confirm New Password</label>
                  <input
                    id="pw-confirm"
                    type="password"
                    value={pwForm.confirm}
                    onChange={(e) => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                    className="w-full border border-black/20 rounded-md px-3 py-2.5 font-body text-sm outline-none focus:border-sage focus:shadow-[0_0_0_1px_rgba(125,155,118,1)] transition-all text-ink"
                    placeholder="Repeat new password"
                  />
                </div>

                {pwError && (
                  <p role="alert" className="font-body text-[12px] text-terracotta">{pwError}</p>
                )}
                {pwEmailWarning && (
                  <p role="status" className="font-body text-[12px] text-amber-700">{pwEmailWarning}</p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleChangePassword}
                    disabled={pwSaving || !pwForm.current || !pwForm.next || !pwForm.confirm}
                    className="flex-1 bg-sage hover:bg-sage-dark disabled:opacity-50 text-white font-body text-[13px] font-bold py-3 rounded-md transition-colors shadow-sm"
                  >
                    {pwSaving ? "Updating…" : "Update Password"}
                  </button>
                  <button
                    onClick={() => { setShowPasswordModal(false); setPwForm({ current: "", next: "", confirm: "" }); setPwError(""); }}
                    className="flex-[0.5] bg-white hover:bg-black/5 border border-black/10 text-ink font-body text-[13px] font-bold py-3 rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-ink/70 backdrop-blur-sm animate-in fade-in duration-300">
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-account-title"
            tabIndex={-1}
            className="bg-white rounded-2xl w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-300"
          >
            <div className="w-12 h-12 rounded-full bg-terracotta/10 text-terracotta flex items-center justify-center mb-5">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
            </div>

            {deleteStep === 1 ? (
              <>
                <h3 id="delete-account-title" className="font-display text-2xl font-medium text-ink mb-2">We're sad to see you go...</h3>
                <p className="font-body text-[14px] text-stone mb-4 leading-relaxed">
                  It breaks our heart to see you go! Nutravoe was built to make eating healthy effortless, and we'll miss being part of your routine. Deactivating your account will remove your access to the website and stop future subscription activity.
                </p>
                <div className="bg-[#F9F8F6] p-4 rounded-lg border border-black/5 mb-6">
                  <p className="font-body text-[13px] text-ink/80 leading-relaxed font-medium">
                    Your past orders, payments, and account activity are retained for records. If you deactivated your account by mistake, please contact us within 30 days and we can help restore access.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setDeleteStep(2)} className="flex-1 bg-terracotta hover:bg-[#D55F43] text-white font-body text-[13px] font-bold py-3 rounded-md transition-colors shadow-sm">
                    Proceed to Deletion
                  </button>
                  <button onClick={() => { setShowDeleteModal(false); setDeleteStep(1); }} className="flex-[0.5] bg-white hover:bg-black/5 border border-black/10 text-ink font-body text-[13px] font-bold py-3 rounded-md transition-colors">
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 id="delete-account-title" className="font-display text-2xl font-medium text-ink mb-2">Final Confirmation</h3>
                <p className="font-body text-[14px] text-stone mb-6 leading-relaxed">
                  You are about to deactivate your Nutravoe profile.
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
                    Deactivate My Account
                  </button>
                  <button
                    onClick={() => { setShowDeleteModal(false); setDeleteStep(1); setDeleteConfirmText(""); }}
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
