/**
 * Theme Preview Generator
 *
 * Generates an HTML page of "empty garden" previews (issue #60): background, color swatch
 * (bg, text, primary, accent, muted, border), accent button sample, flower in a bordered
 * box with shadow, and "a garden could grow here" in the theme's heading font. Reuses
 * generateThemeFromDid + generateFlowerSVGString so each DID matches real app behaviour.
 *
 * Usage:
 *   npx tsx scripts/generate-theme-previews.ts [options] [DIDs...]
 *
 * Options:
 *   --count=N     Generate N did:plc-like placeholder DIDs if no DIDs given. Default: 1000
 *   --dids=path   Read DIDs from file, one per line (trimmed, blanks skipped)
 *   --out=path    Output HTML path. Default: theme-previews.html
 *
 * Examples:
 *   npx tsx scripts/generate-theme-previews.ts
 *   npx tsx scripts/generate-theme-previews.ts --count=500 --out=previews.html
 *   npx tsx scripts/generate-theme-previews.ts --dids=dids.txt
 *   npx tsx scripts/generate-theme-previews.ts did:plc:abc123 did:plc:def456
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { generateThemeFromDid } from '../src/themes/engine';
import { getIsolineForDid } from '../src/themes/isolines.js';
import { generateFlowerSVGString } from '../src/utils/flower-svg';

const TAGLINE = 'a garden could grow here';
const FLOWER_SIZE = 120;
// Square isoline (same strategy as main site: body uses maxDimension x maxDimension for cover)
const ISOLINE_SIZE = 800;

// Base32 alphabet used by did:plc (RFC 4648 style; excludes 0,1,8,9).
const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  let state = Math.abs(h) || 1;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/** Generate a deterministic did:plc-like identifier (24-char base32). */
function generateDidPlcLike(index: number): string {
  const rng = seededRandom(`theme-previews-${index}`);
  let s = '';
  for (let i = 0; i < 24; i++) {
    s += BASE32[Math.floor(rng() * 32)];
  }
  return `did:plc:${s}`;
}

// Extract font family name from CSS font string; return null for system fonts.
function extractHeadingFontName(fontString: string): string | null {
  if (!fontString) return null;
  const match = fontString.match(/['"]([^'"]+)['"]/);
  if (!match) return null;
  const name = match[1];
  const system = ['system-ui', 'apple-system', 'Georgia', 'Courier New'];
  if (system.some((s) => name.includes(s))) return null;
  return name;
}

// Google Fonts weight specs for selected families (match engine where used).
const FONT_WEIGHTS: Record<string, string> = {
  'Orbitron': 'wght@400;700;900',
  'Passion One': 'wght@400;700;900',
  'Sniglet': 'wght@400;800',
  'Stardos Stencil': 'wght@400;700',
  'Trochut': 'wght@400;700',
  'Amatic SC': 'wght@400;700',
  'Caveat': 'wght@400;700',
  'Dancing Script': 'wght@400;700',
  'Shadows Into Light': 'wght@400',
  'Zilla Slab Highlight': 'wght@400;700',
  'Kalam': 'wght@300;400;700',
  'Flamenco': 'wght@300;400',
  'Cinzel Decorative': 'wght@400',
  'Syncopate': 'wght@400;700',
};

const FONTS_PER_LINK = 40;

function buildGoogleFontsUrls(fontNames: string[]): string[] {
  const uniq = [...new Set(fontNames)].filter((n) => n && n !== 'Inter');
  if (!uniq.length) return [];
  const urls: string[] = [];
  for (let i = 0; i < uniq.length; i += FONTS_PER_LINK) {
    const chunk = uniq.slice(i, i + FONTS_PER_LINK);
    const specs = chunk.map((name) => {
      const w = FONT_WEIGHTS[name] || 'wght@400';
      return `family=${encodeURIComponent(name)}:${w}`;
    });
    urls.push(`https://fonts.googleapis.com/css2?${specs.join('&')}&display=swap`);
  }
  return urls;
}

