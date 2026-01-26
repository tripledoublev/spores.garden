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
   - `createdAt`: Current timestamp

### Capture-the-Flag Mechanics

Special spores use a **free-for-all (FFA) capture-the-flag** mechanic. Any logged-in user can steal a spore from its current holder.

**Stealing Rules:**
- Any logged-in user can steal (no restrictions)
- You cannot steal your own spore (you already own it)

**Capture Process:**
1. When stolen, a NEW record is created in the stealer's repo (old records are never deleted)
2. The new record has:
   - `subject`: Same origin garden DID (for backlink indexing)
   - `createdAt`: New timestamp
3. The owner is implicit - it's the DID of the repo where the record is stored

### Backlink-Based Discovery

All spore records reference the origin garden DID via the `subject` field. This enables:

1. **Constellation Indexing**: The Constellation service indexes all records that reference a DID
2. **Backlink Queries**: We can query `getBacklinks(originGardenDid, 'garden.spores.item.specialSpore')` to find ALL spore records across all DIDs
3. **Current Holder Detection**: Sort all records by `createdAt` timestamp - most recent = current holder
4. **Full Lineage Tracking**: All historical records remain, creating a complete evolution history

## Display System (Hybrid Approach)

Spores are displayed through a **hybrid system** that integrates them into the garden experience:

### 1. Flower Bed Integration

Spores appear as **special line-drawing flowers** in flower beds:

- **Origin Garden**: The spore appears in the flower bed of the garden where it was born
- **Capture Trail**: Every garden that captured the spore shows it in their flower bed
- **Visual Distinction**: Spores are rendered as **outline-only** flowers (no fill), making them visually distinct from regular planted flowers
- **Sparkle Indicator**: A ✨ indicator marks spore flowers

This creates a **lineage trail** - as you visit gardens, you can discover spores and trace their journey through multiple flower beds.

### 2. Floating Badge (Steal UI)

When viewing the **current holder's** garden:

- A **floating badge** appears in the bottom-right corner
- Shows the spore visualization (outline style)
- Displays current owner and capture count
- Contains the **"Steal!"** button for logged-in users
- Animates with a subtle glow effect

This separates the steal mechanic from content sections, making it always accessible.

### 3. Spore Details Modal

Clicking a spore in the flower bed opens a modal showing:
- Large spore visualization
- Origin garden link
- Current holder link
- Capture history summary

## Visual Style

Spores use a distinctive **line-drawing** rendering style:

```
Regular Flowers: Filled petals with color
Spore Flowers:   Outline-only, no fill, with golden glow
```

This makes spores immediately recognizable as special items while maintaining the flower-based visual language.

## Technical Implementation

### Lexicon Schema

The schema is intentionally minimal - just two fields:

```json
{
  "required": ["subject", "createdAt"],
  "properties": {
    "subject": {
      "type": "string",
      "format": "did",
      "description": "Origin garden DID. Used for backlink indexing to find all captures of this spore."
    },
    "createdAt": {
      "type": "string",
      "format": "datetime",
      "description": "When this capture occurred."
    }
  }
}
```

### Why No `ownerDid` or `originGardenDid` Fields?

The schema is lean by design:

- **Owner is implicit**: In AT Protocol, every record's owner is the DID of the repo it's stored in. When you query backlinks, you get `backlink.did` which tells you who holds that record. No need to duplicate this in the record itself.

- **Origin = subject**: The `subject` field already stores the origin garden DID (for backlink indexing). Adding a separate `originGardenDid` would be redundant.

- **History is reconstructed**: Instead of storing history in each record, we query all backlinks for a given `subject` and sort by `createdAt` to reconstruct the full capture history.

### Key Functions

**Outline Flower Generation** (`src/utils/flower-svg.ts`):
```typescript
// Generate line-drawing style flower for spores
generateSporeFlowerSVGString(did: string, size: number): string
```

**Flower Bed Spore Rendering** (`src/layouts/flower-bed.ts`):
```typescript
// Finds and renders spores in flower beds
findSporesForGarden(gardenOwnerDid: string): Promise<SporeInfo[]>
renderSporesInFlowerBed(ownerDid: string, grid: HTMLElement): Promise<void>
```

**Floating Badge** (`src/components/spore-badge.ts`):
```typescript
// Self-contained component that renders on current holder's garden
class SporeBadge extends HTMLElement
```

## Gamification Aspects

- **Rarity**: Only 1 in 10 gardens gets a special spore (10% probability)
- **Deterministic**: Using seeded randomness based on DID ensures same garden always gets/doesn't get a spore
- **FFA Capture**: Anyone can steal - pure competitive capture-the-flag
- **Lineage Trail**: Spores leave a visual trail in flower beds of every garden they've visited
- **Discovery**: Follow spores through the network to discover new gardens

## Files

- **Lexicon**: `lexicons/garden.spores.item.specialSpore.json`
- **Outline Flower**: `src/utils/flower-svg.ts` (generateSporeFlowerSVGString)
- **Flower Bed Integration**: `src/layouts/flower-bed.ts`
- **Floating Badge**: `src/components/spore-badge.ts`
- **Generation Logic**: `src/config.ts`
- **Validation**: `src/config.ts` (isValidSpore)

## Migration from Section-Based Display

The previous `special-spore-display` section type is deprecated. Spores now:
1. Automatically appear in flower beds (no section needed)
2. Show as a floating badge on current holder's garden
3. Existing sections will show a migration notice
