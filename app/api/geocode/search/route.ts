import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'geocode-search', 10, 60);
  if (!limited.ok) return limited.response;

  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 3 || q.length > 160) {
    return NextResponse.json({ error: 'q must be between 3 and 160 characters' }, { status: 400, headers: limited.headers });
  }

  const query = q.toLowerCase().includes('bengaluru') ? q : `${q}, Bengaluru, India`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Nutravoe/1.0 (support@nutravoe.in)',
        'Accept-Language': 'en',
      },
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Nominatim request failed' }, { status: 502, headers: limited.headers });
    }

    const data: { lat: string; lon: string; display_name: string }[] = await res.json();
    return NextResponse.json(
      data.map((item) => ({
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        display_name: item.display_name,
      })),
      { headers: limited.headers }
    );
  } catch {
    return NextResponse.json({ error: 'Search failed' }, { status: 500, headers: limited.headers });
  }
}
