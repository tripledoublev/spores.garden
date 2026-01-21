# Special Spore - Capture the Flag Mechanism

## Overview

Special spores are rare, gamified items in spores.garden that implement a capture-the-flag mechanic. Only 1 in 10 new gardens receives a special spore upon first configuration, making them rare and valuable.

## How It Works

### Creation

When a user completes initial onboarding:
1. The system checks if this is the first time creating a site configuration
2. Using seeded randomness based on the garden owner's DID, there's a 1/10 chance (10% probability)
3. If selected, a special spore is created with:
   - `subject`: The origin garden DID (for backlink indexing)
   - `ownerDid`: The garden owner's DID (initial holder)
   - `originGardenDid`: Same as ownerDid (the garden where spore originated)
   - `lastCapturedAt`: Current timestamp
   - `history`: Array containing the first holder entry

### Capture-the-Flag Mechanics

Special spores can be "stolen" (captured) by other users, but with restrictions:

**Stealing Rules:**
- A user can only steal a spore if they have NOT:
  - Planted a flower in the garden
  - Taken a seed from the garden
- Stealing a spore automatically plants a flower in the garden as a trade

**Capture Process:**
1. When stolen, a NEW record is created (old records are never deleted)
2. The new record preserves the `originGardenDid` (never changes)
3. The new record has:
   - `subject`: Same originGardenDid (for backlink indexing)
   - `ownerDid`: New holder's DID
   - `lastCapturedAt`: New timestamp
   - `history`: All previous history + new entry

### Backlink-Based Discovery

All spore records reference the origin garden DID via the `subject` field. This enables:

1. **Constellation Indexing**: The Constellation service indexes all records that reference a DID
2. **Backlink Queries**: We can query `getBacklinks(originGardenDid, 'garden.spores.item.specialSpore')` to find ALL spore records across all DIDs
3. **Current Holder Detection**: Sort all records by `lastCapturedAt` timestamp - most recent = current holder
4. **Full Lineage Tracking**: All historical records remain, creating a complete evolution history

### Display

When viewing a garden with a special spore:

1. **Current Holder**: The most recent record (by `lastCapturedAt`) is displayed as the current owner
2. **Visualization**: The spore's visual appearance is generated from the current holder's DID
3. **Lineage**: All previous holders are displayed chronologically, showing the full evolution

## Technical Implementation

### Lexicon Schema

```json
{
  "required": ["subject", "ownerDid", "originGardenDid", "lastCapturedAt", "history"],
  "properties": {
    "subject": {
      "type": "string",
      "format": "did",
      "description": "DID of the origin garden (same as originGardenDid). Used for backlink indexing."
    },
    "ownerDid": {
      "type": "string",
      "format": "did",
      "description": "DID of the current holder of the spore"
    },
    "originGardenDid": {
      "type": "string",
      "format": "did",
      "description": "DID of the garden where this spore originated. All spore records reference this DID via backlinks."
    },
    "lastCapturedAt": {
      "type": "string",
      "format": "datetime",
      "description": "Timestamp when this record was created (when spore was captured by current holder)"
    },
    "history": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["did", "timestamp"],
        "properties": {
          "did": { "type": "string", "format": "did" },
          "timestamp": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

### Query Pattern

```typescript
// Find all spore records for an origin garden
const backlinks = await getBacklinks(
  originGardenDid,
  'garden.spores.item.specialSpore',
  { limit: 100 }
);

// Fetch full records from backlinks
const records = await Promise.all(
  backlinks.records.map(backlink =>
    getRecord(backlink.did, backlink.collection, backlink.rkey, { useSlingshot: true })
  )
);

// Sort by timestamp to find current holder
records.sort((a, b) => 
  new Date(b.value.lastCapturedAt) - new Date(a.value.lastCapturedAt)
);

const currentHolder = records[0]; // Most recent
```

### Record Creation Pattern

```typescript
// When stealing - create new record, never delete old
await createRecord('garden.spores.item.specialSpore', {
  $type: 'garden.spores.item.specialSpore',
  subject: originGardenDid,           // Preserve origin for backlinks
  ownerDid: newOwnerDid,               // New holder
  originGardenDid: originGardenDid,    // Preserve origin (never change)
  lastCapturedAt: new Date().toISOString(),
  history: [...previousHistory, {      // Append to history
    did: newOwnerDid,
    timestamp: new Date().toISOString()
  }]
});
```

## Gamification Aspects

- **Rarity**: Only 1 in 10 gardens gets a special spore (10% probability)
- **Deterministic**: Using seeded randomness based on DID ensures same garden always gets/doesn't get a spore
- **Capture Mechanics**: Players compete to hold rare spores
- **Lineage Tracking**: Full history of all captures creates a sense of evolution and ownership trail
- **Trade Requirement**: Must plant a flower to steal (social interaction)

## Files

- Lexicon: `lexicons/garden.spores.item.specialSpore.json`
- Display Layout: `src/layouts/special-spore-display.ts`
- Generation Logic: `src/config.ts` (lines 381-391)
- Documentation: `docs/special-spore.md`
