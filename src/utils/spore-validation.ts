export const SEED_SPORE_DIDS = [
  'did:plc:y3lae7hmqiwyq7w2v3bcb2c2', // v's test DID
];

export function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  let state = Math.abs(hash);

  return function () {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

export function shouldReceiveInitialSpore(did: string): boolean {
  if (!did) return false;
  if (SEED_SPORE_DIDS.includes(did)) return true;
  const rng = seededRandom(did);
  return rng() < 0.1;
}

/**
 * Validate if a spore is authentic (should exist for the given origin DID)
 */
export function isValidSpore(originGardenDid: string): boolean {
  return shouldReceiveInitialSpore(originGardenDid);
}
