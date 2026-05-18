/** Routes to refresh when Sanity content of a given document type changes. */
const PATHS_BY_SANITY_TYPE: Record<string, readonly string[]> = {
  bowl: ["/", "/menu", "/subscribe"],
  subscriptionPlan: ["/subscribe"],
  settings: ["/", "/menu", "/subscribe"],
};

/** Default paths when webhook payload has no `_type` (revalidate all CMS-driven pages). */
const DEFAULT_PATHS = ["/", "/menu", "/subscribe"] as const;

export function getPathsToRevalidateForSanityType(type: string | undefined): string[] {
  const paths = type && PATHS_BY_SANITY_TYPE[type] ? PATHS_BY_SANITY_TYPE[type] : DEFAULT_PATHS;
  return Array.from(new Set(paths));
}
