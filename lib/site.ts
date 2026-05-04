const DEFAULT_SITE_URL = "https://nutravoe.in";

function normalizeSiteUrl(urlLike: string): string | null {
  try {
    const url = new URL(urlLike.includes("://") ? urlLike : `https://${urlLike}`);
    return url.origin;
  } catch {
    return null;
  }
}

export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) {
    const normalized = normalizeSiteUrl(explicit);
    if (normalized) return normalized;
  }

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const normalized = normalizeSiteUrl(vercel);
    if (normalized) return normalized;
  }

  return DEFAULT_SITE_URL;
}
