import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { geocodeSearchIndia } from "@/lib/geocode";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "geocode-search", 20, 60);
  if (!limited.ok) return limited.response;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3) {
    return NextResponse.json([], { headers: limited.headers });
  }
  if (q.length > 160) {
    return NextResponse.json(
      { error: "q must be at most 160 characters" },
      { status: 400, headers: limited.headers },
    );
  }

  try {
    const hits = await geocodeSearchIndia(q);
    return NextResponse.json(hits, { headers: limited.headers });
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500, headers: limited.headers });
  }
}