function parseArgs(): {
  count: number;
  didsPath: string | null;
  outPath: string;
  positional: string[];
} {
  let count = 1000;
  let didsPath: string | null = null;
  let outPath = 'theme-previews.html';
  const positional: string[] = [];

  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--count=')) {
      count = Math.max(1, parseInt(arg.slice(8), 10) || 1000);
    } else if (arg.startsWith('--dids=')) {
      didsPath = arg.slice(7).trim() || null;
    } else if (arg.startsWith('--out=')) {
      outPath = arg.slice(6).trim() || outPath;
    } else if (arg.startsWith('--')) {
      // ignore other flags
    } else if (arg.startsWith('did:')) {
      positional.push(arg);
    }
  }

  return { count, didsPath, outPath, positional };
}

function resolveDids(opts: ReturnType<typeof parseArgs>): string[] {
  if (opts.positional.length) return opts.positional;
  if (opts.didsPath) {
    const raw = readFileSync(resolve(process.cwd(), opts.didsPath), 'utf-8');
    return raw
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length && s.startsWith('did:'));
  }
  return Array.from({ length: opts.count }, (_, i) => generateDidPlcLike(i));
}

interface Preview {
  did: string;
  theme: ReturnType<typeof generateThemeFromDid>['theme'];
  flowerSvg: string;
  headingFontName: string | null;
  isolineDataUri: string;
}

