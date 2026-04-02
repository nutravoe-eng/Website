'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(res.status === 429 ? 'Too many attempts. Please wait and try again.' : (data.error ?? 'Invalid email or password.'));
      setLoading(false);
      return;
    }

    // Middleware will check is_admin and redirect away if not admin.
    router.push('/admin');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="font-body text-[11px] font-bold uppercase tracking-[0.2em] text-stone mb-1">
            Nutravoe
          </p>
          <h1 className="font-display text-3xl text-ink">Admin Access</h1>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-xl border border-black/10 p-8 shadow-sm space-y-5">
          <div>
            <label htmlFor="admin-email" className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40 focus:border-sage/40"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block font-body text-[11px] font-bold uppercase tracking-wider text-stone mb-2">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full border border-black/10 rounded-lg px-4 py-3 font-body text-sm text-ink bg-[#F9F8F6] focus:outline-none focus:ring-2 focus:ring-sage/40 focus:border-sage/40"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="font-body text-[13px] text-terracotta">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ink hover:bg-ink/80 disabled:bg-ink/30 text-white font-body text-sm font-bold tracking-wide py-3.5 rounded-lg transition-colors"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}
