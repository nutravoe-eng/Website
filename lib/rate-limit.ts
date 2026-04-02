import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { adminSupabase } from '@/lib/supabase/admin';

function getClientIp(request: Request | NextRequest) {
  // x-real-ip is set by Vercel/trusted proxies and cannot be spoofed by the client
  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp.trim();

  // Fall back to the last IP in x-forwarded-for (added by the nearest trusted proxy)
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ips = forwardedFor.split(',');
    return ips[ips.length - 1]?.trim() ?? 'unknown';
  }

  return 'unknown';
}

export async function enforceRateLimit(
  request: Request | NextRequest,
  scope: string,
  limit: number,
  windowSeconds: number
) {
  const key = `${scope}:${getClientIp(request)}`;
  const { data, error } = await adminSupabase.rpc('check_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error('[rate-limit] DB error:', error.message);
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Service temporarily unavailable. Please try again.' },
        { status: 503 }
      ),
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const headers = {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(row?.remaining ?? 0),
    'Retry-After': String(row?.retry_after_seconds ?? 0),
  };

  if (!row?.allowed) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers }
      ),
    };
  }

  return { ok: true as const, headers };
}