function buildPreviews(dids: string[]): Preview[] {
  return dids.map((did) => {
    const { theme } = generateThemeFromDid(did);
    const flowerSvg = generateFlowerSVGString(did, FLOWER_SIZE);
    const headingFontName = extractHeadingFontName(theme.fonts.heading);
    const { dataUri: isolineDataUri } = getIsolineForDid(did, theme.colors, ISOLINE_SIZE, ISOLINE_SIZE);
    return { did, theme, flowerSvg, headingFontName, isolineDataUri };
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Parse hex to "r,g,b" for use in rgba(var(--x), 0.25). */
function hexToRgbCss(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '#ffffff');
  if (!result) return '255, 255, 255';
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

const SWATCH_KEYS = ['background', 'text', 'primary', 'accent', 'muted', 'border', 'border-muted'] as const;

function renderCard(p: Preview, fontNames: Set<string>): string {
  const c = p.theme.colors as Record<string, string>;
  const borderColor = c.text || '#000';
  const borderStyle = p.theme.borderStyle || 'solid';
  const borderWidth = p.theme.borderWidth || '2px';
  const fontFamily = p.theme.fonts.heading;
  if (p.headingFontName) fontNames.add(p.headingFontName);

  const accentBg = c.accent || c.primary || '#000';
  const accentFg = (c['button-accent-text'] || 'white') as string;

  const chips = SWATCH_KEYS.map((k) => {
    const hex = c[k];
    if (!hex) return '';
    return `<span class="chip" style="background:${escapeHtml(hex)}" title="${k}"></span>`;
  }).filter(Boolean);
  const swatchTitle = SWATCH_KEYS.join(', ');

  const shortDid = p.did.length > 32 ? p.did.slice(0, 20) + '…' + p.did.slice(-6) : p.did;
  const fontLabel = p.headingFontName || 'system';

  const bgRgb = hexToRgbCss(c.background || '#fff');
  const textRgb = hexToRgbCss(c.text || '#000');

  const safeDataUri = p.isolineDataUri.replace(/'/g, '%27').replace(/"/g, '%22');
  return `
    <div class="card" style="
      --card-bg-rgb: ${escapeHtml(bgRgb)};
      --card-text-rgb: ${escapeHtml(textRgb)};
      background-color: ${escapeHtml(c.background || '#fff')};
      color: ${escapeHtml(c.text || '#000')};
    ">
      <div class="card-bg" style="background-image: url(&quot;${safeDataUri}&quot;);"></div>
      <div class="swatch" title="${escapeHtml(swatchTitle)}">${chips.join('')}</div>
      <div class="accent-sample">
        <span class="accent-btn" style="background:${escapeHtml(accentBg)};color:${escapeHtml(accentFg)};border:1px solid ${escapeHtml(borderColor)}">Btn</span>
      </div>
      <div class="card-content">
        <div class="flower-box">
          <div class="flower-wrap">${p.flowerSvg}</div>
          <p class="tagline" style="font-family: ${escapeHtml(fontFamily)};">${escapeHtml(TAGLINE)}</p>
        </div>
        <p class="meta">${escapeHtml(fontLabel)}</p>
      </div>
    </div>`;
}

function renderHtml(previews: Preview[]): string {
  const fontNames = new Set<string>();
  const cardsHtml = previews.map((p) => renderCard(p, fontNames)).join('\n');
  const fontUrls = buildGoogleFontsUrls([...fontNames]);
  const fontLinks = fontUrls.map((url) => `  <link rel="stylesheet" href="${url}" />`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Theme previews · spores.garden</title>
${fontLinks}
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 1rem; font-family: system-ui, sans-serif; background: #1a1a1a; color: #e0e0e0; }
    h1 { font-size: 1.25rem; margin: 0 0 1rem; font-weight: 600; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem; }
    .card {
      position: relative;
      width: 100%;
      min-width: 0;
      padding: 0.75rem;
      border-radius: 8px;
      overflow: hidden;
      min-height: 280px;
    }
    /* Full-bleed isoline layer (same strategy as main site: pattern on body, cover) */
    .card-bg {
      position: absolute;
      inset: 0;
      z-index: 0;
      border-radius: inherit;
      background-color: inherit;
      background-size: cover;
      background-position: center center;
      background-repeat: no-repeat;
    }
    .card > .swatch,
    .card > .accent-sample {
      position: relative;
      z-index: 1;
    }
    .card > .card-content {
      position: relative;
      z-index: 1;
      background: rgba(var(--card-bg-rgb), 0.25) !important;
      border-radius: 8px;
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.1);
      backdrop-filter: blur(80px);
      -webkit-backdrop-filter: blur(80px);
      border: 1px solid rgba(var(--card-text-rgb), 0.1);
      padding: 0.75rem;
      min-height: calc(280px - 1.5rem);
    }
    .swatch { display: flex; gap: 2px; margin-bottom: 0.35rem; flex-wrap: wrap; }
    .chip { width: 14px; height: 14px; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.15); }
    .accent-sample { margin-bottom: 0.35rem; }
    .accent-btn { font-size: 0.65rem; padding: 2px 6px; font-weight: 700; text-transform: uppercase; }
    .flower-box {
      padding: 1rem 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
    }
    .flower-wrap { display: flex; align-items: center; justify-content: center; }
    .flower-wrap svg { display: block; width: ${FLOWER_SIZE}px; height: ${FLOWER_SIZE}px; }
    .tagline { margin: 0; font-size: 1rem; font-weight: 400; text-align: center; line-height: 1.25; }
    .meta {
      margin: 0.35rem 0 0;
      font-size: 0.7rem;
      line-height: 1.4;
      word-break: break-all;
      opacity: 1;
    }
  </style>
</head>
<body>
  <h1>Theme previews (empty garden) · ${previews.length} DIDs</h1>
  <div class="grid">${cardsHtml}</div>
</body>
</html>`;
}

async function main() {
  const opts = parseArgs();
  const cwd = process.cwd();
  const outPath = resolve(cwd, opts.outPath);

  const dids = resolveDids(opts);
  if (!dids.length) {
    console.error('No DIDs provided. Use --count=N, --dids=path, or pass DIDs as arguments.');
    process.exit(1);
  }

  console.log(`Generating ${dids.length} theme preview(s) -> ${outPath}`);
  const previews = buildPreviews(dids);
  const html = renderHtml(previews);
  writeFileSync(outPath, html, 'utf-8');
  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
