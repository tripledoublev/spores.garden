export type UrlIdentifier =
  | { type: 'did'; value: string }
  | { type: 'handle'; value: string };

export function buildGardenPath(identifier: string): string {
  const normalized = (identifier || '').trim();
  if (normalized.startsWith('did:')) {
    return `/${encodeURIComponent(normalized)}`;
  }
  return `/@${encodeURIComponent(normalized)}`;
}

/**
 * Parse identifier from URL (supports both path-based and query params)
 * Supports: /@handle, /did:..., /handle (legacy shorthand), ?handle=..., ?did=...
 */
export function parseIdentifierFromUrl(loc: Location = location): UrlIdentifier | null {
  const pathMatch = loc.pathname.match(/^\/@(.+)$/);
  if (pathMatch) {
    const identifier = decodeURIComponent(pathMatch[1]);
    if (identifier.startsWith('did:')) {
      return { type: 'did', value: identifier };
    } else {
      return { type: 'handle', value: identifier };
    }
  }

  // Legacy/shorthand: support `/handle` style URLs (e.g. `/alice.example.com`).
  // This prevents unknown single-segment paths from silently falling back to the
  // logged-in user's garden.
  const bareMatch = loc.pathname.match(/^\/([^/]+)$/);
  if (bareMatch) {
    const segment = decodeURIComponent(bareMatch[1]);

    // Ignore obvious static files and known metadata endpoints.
    const lower = segment.toLowerCase();
    const isStaticFile = /\.(js|css|map|png|jpg|jpeg|gif|webp|svg|ico|json|txt|xml|webmanifest)$/.test(lower);
    if (lower !== 'client-metadata.json' && !isStaticFile) {
      if (segment.startsWith('did:')) {
        return { type: 'did', value: segment };
      }
      // Only treat domain-like segments as handles to avoid catching random paths.
      if (segment.includes('.')) {
        return { type: 'handle', value: segment };
      }
    }
  }

  const params = new URLSearchParams(loc.search);
  const didParam = params.get('did');
  const handleParam = params.get('handle');

  if (didParam) {
    return { type: 'did', value: didParam };
  } else if (handleParam) {
    return { type: 'handle', value: handleParam };
  }

  return null;
}

export function hasGardenIdentifierInUrl(loc: Location = location): boolean {
  return parseIdentifierFromUrl(loc) !== null;
}
