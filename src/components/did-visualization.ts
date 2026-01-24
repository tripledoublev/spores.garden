import { generateThemeFromDid } from "../themes/engine";
import { generateFlowerSVGString } from '../utils/flower-svg';

/**
 * Seeded random number generator for deterministic randomness
 */
function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  let state = Math.abs(hash);

  return function () {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Lighten or darken a hex color
 */
function adjustColor(hex: string, amount: number): string {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Parse RGB
  let r = parseInt(hex.slice(0, 2), 16);
  let g = parseInt(hex.slice(2, 4), 16);
  let b = parseInt(hex.slice(4, 6), 16);

  // Adjust
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));

  // Convert back to hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Generate flower parameters from DID
 */
interface FlowerParams {
  // Petal configuration
  petalCount: number;
  petalShape: 'round' | 'pointed' | 'wavy' | 'heart' | 'tulip';
  petalSize: number;
  petalRotation: number;

  // Layering (Proposal 1)
  layerCount: number;
  layerRotationOffset: number;
  layerSizeDecay: number;

  // Per-petal variation (Proposal 3)
  petalSizeJitter: number;
  petalAngleJitter: number;
  petalCurveJitter: number;

  // Center style (Proposal 4)
  centerStyle: 'simple' | 'stamen' | 'spiral' | 'dots' | 'ring';
  centerSize: number;
  stamenCount: number;

  // Stem and leaves
  hasStem: boolean;
  hasLeaves: boolean;
  leafStyle: 'ellipse' | 'pointed' | 'serrated';

  // Colors
  primaryColor: string;
  secondaryColor: string;
  centerColor: string;
  stamenTipColor: string;
}

function generateFlowerParams(did: string, colors: any): FlowerParams {
  const rng = seededRandom(did);

  // Number of petals: 4-10 (increased range)
  const petalCount = Math.floor(rng() * 7) + 4;

  // Petal shape: expanded options
  const shapeIndex = Math.floor(rng() * 5);
  const petalShape = ['round', 'pointed', 'wavy', 'heart', 'tulip'][shapeIndex] as FlowerParams['petalShape'];

  // Petal size: 0.5 to 0.9 (relative to flower size)
  const petalSize = 0.5 + rng() * 0.4;

  // Initial rotation offset
  const petalRotation = rng() * 360;

  // Layer configuration (Proposal 1)
  const layerCount = Math.floor(rng() * 3) + 1; // 1-3 layers
  const layerRotationOffset = 15 + rng() * 30; // 15-45 degrees offset between layers
  const layerSizeDecay = 0.6 + rng() * 0.2; // Each inner layer is 60-80% of outer

  // Per-petal variation (Proposal 3)
  const petalSizeJitter = 0.1 + rng() * 0.15; // 10-25% size variation
  const petalAngleJitter = 3 + rng() * 7; // 3-10 degrees angle jitter
  const petalCurveJitter = 0.1 + rng() * 0.2; // 10-30% curve variation

  // Center style (Proposal 4)
  const centerStyleIndex = Math.floor(rng() * 5);
  const centerStyle = ['simple', 'stamen', 'spiral', 'dots', 'ring'][centerStyleIndex] as FlowerParams['centerStyle'];
  const centerSize = 0.12 + rng() * 0.12; // 12-24% of flower size
  const stamenCount = Math.floor(rng() * 8) + 5; // 5-12 stamens

  // 60% chance of stem
  const hasStem = rng() > 0.4;

  // 50% chance of leaves (only if stem exists)
  const hasLeaves = hasStem && rng() > 0.5;

  // Leaf style
  const leafStyleIndex = Math.floor(rng() * 3);
  const leafStyle = ['ellipse', 'pointed', 'serrated'][leafStyleIndex] as FlowerParams['leafStyle'];

  // Color variations
  const primaryColor = colors.primary || '#ff6b9d';
  const secondaryColor = colors.accent || colors.primary || '#ff9ecd';
  const centerColor = colors.text || colors.primary || '#4a4a4a';
  const stamenTipColor = colors.accent || adjustColor(primaryColor, 60);

  return {
    petalCount,
    petalShape,
    petalSize,
    petalRotation,
    layerCount,
    layerRotationOffset,
    layerSizeDecay,
    petalSizeJitter,
    petalAngleJitter,
    petalCurveJitter,
    centerStyle,
    centerSize,
    stamenCount,
    hasStem,
    hasLeaves,
    leafStyle,
    primaryColor,
    secondaryColor,
    centerColor,
    stamenTipColor
  };
}

