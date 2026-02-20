import { describe, it, expect } from 'vitest';
import { applyBskyFacets } from './facets';
import type { Facet } from './facets';

describe('applyBskyFacets', () => {
  it('returns escaped plaintext when no facets', () => {
    expect(applyBskyFacets('hello world', [])).toBe('hello world');
  });

  it('escapes HTML in plaintext with no facets', () => {
    expect(applyBskyFacets('<script>bad</script>', [])).toBe('&lt;script&gt;bad&lt;/script&gt;');
  });

  it('renders link facet as anchor tag', () => {
    // 'check ' = 6 bytes, 'https://example.com' = 19 bytes → byteEnd = 25
    const facets: Facet[] = [{
      $type: 'app.bsky.richtext.facet',
      index: { byteStart: 6, byteEnd: 25 },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com' }]
    }];
    const result = applyBskyFacets('check https://example.com out', facets);
    expect(result).toContain('<a href="https://example.com"');
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('https://example.com</a>');
  });

  it('renders http:// link facets', () => {
    const facets: Facet[] = [{
      $type: 'app.bsky.richtext.facet',
      index: { byteStart: 0, byteEnd: 18 },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'http://example.com' }]
    }];
    const result = applyBskyFacets('http://example.com', facets);
    expect(result).toContain('<a href="http://example.com"');
  });

  it('blocks unsafe protocol in link facet', () => {
    const facets: Facet[] = [{
      $type: 'app.bsky.richtext.facet',
      index: { byteStart: 0, byteEnd: 9 },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'javascript:alert(1)' }]
    }];
    const result = applyBskyFacets('click me', facets);
    expect(result).not.toContain('<a');
    expect(result).not.toContain('javascript:');
  });

  it('renders mention facet linking to bsky.app profile', () => {
    // '@alice.bsky.social' = 18 bytes → byteEnd = 18
    const facets: Facet[] = [{
      $type: 'app.bsky.richtext.facet',
      index: { byteStart: 0, byteEnd: 18 },
      features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:abc123' }]
    }];
    const result = applyBskyFacets('@alice.bsky.social', facets);
    expect(result).toContain('href="https://bsky.app/profile/did:plc:abc123"');
    expect(result).toContain('@alice.bsky.social</a>');
  });

  it('renders tag facet linking to bsky.app search', () => {
    const facets: Facet[] = [{
      $type: 'app.bsky.richtext.facet',
      index: { byteStart: 0, byteEnd: 5 },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'cats' }]
    }];
    const result = applyBskyFacets('#cats', facets);
    expect(result).toContain('href="https://bsky.app/search?q=%23cats"');
    expect(result).toContain('#cats</a>');
  });

  it('encodes special characters in tag search URL', () => {
    const facets: Facet[] = [{
      $type: 'app.bsky.richtext.facet',
      index: { byteStart: 0, byteEnd: 12 },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'hello world' }]
    }];
    const result = applyBskyFacets('#hello world', facets);
    expect(result).toContain('%23hello%20world');
  });

  it('preserves text outside facet ranges', () => {
    const facets: Facet[] = [{
      $type: 'app.bsky.richtext.facet',
      index: { byteStart: 7, byteEnd: 11 },
      features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'cats' }]
    }];
    const result = applyBskyFacets('I love #cats today', facets);
    expect(result).toContain('I love ');
    expect(result).toContain(' today');
  });

  it('handles multiple facets sorted by position', () => {
    const facets: Facet[] = [
      {
        $type: 'app.bsky.richtext.facet',
        index: { byteStart: 10, byteEnd: 15 },
        features: [{ $type: 'app.bsky.richtext.facet#tag', tag: 'test' }]
      },
      {
        $type: 'app.bsky.richtext.facet',
        index: { byteStart: 0, byteEnd: 6 },
        features: [{ $type: 'app.bsky.richtext.facet#mention', did: 'did:plc:xyz' }]
      }
    ];
    const result = applyBskyFacets('@alice #test!', facets);
    expect(result).toContain('bsky.app/profile/did:plc:xyz');
    expect(result).toContain('bsky.app/search?q=%23test');
  });

  it('escapes HTML special chars in link URI', () => {
    const facets: Facet[] = [{
      $type: 'app.bsky.richtext.facet',
      index: { byteStart: 0, byteEnd: 4 },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: 'https://example.com/?a=1&b=2' }]
    }];
    const result = applyBskyFacets('link', facets);
    expect(result).toContain('&amp;');
    expect(result).not.toContain('"&"');
  });
});
