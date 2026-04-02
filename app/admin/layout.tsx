import Link from 'next/link';
import { redirect } from 'next/navigation';
import AdminLogout from './AdminLogout';
import { verifyAdmin } from '@/lib/admin-auth';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await verifyAdmin();
  if (!admin) redirect('/admin/login');

  return (
    <div className="min-h-screen bg-[#F9F8F6]">
      <header className="sticky top-0 z-50 border-b border-black/10 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <span className="font-display text-lg text-ink">
              Nutravoe <span className="font-body text-xs font-normal uppercase tracking-widest text-stone">admin</span>
            </span>
            <nav className="hidden items-center gap-1 sm:flex">
              <NavLink href="/admin">Today</NavLink>
              <NavLink href="/admin/orders">Orders</NavLink>
              <NavLink href="/admin/subscriptions">Subscriptions</NavLink>
            </nav>
          </div>
          <AdminLogout />
        </div>
        <nav className="flex overflow-x-auto border-t border-black/5 sm:hidden">
          <NavLink href="/admin" mobile>Today</NavLink>
          <NavLink href="/admin/orders" mobile>Orders</NavLink>
          <NavLink href="/admin/subscriptions" mobile>Subscriptions</NavLink>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
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
        className="whitespace-nowrap px-4 py-2.5 font-body text-[12px] font-bold uppercase tracking-wider text-stone transition-colors hover:text-ink"
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 font-body text-[12px] font-bold uppercase tracking-wider text-stone transition-colors hover:bg-black/5 hover:text-ink"
    >
      {children}
    </Link>
  );
}
