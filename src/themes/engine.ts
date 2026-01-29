import chroma from 'chroma-js';
import { FONT_PAIRINGS } from './fonts.js';

/**
 * Theme Engine
 *
 * Handles applying themes (presets + custom overrides) to the site.
 * Uses CSS custom properties for easy runtime theming.
 */

const BORDER_STYLES = ['solid', 'dashed', 'dotted', 'double', 'groove'];
const BORDER_WIDTHS = ['1px', '2px', '3px', '4px'];
const SHADOW_OFFSETS = [0, 2, 4, 6, 8, 10, 12];
const SHADOW_BLURS = [0, 4, 8, 12, 16, 20, 28];
const SHADOW_SPREADS = [0, 0, 1, 2, 3];
const SHADOW_OPACITIES = [0, 0.06, 0.1, 0.14, 0.18, 0.22];
const SHADOW_TYPES: Array<'normal' | 'inset'> = ['normal', 'normal', 'normal', 'inset'];

const THEME_PRESETS = {
  minimal: {
    colors: {
      background: '#ffffff',
      text: '#1a1a1a',
      primary: '#0066cc',
      accent: '#0066cc',
      muted: '#666666',
      border: '#e0e0e0'
    },
    fonts: {
      heading: 'system-ui, -apple-system, sans-serif',
      body: 'system-ui, -apple-system, sans-serif'
    }
  },
  dark: {
    colors: {
      background: '#0a0a0a',
      text: '#f0f0f0',
      primary: '#60a5fa',
      accent: '#60a5fa',
      muted: '#a0a0a0',
      border: '#333333'
    },
    fonts: {
      heading: 'system-ui, -apple-system, sans-serif',
      body: 'system-ui, -apple-system, sans-serif'
    }
  },
  bold: {
    colors: {
      background: '#fef3c7',
      text: '#1c1917',
      primary: '#dc2626',
      accent: '#dc2626',
      muted: '#78716c',
      border: '#d6d3d1'
    },
    fonts: {
      heading: 'Georgia, serif',
      body: 'system-ui, -apple-system, sans-serif'
    }
  },
  retro: {
    colors: {
      background: '#000080',
      text: '#00ff00',
      primary: '#ff00ff',
      accent: '#ffff00',
      muted: '#00ffff',
      border: '#ff00ff'
    },
    fonts: {
      heading: '"Courier New", monospace',
      body: '"Courier New", monospace'
    }
  }
};



/**
 * Simple hash function to convert a string to a number
 */
