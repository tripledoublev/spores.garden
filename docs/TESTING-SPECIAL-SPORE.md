# Special Spore Testing Guide

## Overview
The special spore is a rare, gamified collectible that implements capture-the-flag mechanics in spores.garden.

## Quick Facts
- **Rarity**: Only 1 in 10 gardens (10% probability)
- **Deterministic**: Based on seeded randomness from garden owner's DID
- **Capture Mechanics**: Can be stolen by other users (with restrictions)
- **Lineage**: Full history of all captures is preserved

---

## Test 1: Check if Your Garden Has a Spore

### Method 1: Using the Test Script
```bash
# Check if a specific DID will receive a spore
node test-spore-probability.js YOUR_DID_HERE

# Example:
node test-spore-probability.js did:plc:abc123xyz
```

### Method 2: Check in Your Garden
1. Start dev server: `npm run dev`
2. Login to your garden
3. Click **"Edit"** button
4. Click **"+ Add Section"**
5. Select **"Special Spore"** (✨ icon)
6. Click **"Save Changes"**
7. Check the section:
   - ✅ **Has spore**: Shows visualization + "You currently own this special spore!"
   - ❌ **No spore**: Shows "No special spore found in this garden."

---

## Test 2: Spore Creation (First-Time Onboarding)

The spore is created automatically during initial garden configuration:

1. **Create a new Bluesky account** (or use a test account)
2. **Login** to spores.garden
3. **Complete the welcome flow**:
   - Set title, subtitle, description
   - Choose theme
   - Save configuration
4. **Check if spore was created**:
   - Add "Special Spore Display" section
   - OR check browser DevTools → Network → Look for `putRecord` with collection `garden.spores.item.specialSpore`

**Code Reference** (`src/config.ts` lines 423-435):
```typescript
// Use seeded random for special spore (deterministic based on DID)
const rng = seededRandom(did);
// 1 in 10 chance to get a special spore
if (rng() < 0.1) {
    promises.push(putRecord(SPECIAL_SPORE_COLLECTION, CONFIG_RKEY, {
        $type: SPECIAL_SPORE_COLLECTION,
        subject: did,
        ownerDid: did,
        originGardenDid: did,
        createdAt: new Date().toISOString(),
        history: [{ did: did, timestamp: new Date().toISOString() }]
    }));
}
```

---

## Test 3: Spore Stealing (Capture-the-Flag)

### Prerequisites
- **Account A**: Has a special spore
- **Account B**: Different Bluesky account (the "thief")

### Test Case 3.1: Successful Steal (Clean State)

**Steps:**
1. Logout from Account A
2. Login with Account B
3. Navigate to Account A's garden: `/@did:plc:xxxxx` or `/@handle.bsky.social`
4. Scroll to "Special Spore" section
5. Verify you see: **"Steal this spore!"** button
6. Click the button
7. Confirm the dialog

**Expected Result:**
- ✅ Spore is stolen successfully
- ✅ A flower is automatically planted in Account A's garden (trade mechanic)
- ✅ Alert: "You successfully stole the special spore from [DID]!"
- ✅ Spore now appears in Account B's garden

### Test Case 3.2: Steal Blocked by Flower

**Steps:**
1. Login with Account B
2. Navigate to Account A's garden
3. Click **"Plant a flower"** button
4. Scroll to "Special Spore" section

**Expected Result:**
- ❌ No "Steal" button
- ✅ Message: "You cannot steal this spore because you have already planted a flower in this garden."

### Test Case 3.3: Steal Blocked by Seed

**Steps:**
1. Login with Account B (fresh account, no prior interaction)
2. Navigate to Account A's garden
3. Click **"Take a seed"** button
4. Scroll to "Special Spore" section

**Expected Result:**
- ❌ No "Steal" button
- ✅ Message: "You cannot steal this spore because you have already taken a seed from this garden."

### Test Case 3.4: Steal Blocked by Both

**Steps:**
1. Login with Account B
2. Navigate to Account A's garden
3. Click **"Plant a flower"** AND **"Take a seed"**
4. Scroll to "Special Spore" section

**Expected Result:**
- ❌ No "Steal" button
- ✅ Message: "You cannot steal this spore because you have already planted a flower and taken a seed from this garden."

---

## Test 4: Spore Lineage Tracking

### Setup
- Account A: Original owner (created spore)
- Account B: Stole spore from A
- Account C: Will steal spore from B

### Test Steps

**Step 1: Initial State**
1. View Account A's garden (as Account A)
2. Special Spore section shows: "You currently own this special spore!"
3. No lineage section (only 1 holder)

**Step 2: After First Steal**
1. Account B steals spore from Account A
2. View Account A's garden (as anyone)
3. Special Spore section shows:
   - Current owner: Account B
   - **Spore Lineage** section appears:
     - Account A (original) with timestamp

