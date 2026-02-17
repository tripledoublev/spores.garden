import { describe, it, expect } from 'vitest';
import { SEED_SPORE_DIDS, seededRandom, shouldReceiveInitialSpore, isValidSpore } from './spore-validation';

describe('spore validation', () => {
  it('always grants spores for explicit test DIDs', () => {
    for (const did of SEED_SPORE_DIDS) {
      expect(shouldReceiveInitialSpore(did)).toBe(true);
      expect(isValidSpore(did)).toBe(true);
    }
  });

  it('is deterministic for the same DID', () => {
    const did = 'did:plc:deterministic123';
    expect(shouldReceiveInitialSpore(did)).toBe(shouldReceiveInitialSpore(did));
    expect(isValidSpore(did)).toBe(isValidSpore(did));
  });

  it('returns false for empty DID', () => {
    expect(shouldReceiveInitialSpore('')).toBe(false);
    expect(isValidSpore('')).toBe(false);
  });

  it('seededRandom is deterministic for same seed', () => {
    const a = seededRandom('did:plc:abc');
    const b = seededRandom('did:plc:abc');
    expect(a()).toBe(b());
    expect(a()).toBe(b());
  });
});
