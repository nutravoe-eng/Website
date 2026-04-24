import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { getSubscriptionPlans } from '@/lib/sanity';

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const plans = await getSubscriptionPlans();
  return NextResponse.json({ plans });
}