/**
 * Generate SVG path for a petal based on shape with organic variation
 */
function generatePetalPath(
  shape: FlowerParams['petalShape'],
  baseSize: number,
  centerX: number,
  centerY: number,
  angle: number,
  sizeMultiplier: number,
  curveVariation: number
): string {
  const rad = (angle * Math.PI) / 180;
  const size = baseSize * sizeMultiplier;
  const petalLength = size * 40;
  const petalWidth = size * 20 * (1 + curveVariation * 0.3);

  // Calculate petal tip position
  const tipX = centerX + Math.cos(rad) * petalLength;
  const tipY = centerY + Math.sin(rad) * petalLength;

  // Calculate control points for curves
  const perpAngle = rad + Math.PI / 2;
  const controlOffset = petalWidth * 0.5 * (1 + curveVariation * 0.2);

  const leftControlX = centerX + Math.cos(perpAngle) * controlOffset;
  const leftControlY = centerY + Math.sin(perpAngle) * controlOffset;
  const rightControlX = centerX - Math.cos(perpAngle) * controlOffset;
  const rightControlY = centerY - Math.sin(perpAngle) * controlOffset;

  switch (shape) {
    case 'round': {
      // Rounded petal using quadratic curves
      const leftCurveX = tipX + Math.cos(perpAngle) * petalWidth * 0.3;
      const leftCurveY = tipY + Math.sin(perpAngle) * petalWidth * 0.3;
      const rightCurveX = tipX - Math.cos(perpAngle) * petalWidth * 0.3;
      const rightCurveY = tipY - Math.sin(perpAngle) * petalWidth * 0.3;

      return `M ${centerX} ${centerY} Q ${leftControlX} ${leftControlY} ${leftCurveX} ${leftCurveY} Q ${tipX} ${tipY} ${rightCurveX} ${rightCurveY} Q ${rightControlX} ${rightControlY} ${centerX} ${centerY} Z`;
    }

    case 'pointed': {
      // Pointed petal with elegant curves leading to sharp tip
      // Control points for smooth S-curve edges
      const bulgeFactor = petalWidth * 0.45;
      const bulgePoint = 0.4; // Where the petal is widest

      // Left edge curve points
      const leftBulgeX = centerX + Math.cos(rad) * petalLength * bulgePoint + Math.cos(perpAngle) * bulgeFactor;
      const leftBulgeY = centerY + Math.sin(rad) * petalLength * bulgePoint + Math.sin(perpAngle) * bulgeFactor;
      const leftNarrowX = centerX + Math.cos(rad) * petalLength * 0.75 + Math.cos(perpAngle) * bulgeFactor * 0.4;
      const leftNarrowY = centerY + Math.sin(rad) * petalLength * 0.75 + Math.sin(perpAngle) * bulgeFactor * 0.4;

      // Right edge curve points
      const rightBulgeX = centerX + Math.cos(rad) * petalLength * bulgePoint - Math.cos(perpAngle) * bulgeFactor;
      const rightBulgeY = centerY + Math.sin(rad) * petalLength * bulgePoint - Math.sin(perpAngle) * bulgeFactor;
      const rightNarrowX = centerX + Math.cos(rad) * petalLength * 0.75 - Math.cos(perpAngle) * bulgeFactor * 0.4;
      const rightNarrowY = centerY + Math.sin(rad) * petalLength * 0.75 - Math.sin(perpAngle) * bulgeFactor * 0.4;

      // Use cubic bezier for smooth organic curves
      return `M ${centerX} ${centerY} C ${leftControlX} ${leftControlY} ${leftBulgeX} ${leftBulgeY} ${leftNarrowX} ${leftNarrowY} Q ${tipX} ${tipY} ${rightNarrowX} ${rightNarrowY} C ${rightBulgeX} ${rightBulgeY} ${rightControlX} ${rightControlY} ${centerX} ${centerY} Z`;
    }

    case 'wavy': {
      // Wavy petal with curved edges
      const wave1X = centerX + Math.cos(rad) * petalLength * 0.3 + Math.cos(perpAngle) * petalWidth * 0.5;
      const wave1Y = centerY + Math.sin(rad) * petalLength * 0.3 + Math.sin(perpAngle) * petalWidth * 0.5;
      const wave2X = centerX + Math.cos(rad) * petalLength * 0.6 + Math.cos(perpAngle) * petalWidth * 0.3;
      const wave2Y = centerY + Math.sin(rad) * petalLength * 0.6 + Math.sin(perpAngle) * petalWidth * 0.3;
      const wave3X = centerX + Math.cos(rad) * petalLength * 0.6 - Math.cos(perpAngle) * petalWidth * 0.3;
      const wave3Y = centerY + Math.sin(rad) * petalLength * 0.6 - Math.sin(perpAngle) * petalWidth * 0.3;
      const wave4X = centerX + Math.cos(rad) * petalLength * 0.3 - Math.cos(perpAngle) * petalWidth * 0.5;
      const wave4Y = centerY + Math.sin(rad) * petalLength * 0.3 - Math.sin(perpAngle) * petalWidth * 0.5;

      return `M ${centerX} ${centerY} Q ${leftControlX} ${leftControlY} ${wave1X} ${wave1Y} Q ${wave2X} ${wave2Y} ${tipX} ${tipY} Q ${wave3X} ${wave3Y} ${wave4X} ${wave4Y} Q ${rightControlX} ${rightControlY} ${centerX} ${centerY} Z`;
    }

    case 'heart': {
      // Heart-shaped petal with notch at tip
      const notchDepth = petalLength * 0.15;
      const lobeWidth = petalWidth * 0.6;

      // Left lobe
      const leftLobeX = tipX + Math.cos(perpAngle) * lobeWidth - Math.cos(rad) * notchDepth * 0.5;
      const leftLobeY = tipY + Math.sin(perpAngle) * lobeWidth - Math.sin(rad) * notchDepth * 0.5;
      // Right lobe
      const rightLobeX = tipX - Math.cos(perpAngle) * lobeWidth - Math.cos(rad) * notchDepth * 0.5;
      const rightLobeY = tipY - Math.sin(perpAngle) * lobeWidth - Math.sin(rad) * notchDepth * 0.5;
      // Notch point
      const notchX = tipX - Math.cos(rad) * notchDepth;
      const notchY = tipY - Math.sin(rad) * notchDepth;

      return `M ${centerX} ${centerY} Q ${leftControlX} ${leftControlY} ${leftLobeX} ${leftLobeY} Q ${tipX} ${tipY} ${notchX} ${notchY} Q ${tipX} ${tipY} ${rightLobeX} ${rightLobeY} Q ${rightControlX} ${rightControlY} ${centerX} ${centerY} Z`;
    }

    case 'tulip': {
      // Tulip-shaped petal - cupped shape, narrow base widening to rounded top
      const cupWidth = petalWidth * 0.7;
      const cupPoint = petalLength * 0.6;

      // Control points for the cup shape - smooth S-curves
      const leftCupX = centerX + Math.cos(rad) * cupPoint + Math.cos(perpAngle) * cupWidth;
      const leftCupY = centerY + Math.sin(rad) * cupPoint + Math.sin(perpAngle) * cupWidth;
      const rightCupX = centerX + Math.cos(rad) * cupPoint - Math.cos(perpAngle) * cupWidth;
      const rightCupY = centerY + Math.sin(rad) * cupPoint - Math.sin(perpAngle) * cupWidth;

      // Rounded top edge
      const tipLeftX = tipX + Math.cos(perpAngle) * cupWidth * 0.5;
      const tipLeftY = tipY + Math.sin(perpAngle) * cupWidth * 0.5;
      const tipRightX = tipX - Math.cos(perpAngle) * cupWidth * 0.5;
      const tipRightY = tipY - Math.sin(perpAngle) * cupWidth * 0.5;

      // Smooth cubic bezier for elegant tulip shape
      return `M ${centerX} ${centerY} C ${leftControlX * 0.2 + centerX * 0.8} ${leftControlY * 0.2 + centerY * 0.8} ${leftCupX} ${leftCupY} ${tipLeftX} ${tipLeftY} Q ${tipX} ${tipY} ${tipRightX} ${tipRightY} C ${rightCupX} ${rightCupY} ${rightControlX * 0.2 + centerX * 0.8} ${rightControlY * 0.2 + centerY * 0.8} ${centerX} ${centerY} Z`;
    }
  }
}