**Step 3: After Second Steal**
1. Account C steals spore from Account B (via Account A's garden)
2. View Account A's garden (as anyone)
3. Special Spore section shows:
   - Current owner: Account C
   - **Spore Lineage** section shows (chronological):
     - Account A (oldest)
     - Account B (middle)
     - Account C (current) - shown at top

**Step 4: Verify Lineage Persistence**
1. All spore records remain in their respective PDSs
2. Backlinks to origin garden (Account A) enable discovery
3. Most recent `createdAt` timestamp determines current holder

---

## Test 5: Backlink-Based Discovery

### What to Test
The special spore uses AT Protocol backlinks for cross-PDS discovery.

### Test Steps
1. Open browser DevTools → Network tab
2. Navigate to a Special Spore section
3. Look for API call to Constellation:
   ```
   GET https://api.constellation.bsky.network/v1/backlinks
   ?did=did:plc:xxxxx
   &collection=garden.spores.item.specialSpore:subject
   ```

**Expected Response:**
```json
{
  "records": [
    {
      "did": "did:plc:account_a",
      "collection": "garden.spores.item.specialSpore",
      "rkey": "self"
    },
    {
      "did": "did:plc:account_b",
      "collection": "garden.spores.item.specialSpore",
      "rkey": "self"
    }
  ]
}
```

### Verify
- ✅ All spore records are found (across different DIDs)
- ✅ Records are sorted by `createdAt` (most recent first)
- ✅ Current holder is determined correctly

---

## Test 6: Spore Visualization

### What to Test
The spore's visual appearance is generated from the current holder's DID.

### Test Steps
1. View a spore in Account A's garden (owned by Account A)
2. Note the visualization pattern/colors
3. Account B steals the spore
4. View the same spore in Account A's garden again

**Expected Result:**
- ✅ Visualization changes to reflect Account B's DID
- ✅ Lineage shows Account A's original visualization

**Code Reference** (`src/layouts/special-spore-display.ts` line 85):
```typescript
const viz = document.createElement('did-visualization');
viz.setAttribute('did', sporeOwnerDid); // Based on current owner's DID
```

---

## Test 7: Edge Cases

### Test 7.1: Viewing Your Own Spore
1. Login as Account A (spore owner)
2. View your own garden
3. Navigate to Special Spore section

**Expected:**
- ✅ Shows: "You currently own this special spore!"
- ❌ No "Steal" button

### Test 7.2: Logged Out User
1. Logout
2. Navigate to a garden with a special spore

**Expected:**
- ✅ Shows current owner
- ✅ Shows lineage (if multiple holders)
- ❌ No "Steal" button
- ❌ No restriction messages

### Test 7.3: Garden Without Spore
1. Navigate to a garden that didn't receive a spore
2. Add "Special Spore Display" section

**Expected:**
- ✅ Shows: "No special spore found in this garden."

---

## Test 8: Trade Mechanic

### What to Test
Stealing a spore automatically plants a flower in the origin garden.

### Test Steps
1. Account B steals spore from Account A
2. Navigate to Account A's garden
3. Check "Flower Bed" section

**Expected:**
- ✅ A new flower from Account B appears
- ✅ Flower has Account B's DID visualization
- ✅ "Plant a flower" button is now disabled for Account B

**Code Reference** (`src/layouts/special-spore-display.ts` lines 269-279):
```typescript
// Trade mechanic: Plant a flower in the garden as part of the trade
await createRecord('garden.spores.social.flower', {
    subject: gardenOwnerDid,
    createdAt: new Date().toISOString()
});
```

---

## Debugging Tips

### Check Console Logs
```javascript
// In browser console
console.log('Current DID:', getCurrentDid());
console.log('Site Owner DID:', getSiteOwnerDid());
```

### Check Network Requests
1. DevTools → Network tab
2. Filter by "constellation" or "backlinks"
3. Verify backlink queries return expected records

### Check Local Storage
```javascript
// In browser console
localStorage.getItem('spores-garden-config');
```

### Manual Record Check
```javascript
// Check if spore exists for a DID
const record = await getRecord(
  'did:plc:xxxxx',
  'garden.spores.item.specialSpore',
  'self'
);
console.log(record);
```

---

## Known Issues & Limitations

1. **Deterministic Generation**: Same DID always gets/doesn't get a spore
   - Can't "re-roll" for a different result
   - 90% of DIDs will never have a spore

2. **One Spore Per Garden**: Each garden can only have one special spore
   - Created during initial onboarding only
   - Can't create additional spores later

3. **Stealing Restrictions**: Once you interact with a garden (flower/seed), you can't steal
   - This is by design to encourage strategic choices
   - No way to "undo" interactions

4. **Backlink Dependency**: Relies on Constellation indexing
   - If Constellation is down, spore discovery fails
   - Fallback: Could implement direct PDS queries

---

## Success Criteria

A successful test should verify:

- ✅ Spore creation (10% probability, deterministic)
- ✅ Spore display (visualization, ownership)
- ✅ Stealing mechanics (restrictions, trade)
- ✅ Lineage tracking (chronological history)
- ✅ Backlink discovery (cross-PDS queries)
- ✅ Visual updates (DID-based visualization)
- ✅ Edge cases (logged out, no spore, etc.)

---

## Files to Review

- **Documentation**: `docs/special-spore.md`
- **Lexicon**: `lexicons/garden.spores.item.specialSpore.json`
- **Display Logic**: `src/layouts/special-spore-display.ts`
- **Creation Logic**: `src/config.ts` (lines 423-435)
- **Test Script**: `test-spore-probability.js`

---

## Quick Start

```bash
# 1. Check if your DID gets a spore
node test-spore-probability.js YOUR_DID

# 2. Start dev server
npm run dev

# 3. Login and add Special Spore section
# 4. Test stealing with a second account
# 5. Verify lineage tracking
```

Good luck testing! 🍄✨
