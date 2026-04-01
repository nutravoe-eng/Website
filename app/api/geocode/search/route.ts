import { NextRequest, NextResponse } from "next/server";

/**
 * Server-side Nominatim free-text search proxy.
 *
 * GET /api/geocode/search?q=some+address+bengaluru
 * → [{ lat, lng, display_name }, ...]
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length < 3) {
    return NextResponse.json({ error: "q must be at least 3 characters" }, { status: 400 });
  }

  // Bias results toward Bengaluru / India
  const query = q.toLowerCase().includes("bengaluru") ? q : `${q}, Bengaluru, India`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&countrycodes=in`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Nutravoe/1.0 (nutravoe@gmail.com)",
        "Accept-Language": "en",
      },
      // Short cache — search results are time-sensitive
      next: { revalidate: 60 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Nominatim request failed" }, { status: 502 });
    }

    const data: { lat: string; lon: string; display_name: string }[] = await res.json();

    return NextResponse.json(
      data.map((item) => ({
        lat: parseFloat(item.lat),
        lng: parseFloat(item.lon),
        display_name: item.display_name,
      }))
    );
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
