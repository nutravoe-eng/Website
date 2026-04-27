import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { verifyAdmin } from '@/lib/admin-auth';
import { adminSupabase } from '@/lib/supabase/admin';
import { sendBrevoEmail } from '@/lib/brevo';
import { requestOriginReferrer } from '@/lib/ola-maps';
import { syncAddressDeliveryMetadata } from '@/lib/address-delivery-sync';

function generatePassword(): string {
  // 64-char set (power of 2) with & 63 bitmask — no modular bias
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz234567890!@#$%^&*';
  const result: string[] = [];
  while (result.length < 12) {
    const bytes = Array.from(randomBytes(16));
    for (const b of bytes) {
      if (result.length >= 12) break;
      const idx = b & 63;          // unbiased for 64-char set
      result.push(chars[idx]);
    }
  }
  return result.join('');
}

export async function POST(req: NextRequest) {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const fullName = typeof body?.fullName === 'string' ? body.fullName.trim() : '';
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const phone = typeof body?.phone === 'string' ? body.phone.replace(/\D/g, '').slice(-10) : '';
  const line1 = typeof body?.line1 === 'string' ? body.line1.trim() : '';
  const line2 = typeof body?.line2 === 'string' ? body.line2.trim() || null : null;
  const city = typeof body?.city === 'string' ? body.city.trim() : '';
  const state = typeof body?.state === 'string' ? body.state.trim() : '';
  const pincode = typeof body?.pincode === 'string' ? body.pincode.trim() : '';
  const lat = typeof body?.lat === 'number' ? body.lat : null;
  const lng = typeof body?.lng === 'number' ? body.lng : null;

  if (!fullName || !email || phone.length !== 10 || !line1 || !city || !state || !/^\d{6}$/.test(pincode)) {
    return NextResponse.json({ error: 'All required fields must be provided (pincode must be 6 digits)' }, { status: 400 });
  }

  if (lat === null || lng === null) {
    return NextResponse.json({ error: 'Pin drop location (lat/lng) is required' }, { status: 400 });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  // Prevent duplicate customer identities (same email or phone) from being created.
  const [{ data: existingByEmail, error: existingByEmailError }, { data: existingByPhone, error: existingByPhoneError }] = await Promise.all([
    adminSupabase
      .from('users')
      .select('id, full_name, email, phone')
      .eq('email', email)
      .limit(2),
    adminSupabase
      .from('users')
      .select('id, full_name, email, phone')
      .eq('phone', phone)
      .limit(2),
  ]);

  if (existingByEmailError || existingByPhoneError) {
    return NextResponse.json({ error: 'Could not validate existing customer accounts' }, { status: 500 });
  }

  const emailMatches = existingByEmail ?? [];
  const phoneMatches = existingByPhone ?? [];

  if (emailMatches.length > 1 || phoneMatches.length > 1) {
    return NextResponse.json(
      { error: 'Duplicate customer records already exist for this email/phone. Resolve duplicates before creating a new account.' },
      { status: 409 },
    );
  }

  const existingUser = emailMatches[0] ?? phoneMatches[0];
  if (existingUser) {
    return NextResponse.json(
      {
        error: 'Customer already exists. Use lookup and continue with the existing account.',
        existingUser: {
          id: existingUser.id,
          full_name: existingUser.full_name,
          email: existingUser.email,
          phone: existingUser.phone,
        },
      },
      { status: 409 },
    );
  }

  const tempPassword = generatePassword();

  // Create Supabase auth user — the DB trigger handle_new_user() auto-creates public.users row
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, admin_created: true },
  });

  if (authError || !authData.user) {
    const msg = authError?.message ?? 'Failed to create user';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const userId = authData.user.id;

  // The DB trigger only writes id/email/full_name — phone must be set explicitly
  await adminSupabase.from('users').update({ phone }).eq('id', userId);

  // Insert delivery address
  const { data: addrRow, error: addrError } = await adminSupabase
    .from('addresses')
    .insert({
      user_id: userId,
      line1,
      line2,
      city,
      state,
      pincode,
      lat,
      lng,
      is_default: true,
    })
    .select('id')
    .single();

  if (addrError || !addrRow?.id) {
    // Best-effort cleanup of auth user if address insert fails
    await adminSupabase.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: 'Failed to save address' }, { status: 500 });
  }

  try {
    await syncAddressDeliveryMetadata(adminSupabase, addrRow.id, lat, lng, {
      httpReferrer: requestOriginReferrer(req),
    });
  } catch (e) {
    console.error('[admin/customers] address delivery sync failed', e);
  }

  // Send welcome email with temp password
  const templateId = Number(process.env.BREVO_WELCOME_ACCOUNT_CREATED_TEMPLATE_ID);
  if (templateId) {
    await sendBrevoEmail({
      toEmail: email,
      toName: fullName,
      templateId,
      params: { user_name: fullName, temp_password: tempPassword },
    });
  }

  return NextResponse.json({ userId });
}
