/**
 * Test script to check if a DID will receive a special spore
 * Usage: node scripts/special-spore-probability.js did:plc:xxxxx
 */

function seededRandom(seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash = hash & hash;
    }
    let state = Math.abs(hash);

    return function () {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return state / 0x7fffffff;
    };
}

const did = process.argv[2];

if (!did) {
    console.error('Usage: node scripts/special-spore-probability.js <DID>');
    console.error('Example: node scripts/special-spore-probability.js did:plc:abc123');
    process.exit(1);
}

const rng = seededRandom(did);
const value = rng();
const willGetSpore = value < 0.1;

console.log(`\nDID: ${did}`);
console.log(`Random value: ${value.toFixed(6)}`);
console.log(`Threshold: 0.100000 (10%)`);
console.log(`\n${willGetSpore ? '✅ This DID WILL receive a special spore!' : '❌ This DID will NOT receive a special spore.'}`);
console.log(`\nNote: This is deterministic - the same DID will always get the same result.\n`);
