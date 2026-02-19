import { describe, expect, it } from 'vitest';
import { parseBskyPostUrl } from './bsky-url';

describe('parseBskyPostUrl', () => {
  it('parses a valid bsky.app post URL', () => {
    expect(parseBskyPostUrl('https://bsky.app/profile/alice.bsky.social/post/3lbquo2lxmc2s'))
      .toEqual({ handle: 'alice.bsky.social', rkey: '3lbquo2lxmc2s' });
  });

  it('parses a URL with a DID instead of handle', () => {
    expect(parseBskyPostUrl('https://bsky.app/profile/did:plc:abc123/post/3lbquo2lxmc2s'))
      .toEqual({ handle: 'did:plc:abc123', rkey: '3lbquo2lxmc2s' });
  });

  it('returns null for wrong hostname', () => {
    expect(parseBskyPostUrl('https://example.com/profile/alice.bsky.social/post/3lbquo2lxmc2s'))
      .toBeNull();
  });

  it('returns null for missing /post/ segment', () => {
    expect(parseBskyPostUrl('https://bsky.app/profile/alice.bsky.social'))
      .toBeNull();
  });

  it('returns null for extra path segments', () => {
    expect(parseBskyPostUrl('https://bsky.app/profile/alice.bsky.social/post/3lbquo2lxmc2s/extra'))
      .toBeNull();
  });

  it('returns null for a non-URL string', () => {
    expect(parseBskyPostUrl('not a url')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseBskyPostUrl('')).toBeNull();
  });

  it('returns null for a feed URL (wrong path structure)', () => {
    expect(parseBskyPostUrl('https://bsky.app/profile/alice.bsky.social/feed/my-feed'))
      .toBeNull();
  });
});
