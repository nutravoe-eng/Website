import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = [
  '/profile',
  '/subscriptions',
  '/orders',
  '/wallet',
  '/addresses',
  '/payment-methods',
  '/account',
  '/cancellations',
  '/help',
  '/invoice',
];

const ADMIN_PREFIX = '/admin';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — IMPORTANT: do not add any logic between createServerClient
  // and getUser() that could short-circuit the token refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/signin';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Redirect signed-in users away from /signin
  if (user && pathname === '/signin') {
    const rawNext = request.nextUrl.searchParams.get('next') ?? '/';
    const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';
    const url = request.nextUrl.clone();
    url.pathname = next;
    url.search = '';
    return NextResponse.redirect(url);
  }

  // ── Admin routes ──────────────────────────────────────────────────────────
  const isAdminRoute = pathname.startsWith(ADMIN_PREFIX) && pathname !== '/admin/login';
  const isAdminLogin = pathname === '/admin/login';

  if (isAdminRoute || (user && isAdminLogin)) {
    // Not logged in → send to admin login
    if (!user && isAdminRoute) {
      const url = request.nextUrl.clone();
      url.pathname = '/admin/login';
      return NextResponse.redirect(url);
    }

    if (user) {
      // Use service-role client so RLS does not block the is_admin check
      const serviceSupabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { data: profile } = await serviceSupabase
        .from('users')
        .select('is_admin')
        .eq('id', user.id)
        .single();

      if (isAdminRoute && !profile?.is_admin) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
      }

      if (isAdminLogin && profile?.is_admin) {
        const url = request.nextUrl.clone();
        url.pathname = '/admin';
        url.search = '';
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
