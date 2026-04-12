import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { geocodeSearchBangalore, requestOriginReferrer } from "@/lib/ola-maps";

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, "geocode-search", 10, 60);
  if (!limited.ok) return limited.response;

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 3 || q.length > 160) {
    return NextResponse.json({ error: "q must be between 3 and 160 characters" }, { status: 400, headers: limited.headers });
  }

  try {
    const hits = await geocodeSearchBangalore(q, requestOriginReferrer(req));
    return NextResponse.json(hits, { headers: limited.headers });
  } catch {
    return NextResponse.json({ error: "Search failed" }, { status: 500, headers: limited.headers });
  }
}
