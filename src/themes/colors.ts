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

  // Generate vibrant primary color
  const primarySaturation = 0.9 + ((hash >> 4) % 11) / 100;
  const primaryLightness = isDarkBackground 
    ? 0.6 + ((hash >> 16) % 20) / 100 
    : 0.3 + ((hash >> 16) % 20) / 100;
  let primaryColor = chroma.hsl(hue, primarySaturation, primaryLightness);
  primaryColor = ensureContrast(primaryColor, backgroundColor, 3.0, 
    c => {
      const [, s, l] = c.hsl();
      return isDarkBackground 
        ? chroma.hsl(hue, s, Math.min(l + 0.1, 0.8))
        : chroma.hsl(hue, s, Math.max(l - 0.1, 0.2));
    });

  // Generate vibrant accent color
  const accentHue = (hue + 60 + ((hash >> 20) % 120)) % 360;
  const accentSaturation = 0.9 + ((hash >> 5) % 11) / 100;
  const accentLightness = isDarkBackground
    ? 0.6 + ((hash >> 17) % 20) / 100
    : 0.3 + ((hash >> 17) % 20) / 100;
  let accentColor = chroma.hsl(accentHue, accentSaturation, accentLightness);
  accentColor = ensureContrast(accentColor, backgroundColor, 3.0,
    c => {
      const [, s, l] = c.hsl();
      return isDarkBackground
        ? chroma.hsl(accentHue, s, Math.min(l + 0.1, 0.8))
        : chroma.hsl(accentHue, s, Math.max(l - 0.1, 0.2));
    });

  // Generate text-muted with sufficient contrast
  const textMutedColor = mixForContrast(backgroundColor, textColor, backgroundColor, 4.5, 0.5, 0.05);

  // Generate border color
  const borderColor = mixForContrast(backgroundColor, textColor, backgroundColor, 2.0, 0.3, 0.1);

  // Generate button-secondary background (must contrast with bg AND bg must contrast with it as text)
  let buttonSecondaryBg = textMutedColor;
  if (chroma.contrast(backgroundColor, buttonSecondaryBg) < 3.0 || 
      chroma.contrast(buttonSecondaryBg, backgroundColor) < 4.5) {
    buttonSecondaryBg = mixForContrast(backgroundColor, textColor, backgroundColor, 3.0, 0.4, 0.02);
    // Ensure bg works as text on button
    if (chroma.contrast(buttonSecondaryBg, backgroundColor) < 4.5) {
      buttonSecondaryBg = isDarkBackground 
        ? chroma.mix(backgroundColor, 'white', 0.3)
        : chroma.mix(backgroundColor, 'black', 0.2);
    }
  }

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
    'button-secondary-bg': buttonSecondaryBg.hex(),
    'button-secondary-text': backgroundColor.hex(),
    'button-accent-text': accentTextColor
  };
}