/**
 * Generate detailed center based on style (Proposal 4)
 */
function generateCenter(
  style: FlowerParams['centerStyle'],
  centerX: number,
  centerY: number,
  size: number,
  stamenCount: number,
  centerColor: string,
  stamenTipColor: string,
  rng: () => number
): string[] {
  const elements: string[] = [];
  const radius = size * 0.4;

  switch (style) {
    case 'simple': {
      // Basic circle
      elements.push(`<circle cx="${centerX}" cy="${centerY}" r="${radius * 0.6}" fill="${centerColor}" />`);
      break;
    }

    case 'stamen': {
      // Radiating stamens with dots at tips
      const innerRadius = radius * 0.3;
      const outerRadius = radius * 1.2;

      // Central disc
      elements.push(`<circle cx="${centerX}" cy="${centerY}" r="${innerRadius}" fill="${centerColor}" />`);

      // Stamens
      for (let i = 0; i < stamenCount; i++) {
        const angle = (i / stamenCount) * Math.PI * 2 + rng() * 0.2;
        const stamenLength = outerRadius * (0.7 + rng() * 0.3);
        const tipX = centerX + Math.cos(angle) * stamenLength;
        const tipY = centerY + Math.sin(angle) * stamenLength;
        const startX = centerX + Math.cos(angle) * innerRadius;
        const startY = centerY + Math.sin(angle) * innerRadius;

        // Stamen line
        elements.push(`<line x1="${startX}" y1="${startY}" x2="${tipX}" y2="${tipY}" stroke="${centerColor}" stroke-width="0.8" />`);
        // Anther (tip)
        const antherSize = 1.5 + rng() * 1;
        elements.push(`<circle cx="${tipX}" cy="${tipY}" r="${antherSize}" fill="${stamenTipColor}" />`);
      }
      break;
    }

    case 'spiral': {
      // Fibonacci spiral pattern (sunflower-like)
      const goldenAngle = Math.PI * (3 - Math.sqrt(5)); // ~137.5 degrees
      const dotCount = Math.floor(20 + rng() * 15);

      for (let i = 0; i < dotCount; i++) {
        const angle = i * goldenAngle;
        const r = radius * 0.9 * Math.sqrt(i / dotCount);
        const x = centerX + Math.cos(angle) * r;
        const y = centerY + Math.sin(angle) * r;
        const dotSize = 0.8 + (1 - i / dotCount) * 1.5;
        const color = i % 3 === 0 ? stamenTipColor : centerColor;
        elements.push(`<circle cx="${x}" cy="${y}" r="${dotSize}" fill="${color}" />`);
      }
      break;
    }

    case 'dots': {
      // Scattered dots with size variation
      const dotCount = Math.floor(8 + rng() * 10);

      // Background disc
      elements.push(`<circle cx="${centerX}" cy="${centerY}" r="${radius * 0.8}" fill="${adjustColor(centerColor, 40)}" />`);

      for (let i = 0; i < dotCount; i++) {
        const angle = rng() * Math.PI * 2;
        const distance = rng() * radius * 0.6;
        const x = centerX + Math.cos(angle) * distance;
        const y = centerY + Math.sin(angle) * distance;
        const dotSize = 1 + rng() * 2;
        const color = rng() > 0.5 ? centerColor : stamenTipColor;
        elements.push(`<circle cx="${x}" cy="${y}" r="${dotSize}" fill="${color}" />`);
      }
      break;
    }

    case 'ring': {
      // Concentric rings
      const ringCount = 2 + Math.floor(rng() * 2);
      for (let i = ringCount; i >= 0; i--) {
        const ringRadius = radius * 0.9 * ((i + 1) / (ringCount + 1));
        const color = i % 2 === 0 ? centerColor : stamenTipColor;
        elements.push(`<circle cx="${centerX}" cy="${centerY}" r="${ringRadius}" fill="${color}" />`);
      }
      break;
    }
  }

  return elements;
}

