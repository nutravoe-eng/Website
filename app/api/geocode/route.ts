import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'geocode-pincode', 10, 60);
  if (!limited.ok) return limited.response;

  const pincode = req.nextUrl.searchParams.get('pincode')?.trim();
  if (!pincode || !/^\d{6}$/.test(pincode)) {
    return NextResponse.json({ error: 'Valid pincode query param is required' }, { status: 400, headers: limited.headers });
  }

  const query = `${pincode}, India`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=in`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Nutravoe/1.0 (support@nutravoe.in)',
        'Accept-Language': 'en',
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Nominatim request failed' }, { status: 502, headers: limited.headers });
    }

    const data: { lat: string; lon: string; display_name: string }[] = await res.json();
    if (!data.length) {
      return NextResponse.json({ error: 'Location not found' }, { status: 404, headers: limited.headers });
    }

    const { lat, lon, display_name } = data[0];
    return NextResponse.json({
      lat: parseFloat(lat),
      lng: parseFloat(lon),
      display_name,
    }, { headers: limited.headers });
  } catch {
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500, headers: limited.headers });
  }
}
