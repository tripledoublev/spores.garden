# spores.garden

**A digital garden that goes where you go.**

spores.garden is a personal website builder powered by your AT Protocol data. Curate your records, pick layouts, customize your space.

## Quick Start

```bash
npm install
npm run dev
```

Then open one of:
- `http://127.0.0.1:5174/@your-handle.bsky.social` (path-based with handle)
- `http://127.0.0.1:5174/@did:plc:your-did-here` (path-based with DID)
- `http://127.0.0.1:5174?did=did:plc:your-did-here` (query param with DID)
- `http://127.0.0.1:5174?handle=your-handle.bsky.social` (query param with handle)

The app automatically resolves handles to DIDs using the AT Protocol identity service.

## How It Works

1. **Load ALL records** from your PDS - any lexicon
2. **Select record types** to display
3. **Map to layouts** (post, card, image, links, etc.)
4. **Customize** with themes and custom CSS
5. **Save config** to your PDS

Your content stays in your PDS. The website is just a view.

## Lexicons

**Required Records:**
- `garden.spores.site.config` - Site configuration (title, subtitle, description, favicon)

**Never Written to PDS (Client-Side Only):**
- Themes - Generated deterministically from DID via `generateThemeFromDid()`
- Sections - Generated deterministically from DID via `generateInitialSections()`

**User Content:**
- `garden.spores.site.content` - Custom content blocks (user-authored, written to PDS)

**Social/Interactive:**
- `garden.spores.item.specialSpore` - Special spore items (capture-the-flag mechanic, written to PDS)

**Architecture Philosophy:** 
- **Generative content** (themes, sections) is computed from the DID on every load - never stored on PDS
- **User-authored content** (custom blocks) is stored on PDS - it's unique data the user created
- **Social objects** (spores) are stored on PDS - they need to be transferred between users
- This reduces PDS storage, improves iteration speed, and minimizes attack surface

## Architecture

```
Static Site → Slingshot (records) + Constellation (backlinks) → Your PDS
```

- **Slingshot**: Fast record fetching cache
- **Constellation**: Backlink indexing for flower interactions and special spore tracking
- **atcute**: OAuth for AT Protocol

## Layouts

| Layout | Best For |
|--------|----------|
| `post` | Blog posts, articles |
| `card` | Short content |
| `image` | Photos, art |
| `link` | Single link preview |
| `links` | Link tree |
| `list` | Generic list |
| `profile` | About section |
| `raw` | Custom HTML |
| `flower-bed` | Flower garden display (includes spores) |
| `collected-flowers` | Collected flowers display |

Layouts extract common fields (title, content, image, date, etc.) from any lexicon.

## Special Spores

Special spores are rare, gamified items that implement a free-for-all capture-the-flag mechanic:

- **Rarity**: Only 1 in 10 new gardens receives a special spore (10% probability on first config)
- **FFA Capture**: Any logged-in user can steal a spore from its current holder
- **Backlink-Based**: All spore records reference the origin garden via backlinks, enabling full lineage tracking
- **Hybrid Display**: Spores appear in flower beds (as outline-style flowers) AND as a floating steal badge
- **Lineage Trail**: Visit gardens to discover spores and trace their capture history through flower beds

### Spore Validation

To prevent adversarial actors from creating fake spores, the app validates spores client-side:

- **Deterministic Verification**: Uses `isValidSpore(originGardenDid)` to check if a spore should exist
- **Same Algorithm**: Uses the same `seededRandom()` logic as spore creation (10% chance)
- **Client-Side Filtering**: Invalid spores are ignored by the app, even if they exist on PDS
- **Attack Prevention**: Adversarial actors can create fake spore records, but the app won't render them

This maintains spore rarity without requiring centralized validation or trusted authorities.

See [Special Spore Documentation](docs/special-spore.md) for detailed implementation and mechanics.

## Themes

Built-in presets: `minimal`, `dark`, `bold`, `retro`

Custom CSS supported for full control.
