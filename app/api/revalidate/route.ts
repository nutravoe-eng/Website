import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { getPathsToRevalidateForSanityType } from "@/lib/sanity-revalidate-paths";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(req: NextRequest, secret: string): boolean {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ") && auth.slice(7) === secret) return true;
  if (req.nextUrl.searchParams.get("secret") === secret) return true;
  return false;
}

/**
 * On-demand cache bust for static pages that read Sanity at build time.
 *
 * Sanity → Project → API → Webhooks:
 * - URL: https://<your-domain>/api/revalidate
 * - Method: POST
 * - Dataset: production
 * - Trigger: create / update / delete (or publish-only if you prefer)
 * - Filter: `_type in ["bowl", "subscriptionPlan", "settings"]`
 * - Projection: `{ "_type": _type }`
 * - Header: `Authorization: Bearer <SANITY_REVALIDATE_SECRET>`
 */
export async function POST(req: NextRequest) {
  const secret = process.env.SANITY_REVALIDATE_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "SANITY_REVALIDATE_SECRET is not configured" }, { status: 503 });
  }

  if (!isAuthorized(req, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { _type?: string } = {};
  try {
    const parsed = await req.json();
    if (parsed && typeof parsed === "object") {
      body = parsed as { _type?: string };
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const paths = getPathsToRevalidateForSanityType(
    typeof body._type === "string" ? body._type : undefined,
  );

  for (const path of paths) {
    revalidatePath(path);
  }

  return NextResponse.json({
    revalidated: true,
    paths,
    type: body._type ?? null,
    at: new Date().toISOString(),
  });
}