function stringToHash(str) {
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
export function generateThemeFromDid(did) {
  const hash = stringToHash(did);
  const hue = hash % 360;

  // Generate a more saturated background color from the hash
  const backgroundColor = chroma.hsl(hue, 0.8, 0.9);

  // Ensure sufficient contrast for text color
  const textColor = chroma.contrast(backgroundColor, 'white') > 4.5 ? 'white' : 'black';

  // Generate a color palette
  const palette = chroma.scale([backgroundColor, textColor]).mode('lch').colors(5);

  const colors = {
    background: backgroundColor.hex(),
    text: textColor,
    primary: chroma(palette[2]).saturate(2).hex(),
    accent: chroma(palette[3]).saturate(2).hex(),
    muted: chroma.mix(backgroundColor, textColor, 0.5).hex(),
    border: chroma.mix(backgroundColor, textColor, 0.2).hex()
  };

  const fontPairingIndex = hash % FONT_PAIRINGS.length;
  const fonts = FONT_PAIRINGS[fontPairingIndex];
  const borderStyleIndex = hash % BORDER_STYLES.length;
  const borderStyle = BORDER_STYLES[borderStyleIndex];
  const borderWidthIndex = hash % BORDER_WIDTHS.length;
  const borderWidth = BORDER_WIDTHS[borderWidthIndex];

  // Deterministic shadow recipe per DID (used to make UI feel unique)
  const shadowOffsetIndex = hash % SHADOW_OFFSETS.length;
  const shadowOffset = SHADOW_OFFSETS[shadowOffsetIndex];
  const shadowBlurIndex = (hash >> 3) % SHADOW_BLURS.length;
  const shadowBlur = SHADOW_BLURS[shadowBlurIndex];
  const shadowSpreadIndex = (hash >> 6) % SHADOW_SPREADS.length;
  const shadowSpread = SHADOW_SPREADS[shadowSpreadIndex];
  const shadowOpacityIndex = (hash >> 9) % SHADOW_OPACITIES.length;
  const shadowOpacity = SHADOW_OPACITIES[shadowOpacityIndex];
  const shadowTypeIndex = (hash >> 12) % SHADOW_TYPES.length;
  const shadowType = SHADOW_TYPES[shadowTypeIndex];

  // Use accent (or text) as shadow tint so it feels tied to the garden palette
  const shadowColorBase = colors.accent || colors.primary || colors.text || '#000000';
  const shadowColor = chroma(shadowColorBase).alpha(shadowOpacity).css();

  const shadow = {
    type: shadowType,
    x: `${shadowOffset}px`,
    y: `${shadowOffset}px`,
    blur: `${shadowBlur}px`,
    spread: `${shadowSpread}px`,
    color: shadowColor,
  };

  const metadata = {
    hash,
    hue,
    fontPairingIndex,
    borderStyleIndex,
    borderWidthIndex,
    shadowOffsetIndex,
    shadowBlurIndex,
    shadowSpreadIndex,
    shadowOpacityIndex,
    shadowTypeIndex,
  };

  return { theme: { colors, fonts, borderStyle, borderWidth, shadow }, metadata };
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
  const systemFonts = ['system-ui', 'apple-system', 'Georgia', 'Courier New'];
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
 * Apply a theme to the document
 * Returns a promise that resolves when the theme is fully applied and fonts are loaded
 */
export function applyTheme(themeConfig: any = {}): Promise<void> {
  return new Promise(async (resolve) => {
    const preset = themeConfig.preset || 'minimal';
    const presetTheme = THEME_PRESETS[preset] || THEME_PRESETS.minimal;

    // Merge preset with custom overrides
    const colors = { ...presetTheme.colors, ...themeConfig.colors };
    const fonts = { ...presetTheme.fonts, ...themeConfig.fonts };
    const borderStyle = themeConfig.borderStyle || 'solid';
    const borderWidth = themeConfig.borderWidth || '2px';
    const shadow = themeConfig.shadow || {};

    // Extract font names that need to be loaded
    const fontNamesToLoad: string[] = [];
    Object.values(fonts).forEach((fontString) => {
      const fontName = extractFontName(fontString as string);
      if (fontName) {
        fontNamesToLoad.push(fontName);
      }
    });

    // Load fonts dynamically before applying theme
    await loadGoogleFonts(fontNamesToLoad);

    // Apply CSS custom properties
    const root = document.documentElement;

    // Colors
    Object.entries(colors).forEach(([key, value]) => {
      if (value) {
        root.style.setProperty(`--color-${key}`, value as string);
      }
    });

    // Set border-dark to be inverted for dark mode (use text color for borders in dark mode)
    // In dark mode: dark background -> light borders (text color)
    // In light mode: light background -> dark borders (text color)
    const borderDark = colors.text || presetTheme.colors.text || '#000000';
    root.style.setProperty('--color-border-dark', borderDark);

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

    // Add theme class to body
    document.body.className = document.body.className
      .replace(/theme-\w+/g, '')
      .trim();
    document.body.classList.add(`theme-${preset}`);

    // Wait for fonts to load before marking theme as ready
    // This prevents text flicker when custom fonts load
    if (document.fonts && fontNamesToLoad.length > 0) {
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
      // No custom fonts to load, or Font Loading API not available
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

/**
 * Get available theme presets
 */
export function getThemePresets() {
  return Object.keys(THEME_PRESETS);
}

/**
 * Get a specific theme preset
 */
export function getThemePreset(name) {
  return THEME_PRESETS[name];
}

/**
 * Map a theme preset name to its color values for PDS storage
 * 
 * This function returns the color mapping for a given preset, which can be
 * written directly to the PDS. The preset name itself is not saved to PDS,
 * only the color values are persisted.
 * 
 * @param presetName - The name of the theme preset (e.g., 'minimal', 'dark', 'bold', 'retro')
 * @returns An object with color values, or null if preset doesn't exist
 * 
 * @example
 * const colors = getPresetColors('dark');
 * // Returns: { background: '#0a0a0a', text: '#f0f0f0', primary: '#60a5fa', ... }
 */
export function getPresetColors(presetName) {
  const preset = THEME_PRESETS[presetName];
  if (!preset) {
    return null;
  }
  // Return a copy of the colors object
  return { ...preset.colors };
}

/**
 * Check if a theme config has custom overrides beyond generated defaults
 * 
 * This determines whether we need to write theme data to PDS or if we can
 * rely on client-side generation from the DID.
 * 
 * @param did - The DID to compare against
 * @param themeConfig - The theme configuration to check
 * @returns true if theme has custom overrides, false if it matches generated defaults
 */
export function hasCustomThemeOverrides(did: string, themeConfig: any): boolean {
  if (!themeConfig || !did) {
    return false;
  }

  const { theme: generated } = generateThemeFromDid(did);

  // Check if any colors differ from generated
  if (themeConfig.colors) {
    for (const [key, value] of Object.entries(themeConfig.colors)) {
      if (generated.colors[key] !== value) {
        return true;
      }
    }
  }

  // Check if any fonts differ from generated
  if (themeConfig.fonts) {
    for (const [key, value] of Object.entries(themeConfig.fonts)) {
      if (generated.fonts[key] !== value) {
        return true;
      }
    }
  }

  // Check border style/width
  if (themeConfig.borderStyle && themeConfig.borderStyle !== generated.borderStyle) {
    return true;
  }
  if (themeConfig.borderWidth && themeConfig.borderWidth !== generated.borderWidth) {
    return true;
  }

  // Check shadow overrides
  if (themeConfig.shadow) {
    const genShadow = generated.shadow || {};
    for (const [key, value] of Object.entries(themeConfig.shadow)) {
      if (genShadow[key] !== value) {
        return true;
      }
    }
  }

  return false;
}