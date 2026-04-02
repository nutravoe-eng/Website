import { NextResponse } from 'next/server';
import { z } from 'zod';
import { adminSupabase } from '@/lib/supabase/admin';
import { enforceRateLimit } from '@/lib/rate-limit';

const areaInterestSchema = z.object({
  name: z.string().trim().max(120).optional().or(z.literal('')),
  email: z.string().trim().email().max(160).optional().or(z.literal('')),
  phone: z.string().trim().regex(/^\d{10}$/).optional().or(z.literal('')),
  pincode: z.string().trim().regex(/^\d{6}$/),
}).refine((value) => Boolean(value.email || value.phone), {
  message: 'Email or phone is required',
  path: ['email'],
});

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, 'area-interest', 5, 60);
  if (!limited.ok) return limited.response;

  try {
    const parsed = areaInterestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400, headers: limited.headers });
    }

    const { name, email, phone, pincode } = parsed.data;
    const { error } = await adminSupabase
      .from('area_interest')
      .insert({
        name: name || null,
        email: email || null,
        phone: phone || null,
        pincode,
      });

    if (error) {
      return NextResponse.json({ error: 'Failed to save' }, { status: 500, headers: limited.headers });
    }

    return NextResponse.json({ ok: true }, { headers: limited.headers });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: limited.headers });
  }
}