/**
 * Generate leaf SVG based on style
 * Leaves grow FROM the attachment point (x,y) OUTWARD in the rotation direction
 */
function generateLeaf(
  style: FlowerParams['leafStyle'],
  x: number,
  y: number,
  size: number,
  rotation: number,
  color: string
): string {
  const rad = (rotation * Math.PI) / 180;
  const perpRad = rad + Math.PI / 2;

  // Tip of the leaf (grows outward from attachment point)
  const tipX = x + Math.cos(rad) * size;
  const tipY = y + Math.sin(rad) * size;

  switch (style) {
    case 'ellipse': {
      // Teardrop shape - wider near base, pointed at tip
      const width = size * 0.4;
      const bulgePoint = 0.35; // Where leaf is widest

      const bulgeX = x + Math.cos(rad) * size * bulgePoint;
      const bulgeY = y + Math.sin(rad) * size * bulgePoint;
      const leftBulgeX = bulgeX + Math.cos(perpRad) * width;
      const leftBulgeY = bulgeY + Math.sin(perpRad) * width;
      const rightBulgeX = bulgeX - Math.cos(perpRad) * width;
      const rightBulgeY = bulgeY - Math.sin(perpRad) * width;

      return `<path d="M ${x} ${y} Q ${leftBulgeX} ${leftBulgeY} ${tipX} ${tipY} Q ${rightBulgeX} ${rightBulgeY} ${x} ${y} Z" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
    }

    case 'pointed': {
      // More elongated pointed leaf with smooth curves
      const width = size * 0.3;
      const bulgePoint = 0.3;

      const bulgeX = x + Math.cos(rad) * size * bulgePoint;
      const bulgeY = y + Math.sin(rad) * size * bulgePoint;
      const leftCtrlX = bulgeX + Math.cos(perpRad) * width;
      const leftCtrlY = bulgeY + Math.sin(perpRad) * width;
      const rightCtrlX = bulgeX - Math.cos(perpRad) * width;
      const rightCtrlY = bulgeY - Math.sin(perpRad) * width;

      // Midpoint controls for S-curve
      const midX = x + Math.cos(rad) * size * 0.65;
      const midY = y + Math.sin(rad) * size * 0.65;
      const leftMidX = midX + Math.cos(perpRad) * width * 0.5;
      const leftMidY = midY + Math.sin(perpRad) * width * 0.5;
      const rightMidX = midX - Math.cos(perpRad) * width * 0.5;
      const rightMidY = midY - Math.sin(perpRad) * width * 0.5;

      return `<path d="M ${x} ${y} C ${leftCtrlX} ${leftCtrlY} ${leftMidX} ${leftMidY} ${tipX} ${tipY} C ${rightMidX} ${rightMidY} ${rightCtrlX} ${rightCtrlY} ${x} ${y} Z" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
    }

    case 'serrated': {
      // Serrated leaf with curved base and wavy edges using smooth curves
      const width = size * 0.35;

      // Build path with smooth curves - simpler approach
      const bulgePoint = 0.35;
      const bulgeX = x + Math.cos(rad) * size * bulgePoint;
      const bulgeY = y + Math.sin(rad) * size * bulgePoint;

      // Wider at bulge, narrower toward tip
      const leftBulgeX = bulgeX + Math.cos(perpRad) * width;
      const leftBulgeY = bulgeY + Math.sin(perpRad) * width;
      const rightBulgeX = bulgeX - Math.cos(perpRad) * width;
      const rightBulgeY = bulgeY - Math.sin(perpRad) * width;

      // Mid-leaf points with slight wave
      const midPoint = 0.65;
      const midX = x + Math.cos(rad) * size * midPoint;
      const midY = y + Math.sin(rad) * size * midPoint;
      const leftMidX = midX + Math.cos(perpRad) * width * 0.6;
      const leftMidY = midY + Math.sin(perpRad) * width * 0.6;
      const rightMidX = midX - Math.cos(perpRad) * width * 0.6;
      const rightMidY = midY - Math.sin(perpRad) * width * 0.6;

      return `<path d="M ${x} ${y} Q ${leftBulgeX} ${leftBulgeY} ${leftMidX} ${leftMidY} Q ${tipX + Math.cos(perpRad) * width * 0.2} ${tipY + Math.sin(perpRad) * width * 0.2} ${tipX} ${tipY} Q ${tipX - Math.cos(perpRad) * width * 0.2} ${tipY - Math.sin(perpRad) * width * 0.2} ${rightMidX} ${rightMidY} Q ${rightBulgeX} ${rightBulgeY} ${x} ${y} Z" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />`;
    }
  }
}

