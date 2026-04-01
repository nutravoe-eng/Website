import Link from 'next/link';
import AdminLogout from './AdminLogout';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      {/* Top nav */}
      <header className="bg-white border-b border-black/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-6">
          <div className="flex items-center gap-6">
            <span className="font-display text-lg text-ink">
              Nutravoe <span className="text-stone font-body text-xs font-normal tracking-widest uppercase">admin</span>
            </span>
            <nav className="hidden sm:flex items-center gap-1">
              <NavLink href="/admin">Today</NavLink>
              <NavLink href="/admin/orders">Orders</NavLink>
              <NavLink href="/admin/subscriptions">Subscriptions</NavLink>
            </nav>
          </div>
          <AdminLogout />
        </div>
        {/* Mobile nav */}
        <nav className="sm:hidden flex border-t border-black/5 overflow-x-auto">
          <NavLink href="/admin" mobile>Today</NavLink>
          <NavLink href="/admin/orders" mobile>Orders</NavLink>
          <NavLink href="/admin/subscriptions" mobile>Subscriptions</NavLink>
        </nav>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  );
}

function NavLink({ href, children, mobile }: { href: string; children: React.ReactNode; mobile?: boolean }) {
  if (mobile) {
    return (
      <Link
        href={href}
        className="px-4 py-2.5 font-body text-[12px] font-bold uppercase tracking-wider text-stone hover:text-ink whitespace-nowrap transition-colors"
      >
        {children}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className="px-3 py-1.5 rounded-md font-body text-[12px] font-bold uppercase tracking-wider text-stone hover:text-ink hover:bg-black/5 transition-colors"
    >
      {children}
    </Link>
  );
}
