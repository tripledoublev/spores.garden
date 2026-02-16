# spores.garden

**A digital garden that goes where you go.**

spores.garden is a personal website builder powered by your AT Protocol data. Curate your records, pick layouts, customize your space. Your content stays in your PDS—the website is just a view.

## Quick Start

```bash
npm install
npm run dev
```

Then open your browser to:
- `http://127.0.0.1:5174` (or the port shown in your terminal)

You will see a "Connect" button. Log in with your Bluesky/AT Protocol handle (e.g., `user.bsky.social`) to view and edit your garden.

You can also directly view gardens by URL:
- `http://127.0.0.1:5174/@your-handle.bsky.social` (path-based with handle)
- `http://127.0.0.1:5174/@did:plc:your-did-here` (path-based with DID)

## How It Works

1. **Load ALL records** from your PDS - any lexicon
2. **Select record types** to display
3. **Map to layouts** (post, card, image, leaflet, etc.)
4. **Customize** with themes and custom CSS
5. **Save config** to your PDS

## Lexicons

**Required Records:**
- `garden.spores.site.config` - Site configuration (title, subtitle)

**User Content:**
- `garden.spores.content.text` - Text content records
- `garden.spores.content.image` - Image content records

**Social/Interactive:**
- `garden.spores.social.flower` - Flowers planted in gardens
- `garden.spores.social.takenFlower` - Flowers collected from other gardens
- `garden.spores.item.specialSpore` - Special spore items (capture-the-flag mechanic)

**Generative (Client-Side Only):**
- Themes and sections are generated deterministically from your DID on every load—never stored on PDS

## Architecture

```
Static Site → Slingshot (records) + Constellation (backlinks) → Your PDS
```

- **Slingshot**: Fast record fetching cache
- **Constellation**: Backlink indexing for flower interactions and special spore tracking
- **atcute**: OAuth for AT Protocol

### Project Structure

- `/src/components/` - Web Components
  - `site-app.ts` - Main application coordinator
  - `site-*.ts` - Modular app components (Auth, Editor, Router, Renderer, Data, Interactions)
  - `section-block.ts` - Content block rendering
- `/src/layouts/` - Record rendering layouts
- `/src/records/` - AT Protocol record loading and field extraction
- `/src/themes/` - Theme engine and presets
- `/lexicons/` - AT Protocol lexicon definitions
- `/docs/` - Documentation

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
| `leaflet` | Long-form articles from leaflet.pub |
| `smoke-signal` | Events (hosting/attending) |
| `flower-bed` | Flower garden display |
| `collected-flowers` | Collected flowers display |

Layouts extract common fields (title, content, image, date, etc.) from any lexicon.

## Special Spores

Special spores are rare, gamified items that implement a capture-the-flag mechanic:

- **Rarity**: Only 1 in 10 new gardens receives a special spore (10% probability on first config)
- **Capture Mechanics**: Users can steal spores from gardens, but rapid re-steals are blocked for 1 minute
- **Backlink-Based**: All spore records reference the origin garden via backlinks, enabling full lineage tracking
- **Timestamp Guardrail**: Capture records with `createdAt` more than 5 minutes in the future are ignored
- **Evolution**: Complete history of all captures is preserved and displayed chronologically

See [Special Spore Documentation](docs/special-spore.md) for detailed implementation and mechanics.

## Themes

Built-in presets: `minimal`, `dark`, `bold`, `retro`

Custom CSS supported for full control.

## Testing

```bash
npm test          # Run tests in watch mode
npm run test:run  # Run tests once
npm run test:ui   # Run tests with UI
```

## Documentation

- [Layout System Developer Guide](docs/layouts.md) - Learn how to create custom layouts
- [Special Spore Documentation](docs/special-spore.md) - Special spore mechanics and implementation
- [Leaflet.pub Schema Notes](docs/leaflet-pub-schema-notes.md) - Notes on leaflet.pub integration

## License

MIT
