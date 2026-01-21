import { getConfig } from '../config';
import { generateThemeFromDid } from '../themes/engine';
import { getCurrentDid } from '../oauth';
import { generateFlowerSVGString } from './flower-svg';

const SOCIAL_CARD_WIDTH = 1200;
const SOCIAL_CARD_HEIGHT = 630;

/**
 * Renders the social card to a canvas and returns it.
 * Uses the same SVG flower generation as did-visualization.ts for consistency.
 */
async function renderSocialCardToCanvas(): Promise<HTMLCanvasElement> {
  const config = getConfig();
  const currentDid = getCurrentDid() || 'did:example:default';

  const canvas = document.createElement('canvas');
  canvas.width = SOCIAL_CARD_WIDTH;
  canvas.height = SOCIAL_CARD_HEIGHT;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Use the theme to get colors
  const { theme } = generateThemeFromDid(currentDid);
  const { colors } = theme;

  // Layout: Split into left (text) and right (flower) sections, 50% each
  const halfWidth = SOCIAL_CARD_WIDTH / 2;
  
  // Background
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, SOCIAL_CARD_WIDTH, SOCIAL_CARD_HEIGHT);

  // === RIGHT SECTION: Flower (centered in right half) ===
  const flowerSize = 400;
  const flowerSVG = generateFlowerSVGString(currentDid, flowerSize);
  const flowerImage = await svgToImage(flowerSVG, flowerSize, flowerSize);
  
  // Center flower in the right half
  const rightCenterX = halfWidth + halfWidth / 2;
  const rightCenterY = SOCIAL_CARD_HEIGHT / 2;
  const flowerX = rightCenterX - flowerSize / 2;
  const flowerY = rightCenterY - flowerSize / 2;
  ctx.drawImage(flowerImage, flowerX, flowerY, flowerSize, flowerSize);

  // === LEFT SECTION: Text content (centered vertically in left half) ===
  const leftPadding = 50;
  const leftCenterY = SOCIAL_CARD_HEIGHT / 2;
  
  // Title
  ctx.fillStyle = colors.text;
  ctx.font = '56px ' + (config.theme?.fonts?.heading || 'sans-serif');
  ctx.fillText(config.title || 'My Garden', leftPadding, leftCenterY - 40);

  // Subtitle
  ctx.font = '28px ' + (config.theme?.fonts?.body || 'sans-serif');
  ctx.fillText(config.subtitle || 'A personal ATProto website', leftPadding, leftCenterY + 10);

  // spores.garden branding at the bottom left
  ctx.font = 'bold 24px ' + (config.theme?.fonts?.body || 'sans-serif');
  ctx.fillStyle = colors.primary;
  ctx.fillText('🌱 spores.garden', leftPadding, SOCIAL_CARD_HEIGHT - 40);

  return canvas;
}

/**
 * Convert an SVG string to an Image element.
 */
function svgToImage(svgString: string, width: number, height: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(new Error('Failed to load SVG as image: ' + e));
    
    // Convert SVG string to data URL
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.src = url;
  });
}

/**
 * Generates a social card image as a Blob for the current garden.
 */
export async function generateSocialCardImage(): Promise<Blob> {
  const canvas = await renderSocialCardToCanvas();
  
  // Convert canvas to Blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to convert canvas to blob'));
      }
    }, 'image/png');
  });
}

/**
 * Generates a social card image as a data URL for preview purposes.
 */
export async function generateSocialCardDataUrl(): Promise<string> {
  const canvas = await renderSocialCardToCanvas();
  return canvas.toDataURL('image/png');
}

/**
 * Opens a preview of the social card in a new window.
 */
export async function previewSocialCard(): Promise<void> {
  const dataUrl = await generateSocialCardDataUrl();
  const previewWindow = window.open('', '_blank', 'width=1250,height=700');
  if (previewWindow) {
    previewWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Social Card Preview</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              background: #1a1a1a;
              display: flex;
              flex-direction: column;
              align-items: center;
              font-family: system-ui, sans-serif;
            }
            h1 {
              color: #fff;
              margin-bottom: 20px;
            }
            img {
              max-width: 100%;
              border: 1px solid #333;
              border-radius: 8px;
            }
            p {
              color: #888;
              margin-top: 20px;
            }
          </style>
        </head>
        <body>
          <h1>Social Card Preview</h1>
          <img src="${dataUrl}" alt="Social card preview" />
          <p>This is how your garden will appear when shared to Bluesky.</p>
        </body>
      </html>
    `);
    previewWindow.document.close();
  }
}