/**
 * Generate flower SVG from parameters with layering and variation
 */
function generateFlowerSVG(params: FlowerParams, size: number = 100, rng: () => number): string {
  const centerX = size / 2;
  const centerY = size / 2;
  const flowerRadius = size * 0.4;

  let svgElements: string[] = [];

  // Generate layered petals (Proposal 1) - outer layers first
  for (let layer = 0; layer < params.layerCount; layer++) {
    const layerScale = Math.pow(params.layerSizeDecay, layer);
    const layerRotation = params.petalRotation + layer * params.layerRotationOffset;
    const layerPetalCount = params.petalCount - layer; // Fewer petals in inner layers

    // Color variation per layer - inner layers slightly lighter
    const layerColorAdjust = layer * 25;
    const layerPrimaryColor = adjustColor(params.primaryColor, layerColorAdjust);
    const layerSecondaryColor = adjustColor(params.secondaryColor, layerColorAdjust);

    const angleStep = 360 / Math.max(layerPetalCount, 3);

    for (let i = 0; i < layerPetalCount; i++) {
      // Apply per-petal variation (Proposal 3)
      const sizeMultiplier = 1 + (rng() - 0.5) * 2 * params.petalSizeJitter;
      const angleJitter = (rng() - 0.5) * 2 * params.petalAngleJitter;
      const curveVariation = (rng() - 0.5) * 2 * params.petalCurveJitter;

      const angle = layerRotation + i * angleStep + angleJitter;
      const petalPath = generatePetalPath(
        params.petalShape,
        params.petalSize * layerScale,
        centerX,
        centerY,
        angle,
        sizeMultiplier,
        curveVariation
      );

      // Alternate colors for visual interest
      const strokeColor = i % 2 === 0 ? layerPrimaryColor : layerSecondaryColor;
      svgElements.push(`<path d="${petalPath}" fill="none" stroke="${strokeColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" opacity="${1 - layer * 0.1}" />`);
    }
  }

  // Add detailed center (Proposal 4)
  const centerElements = generateCenter(
    params.centerStyle,
    centerX,
    centerY,
    flowerRadius * params.centerSize * 5,
    params.stamenCount,
    params.centerColor,
    params.stamenTipColor,
    rng
  );
  svgElements.push(...centerElements);

  // Add stem if needed - stem connects directly to flower center where petals radiate from
  if (params.hasStem) {
    const stemHeight = size * 0.35; // Longer stem to extend from center to bottom
    const stemWidth = size * 0.025;
    const stemColor = adjustColor(params.secondaryColor, -40);

    // Stem starts at flower center and extends downward
    const stemStartY = centerY;
    const stemEndY = centerY + stemHeight;

    // Slightly curved stem
    const stemCurve = (rng() - 0.5) * 4;
    svgElements.unshift(`<path d="M ${centerX} ${stemStartY} Q ${centerX + stemCurve} ${stemStartY + stemHeight * 0.5} ${centerX} ${stemEndY}" stroke="${stemColor}" stroke-width="${stemWidth}" fill="none" stroke-linecap="round" />`);

    // Add leaves if needed - positioned along the stem
    if (params.hasLeaves) {
      const leafSize = size * 0.1;
      const leafColor = adjustColor(params.secondaryColor, -30);

      // Left leaf - attached at stem, grows outward
      const leftLeafY = stemStartY + stemHeight * 0.4;
      svgElements.unshift(generateLeaf(params.leafStyle, centerX, leftLeafY, leafSize, -50, leafColor));

      // Right leaf (sometimes) - attached at stem, grows outward
      if (rng() > 0.3) {
        const rightLeafY = stemStartY + stemHeight * 0.6;
        svgElements.unshift(generateLeaf(params.leafStyle, centerX, rightLeafY, leafSize * 0.85, 50, leafColor));
      }
    }
  }

  return svgElements.join('\n        ');
}

