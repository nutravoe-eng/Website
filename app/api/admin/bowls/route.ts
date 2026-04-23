import { NextResponse } from 'next/server';
import { verifyAdmin } from '@/lib/admin-auth';
import { getAllBowls } from '@/lib/sanity';

export async function GET() {
  const admin = await verifyAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const bowls = await getAllBowls();
  return NextResponse.json({
    bowls: bowls.map(b => ({ slug: b.slug, name: b.name })),
  });
}
