import chroma from 'chroma-js';
import { getDefaultFontPairing } from './fonts.js';
import { generateColorsFromDid } from './colors.js';
import { generateIsolineConfigFromDid, getIsolineSVGStringForDid, clearIsolineCache, type IsolineConfig } from './isolines.js';

/** Current pattern Blob URL; revoked when theme changes to avoid leaks */
let currentPatternBlobUrl: string | null = null;
/** Stored so we can regenerate pattern on resize at correct viewport size */
let lastPatternDid: string | null = null;
let lastPatternColors: Record<string, string> | null = null;

/** Browser viewport size (innerWidth/innerHeight = what the user sees) */
function getViewportPatternSize(): { w: number; h: number } {
  const w = Math.max(Math.round(window.innerWidth), 320);
  const h = Math.max(Math.round(window.innerHeight), 320);
  return { w, h };
}

function applyPatternAtViewportSize(): void {
  if (!lastPatternDid || !lastPatternColors) return;
  const { w, h } = getViewportPatternSize();
  if (currentPatternBlobUrl) URL.revokeObjectURL(currentPatternBlobUrl);
  const svgString = getIsolineSVGStringForDid(lastPatternDid, lastPatternColors, w, h);
  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  currentPatternBlobUrl = URL.createObjectURL(blob);
  const root = document.documentElement;
  root.style.setProperty('--pattern-background', `url("${currentPatternBlobUrl}")`);
  root.style.setProperty('--pattern-width', `${w}px`);
  root.style.setProperty('--pattern-height', `${h}px`);
}

let resizeThrottleId: ReturnType<typeof setTimeout> | null = null;
function onResize(): void {
  if (resizeThrottleId) return;
  resizeThrottleId = setTimeout(() => {
    resizeThrottleId = null;
    applyPatternAtViewportSize();
  }, 150);
}

let resizeListenerAdded = false;
function ensureResizeListener(): void {
  if (resizeListenerAdded) return;
  resizeListenerAdded = true;
  window.addEventListener('resize', onResize);
}

/**
 * Theme Engine
 *
 * Handles applying themes to the site.
 * Uses CSS custom properties for easy runtime theming.
 */

const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove'];
const BORDER_WIDTHS = ['1px', '2px', '3px', '4px'];
const SHADOW_OFFSETS = [0, 2, 4, 6, 8, 10, 12];
const SHADOW_BLURS = [0, 4, 8, 12, 16, 20, 28];
const SHADOW_SPREADS = [0, 0, 1, 2, 3];
const SHADOW_OPACITIES = [0, 0.06, 0.1, 0.14, 0.18, 0.22];
const SHADOW_TYPES: Array<'normal' | 'inset'> = ['normal', 'normal', 'normal', 'inset'];

const LAST_THEME_STORAGE_KEY = 'spores.lastTheme';




/**
 * Simple hash function to convert a string to a number
 * Used for generating deterministic values from DID
 */
function stringToHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Generates a theme from a DID string
 */
export function generateThemeFromDid(did: string) {
  const hash = stringToHash(did);
  const hue = hash % 360;

  // Generate colors using the dedicated color generation module
  const colors = generateColorsFromDid(did);

  // Generate shadow
  const shadowOffsetIndex = hash % SHADOW_OFFSETS.length;
  const shadowBlurIndex = (hash >> 3) % SHADOW_BLURS.length;
  const shadowSpreadIndex = (hash >> 6) % SHADOW_SPREADS.length;
  const shadowOpacityIndex = (hash >> 9) % SHADOW_OPACITIES.length;
  const shadowTypeIndex = (hash >> 12) % SHADOW_TYPES.length;
  const shadowColorBase = colors.accent || colors.primary || colors.text || '#000000';
  
  const shadow = {
    type: SHADOW_TYPES[shadowTypeIndex],
    x: `${SHADOW_OFFSETS[shadowOffsetIndex]}px`,
    y: `${SHADOW_OFFSETS[shadowOffsetIndex]}px`,
    blur: `${SHADOW_BLURS[shadowBlurIndex]}px`,
    spread: `${SHADOW_SPREADS[shadowSpreadIndex]}px`,
    color: chroma(shadowColorBase).alpha(SHADOW_OPACITIES[shadowOpacityIndex]).css()
  };

  // Generate isoline configuration
  const isolines = generateIsolineConfigFromDid(did, colors);

  return {
    theme: {
      colors,
      fonts: getDefaultFontPairing(),
      borderStyle: BORDER_STYLES[hash % BORDER_STYLES.length],
      borderWidth: BORDER_WIDTHS[hash % BORDER_WIDTHS.length],
      shadow,
      isolines
    },
    metadata: {
      hash,
      hue,
      borderStyleIndex: hash % BORDER_STYLES.length,
      borderWidthIndex: hash % BORDER_WIDTHS.length,
      shadowOffsetIndex,
      shadowBlurIndex,
      shadowSpreadIndex,
      shadowOpacityIndex,
      shadowTypeIndex
    }
  };
}


