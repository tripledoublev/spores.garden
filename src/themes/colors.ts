import chroma from 'chroma-js';

/**
 * Simple hash function to convert a string to a number
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
 * Ensures a color meets contrast requirements by adjusting it
 */
function ensureContrast(color: chroma.Color, againstColor: chroma.Color | string, minContrast: number, adjustFn: (color: chroma.Color) => chroma.Color): chroma.Color {
  if (chroma.contrast(color, againstColor) >= minContrast) return color;
  let adjusted = color;
  for (let i = 0; i < 20 && chroma.contrast(adjusted, againstColor) < minContrast; i++) {
    adjusted = adjustFn(adjusted);
  }
  return adjusted;
}

/**
 * Creates a color by mixing two colors until contrast requirement is met
 */
function mixForContrast(color1: chroma.Color | string, color2: chroma.Color | string, againstColor: chroma.Color | string, minContrast: number, startRatio = 0.5, step = 0.05): chroma.Color {
  let ratio = startRatio;
  let mixed = chroma.mix(color1, color2, ratio);
  while (chroma.contrast(mixed, againstColor) < minContrast && ratio < 0.95) {
    ratio += step;
    mixed = chroma.mix(color1, color2, ratio);
  }
  return mixed;
}

/**
 * Generates a color palette from a DID string
 * Returns an object with all theme colors that meet contrast requirements
 */
export function generateColorsFromDid(did: string): Record<string, string> {
  const hash = stringToHash(did);
  const hue = hash % 360;

  // Generate vibrant background color
  const saturation = 0.85 + ((hash >> 8) % 16) / 100; // 0.85-1.0
  const lightness = 0.4 + ((hash >> 12) % 30) / 100; // 0.4-0.7
  const backgroundColor = chroma.hsl(hue, saturation, lightness);

  // Determine text color and background type
  const whiteContrast = chroma.contrast(backgroundColor, 'white');
  const blackContrast = chroma.contrast(backgroundColor, 'black');
  const textColor = (whiteContrast > blackContrast && whiteContrast > 4.5) ? 'white' : 'black';
  const isDarkBackground = whiteContrast > blackContrast;

  // Primary and accent: palette-based – derived from bg→text gradient in LCH
  // palette[0]=bg, [1]=25%, [2]=50% (primary), [3]=75% (accent), [4]=text
  const palette = chroma.scale([backgroundColor, textColor]).mode('lch').colors(5);
  let primaryColor = chroma(palette[2]).saturate(1.5);
  let accentColor = chroma(palette[3]).saturate(1.5);

  primaryColor = ensureContrast(primaryColor, backgroundColor, 3.0,
    c => isDarkBackground ? c.brighten(0.15) : c.darken(0.15));
  accentColor = ensureContrast(accentColor, backgroundColor, 3.0,
    c => isDarkBackground ? c.brighten(0.15) : c.darken(0.15));

  // Generate text-muted with sufficient contrast
  const textMutedColor = mixForContrast(backgroundColor, textColor, backgroundColor, 4.5, 0.5, 0.05);

  // Generate border color
  const borderColor = mixForContrast(backgroundColor, textColor, backgroundColor, 2.0, 0.3, 0.1);
  const borderMutedColor = chroma.mix(backgroundColor, borderColor, 0.6);

  // Determine accent button text color and ensure contrast
  const accentTextColor = chroma.contrast(accentColor, 'white') > 4.5 ? 'white' : 'black';
  accentColor = ensureContrast(accentColor, accentTextColor, 4.5,
    c => accentTextColor === 'white' ? c.brighten(0.1) : c.darken(0.1));

  return {
    background: backgroundColor.hex(),
    text: textColor,
    primary: primaryColor.hex(),
    accent: accentColor.hex(),
    muted: textMutedColor.hex(),
    'text-muted': textMutedColor.hex(),
    border: borderColor.hex(),
    'border-muted': borderMutedColor.hex(),
    'button-secondary-text': backgroundColor.hex(),
    'button-accent-text': accentTextColor
  };
}
