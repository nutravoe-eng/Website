import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side Nominatim proxy.
 * Keeps the User-Agent header server-side and adds edge caching so the
 * same pincode is only ever looked up once per 24 hours at the CDN level.
 *
 * GET /api/geocode?pincode=560001
 * → { lat: number, lng: number, display_name: string }
 */
export async function GET(req: NextRequest) {
  const pincode = req.nextUrl.searchParams.get('pincode')?.trim();

  if (!pincode) {
    return NextResponse.json({ error: 'pincode query param is required' }, { status: 400 });
  }

  const query = `${pincode}, Bengaluru, Karnataka, India`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`;

  try {
    const res = await fetch(url, {
      headers: {
        // Nominatim ToS requires a descriptive User-Agent
        'User-Agent': 'Nutravoe/1.0 (nutravoe@gmail.com)',
        'Accept-Language': 'en',
      },
      // Cache at the Next.js / CDN layer for 24 hours — pincodes don't move
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Nominatim request failed' }, { status: 502 });
    }

    const data: { lat: string; lon: string; display_name: string }[] = await res.json();

    if (!data.length) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404 });
    }

    const { lat, lon, display_name } = data[0];
    return NextResponse.json({
      lat: parseFloat(lat),
      lng: parseFloat(lon),
      display_name,
    });
  } catch {
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500 });
  }
}
