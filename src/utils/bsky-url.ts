/**
 * Parse a bsky.app post URL into handle and rkey components.
 *
 * Accepts URLs like:
 *   https://bsky.app/profile/alice.bsky.social/post/3lbquo2lxmc2s
 *   https://bsky.app/profile/did:plc:abc123/post/3lbquo2lxmc2s
 */
export function parseBskyPostUrl(url: string): { handle: string; rkey: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.hostname !== 'bsky.app') return null;

  // pathname: /profile/{handle}/post/{rkey}
  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length !== 4) return null;
  if (segments[0] !== 'profile' || segments[2] !== 'post') return null;

  const handle = segments[1];
  const rkey = segments[3];
  if (!handle || !rkey) return null;

  return { handle, rkey };
}