/**
 * Extract font family name from CSS font string
 * e.g., "'Bungee', sans-serif" -> "Bungee"
 * e.g., "'Press Start 2P', monospace" -> "Press Start 2P"
 * Returns null for system fonts
 */
function extractFontName(fontString: string): string | null {
  if (!fontString) return null;
  
  // Match quoted font names (single or double quotes)
  const match = fontString.match(/['"]([^'"]+)['"]/);
  if (!match) return null;
  
  const fontName = match[1];
  
  // Skip system fonts
  const systemFonts = ['system-ui', 'apple-system', 'Georgia', 'Courier New', 'JetBrains Mono', 'Work Sans'];
  if (systemFonts.some(sys => fontName.includes(sys))) {
    return null;
  }
  
  return fontName;
}

/**
 * Build Google Fonts URL for specific fonts
 */
function buildGoogleFontsUrl(fontNames: string[]): string {
  if (fontNames.length === 0) return '';
  
  // Filter out Inter (already loaded statically) and system fonts
  const fontsToLoad = fontNames.filter(name => name && name !== 'Inter');
  
  if (fontsToLoad.length === 0) return '';
  
  // Build URL with font families
  // Most fonts use weight 400, some need specific weights
  const fontSpecs = fontsToLoad.map(name => {
    // Handle fonts that need specific weights
    const weightMap: Record<string, string> = {
      'Inter': 'wght@400;500;600;700;800',
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
    
    const weight = weightMap[name] || 'wght@400';
    return `family=${encodeURIComponent(name)}:${weight}`;
  });
  
  return `https://fonts.googleapis.com/css2?${fontSpecs.join('&')}&display=swap`;
}

// Track loaded fonts to avoid duplicates
const loadedFonts = new Set<string>();

/**
 * Dynamically load Google Fonts
 */
function loadGoogleFonts(fontNames: string[]): Promise<void> {
  return new Promise((resolve) => {
    const url = buildGoogleFontsUrl(fontNames);
    if (!url) {
      resolve();
      return;
    }
    
    // Check if we already loaded these fonts
    const allLoaded = fontNames.every(name => !name || name === 'Inter' || loadedFonts.has(name));
    if (allLoaded) {
      resolve();
      return;
    }
    
    // Mark fonts as loading
    fontNames.forEach(name => {
      if (name && name !== 'Inter') {
        loadedFonts.add(name);
      }
    });
    
    // Create and inject link tag
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = () => resolve();
    link.onerror = () => resolve(); // Resolve anyway to not block rendering
    document.head.appendChild(link);
  });
}

/**
 * Restore the last applied theme colors to the document so the loading screen
 * shows the previous garden's colors instead of white when navigating.
 * 
 * Note: This is primarily called via inline script in index.html for earliest execution.
 * Kept as exported function for potential programmatic use or fallback scenarios.
 */
export function restorePreviousTheme(): void {
  try {
    const raw = sessionStorage.getItem(LAST_THEME_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw) as Record<string, string>;
    const root = document.documentElement;
    if (saved.background) root.style.setProperty('--color-background', saved.background);
    if (saved.text) root.style.setProperty('--color-text', saved.text);
    if (saved.muted) root.style.setProperty('--color-text-muted', saved.muted);
  } catch {
    // Ignore parse errors or missing storage
  }
}

/**
 * Apply a theme to the document
 * Returns a promise that resolves when the theme is fully applied and fonts are loaded
 */
export function applyTheme(
  themeConfig: any = {},
  options?: { waitForFonts?: boolean; did?: string }
): Promise<void> {
  return new Promise(async (resolve) => {
    const waitForFonts = options?.waitForFonts !== false;
    const did = options?.did;
    const colors = themeConfig.colors || {};
    const fonts = { ...getDefaultFontPairing(), ...themeConfig.fonts };
    const borderStyle = themeConfig.borderStyle || 'solid';
    const borderWidth = themeConfig.borderWidth || '2px';
    const shadow = themeConfig.shadow || {};
    // Isolines: apply when DID is present unless theme explicitly disables (default on for garden pages)
    const isolines = themeConfig.hasOwnProperty('isolines') ? themeConfig.isolines : true;

    // Extract font names that need to be loaded
    const fontNamesToLoad: string[] = [];
    Object.values(fonts).forEach((fontString) => {
      const fontName = extractFontName(fontString as string);
      if (fontName) {
        fontNamesToLoad.push(fontName);
      }
    });

    // Load fonts dynamically. For navigation we can avoid blocking on font load
    // to keep route changes snappy; fonts will swap in when ready.
    if (waitForFonts) {
      await loadGoogleFonts(fontNamesToLoad);
    } else {
      void loadGoogleFonts(fontNamesToLoad);
    }

    // Apply CSS custom properties
    const root = document.documentElement;

    // Helper to extract RGB values from hex color
    const hexToRgb = (hex: string): string | null => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result
        ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
        : null;
    };

    // Colors
    Object.entries(colors).forEach(([key, value]) => {
      if (value) {
        root.style.setProperty(`--color-${key}`, value as string);
        // Also set RGB version for use with rgba()
        const rgb = hexToRgb(value as string);
        if (rgb) {
          root.style.setProperty(`--color-${key}-rgb`, rgb);
        }
      }
    });

    // Set border-dark to be inverted for dark mode (use text color for borders in dark mode)
    // In dark mode: dark background -> light borders (text color)
    // In light mode: light background -> dark borders (text color)
    const borderDark = colors.text || '#000000';
    root.style.setProperty('--color-border-dark', borderDark);

    // Persist theme colors for next page load to enable smooth color transitions
    // between gardens (prevents white flash on navigation)
    try {
      sessionStorage.setItem(LAST_THEME_STORAGE_KEY, JSON.stringify({
        background: colors.background,
        text: colors.text,
        muted: colors.muted
      }));
    } catch {
      // Ignore quota exceeded or privacy/security errors
    }

    // Fonts
    Object.entries(fonts).forEach(([key, value]) => {
      if (value) {
        root.style.setProperty(`--font-${key}`, value as string);
      }
    });

    // Border style
    root.style.setProperty('--border-style', borderStyle);
    root.style.setProperty('--border-width', borderWidth);

    // Drop shadows (all optional; safe defaults live in base.css)
    if (shadow.type) root.style.setProperty('--shadow-type', String(shadow.type));
    if (shadow.x) root.style.setProperty('--shadow-x', String(shadow.x));
    if (shadow.y) root.style.setProperty('--shadow-y', String(shadow.y));
    if (shadow.blur) root.style.setProperty('--shadow-blur', String(shadow.blur));
    if (shadow.spread) root.style.setProperty('--shadow-spread', String(shadow.spread));
    if (shadow.color) root.style.setProperty('--shadow-color', String(shadow.color));

    // Apply isoline background pattern (static image, not motion)
    // Use Blob URL so Chrome doesn't hit data-URI size limit (~2MB).
    // Size SVG to layout viewport (clientWidth/clientHeight) so pattern matches screen.
    if (did && isolines !== false) {
      if (currentPatternBlobUrl) {
        URL.revokeObjectURL(currentPatternBlobUrl);
        currentPatternBlobUrl = null;
      }
      lastPatternDid = did;
      lastPatternColors = colors;
      const { w, h } = getViewportPatternSize();
      const svgString = getIsolineSVGStringForDid(did, colors, w, h);
      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const blobUrl = URL.createObjectURL(blob);
      currentPatternBlobUrl = blobUrl;
      root.style.setProperty('--pattern-background', `url("${blobUrl}")`);
      root.style.setProperty('--pattern-width', `${w}px`);
      root.style.setProperty('--pattern-height', `${h}px`);
      document.body.classList.add('has-pattern');
      ensureResizeListener();
    } else {
      if (currentPatternBlobUrl) {
        URL.revokeObjectURL(currentPatternBlobUrl);
        currentPatternBlobUrl = null;
      }
      lastPatternDid = null;
      lastPatternColors = null;
      root.style.setProperty('--pattern-background', 'none');
      root.style.removeProperty('--pattern-width');
      root.style.removeProperty('--pattern-height');
      document.body.classList.remove('has-pattern');
    }

    // Clean up stale theme classes (preserve has-pattern if present)
    const hasPattern = document.body.classList.contains('has-pattern');
    document.body.className = document.body.className
      .replace(/theme-\w+/g, '')
      .trim();
    if (hasPattern) {
      document.body.classList.add('has-pattern');
    }

    // Wait for fonts to load before marking theme as ready (optional).
    // This prevents text flicker when custom fonts load, but can slow navigation.
    if (waitForFonts && document.fonts && fontNamesToLoad.length > 0) {
      // Wait for specific fonts to load
      const fontPromises = fontNamesToLoad.map(fontName => {
        return document.fonts.load(`1em "${fontName}"`).catch(() => {
          // Ignore errors - font might already be loaded or might fail
        });
      });
      
      Promise.all(fontPromises).then(() => {
        // Double-check with fonts.ready for safety
        return document.fonts.ready;
      }).then(() => {
        // Mark fonts as ready
        document.body.classList.add('fonts-ready');
        
        // Mark theme as ready after CSS properties have been applied and painted
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            root.setAttribute('data-theme-ready', 'true');
            resolve();
          });
        });
      }).catch(() => {
        // Fallback if font loading fails - show text anyway after a short delay
        document.body.classList.add('fonts-ready');
        setTimeout(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              root.setAttribute('data-theme-ready', 'true');
              resolve();
            });
          });
        }, 100);
      });
    } else {
      // No custom fonts to load, Font Loading API not available, or we chose not to wait.
      document.body.classList.add('fonts-ready');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          root.setAttribute('data-theme-ready', 'true');
          resolve();
        });
      });
    }
  });
}

// Re-export isoline utilities for external use
export { clearIsolineCache, type IsolineConfig };