class DidVisualization extends HTMLElement {
  private did: string | null = null;
  private displaySize: number = 100;

  static get observedAttributes() {
    return ['did', 'show-info', 'size'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue !== newValue) {
      if (name === 'did') {
        this.did = newValue;
      } else if (name === 'size') {
        this.displaySize = parseInt(newValue, 10) || 100;
      }
      this.render();
    }
  }

  connectedCallback() {
    const sizeAttr = this.getAttribute('size');
    if (sizeAttr) {
      this.displaySize = parseInt(sizeAttr, 10) || 100;
    }
    this.render();
  }

  render() {
    if (!this.did) {
      this.innerHTML = '<p>No DID provided</p>';
      return;
    }

    // Use the shared flower generation function
    const svgString = generateFlowerSVGString(this.did, this.displaySize);

    const showInfo = this.hasAttribute('show-info');

    this.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 0.5rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem; position: relative;">
          ${svgString}
          ${showInfo ? `
          <button class="did-info-button" aria-label="Information about DID visualization" title="Information about this flower">
            ?
          </button>
          <div class="did-info-tooltip" role="tooltip">
            This flower is generated from your DID—a unique cryptographic identifier. It's your visual signature in the garden network.
          </div>
          ` : ''}
        </div>
      </div>
    `;

    if (showInfo) {
      this.attachTooltipListeners();
    }
  }

  private stringToHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  private attachTooltipListeners() {
    const infoButton = this.querySelector('.did-info-button') as HTMLElement;
    const tooltip = this.querySelector('.did-info-tooltip') as HTMLElement;

    if (!infoButton || !tooltip) return;

    // Show tooltip on hover or click
    const showTooltip = () => {
      tooltip.style.display = 'block';
    };

    const hideTooltip = () => {
      tooltip.style.display = 'none';
    };

    infoButton.addEventListener('mouseenter', showTooltip);
    infoButton.addEventListener('mouseleave', hideTooltip);
    infoButton.addEventListener('click', (e) => {
      e.stopPropagation();
      if (tooltip.style.display === 'block') {
        hideTooltip();
      } else {
        showTooltip();
      }
    });

    // Hide tooltip when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.contains(e.target as Node)) {
        hideTooltip();
      }
    });
  }
}

customElements.define('did-visualization', DidVisualization);
