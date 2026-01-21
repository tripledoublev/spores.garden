/**
 * Shared flower SVG generation logic.
 * This is extracted from did-visualization.ts to be reusable for social cards.
 */

import { generateThemeFromDid } from '../themes/engine';

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
  
  return function() {
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
  
  // Layering
  layerCount: number;
  layerRotationOffset: number;
  layerSizeDecay: number;
  
  // Per-petal variation
  petalSizeJitter: number;
  petalAngleJitter: number;
  petalCurveJitter: number;
  
  // Center style
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
  
  // Layer configuration
  const layerCount = Math.floor(rng() * 3) + 1; // 1-3 layers
  const layerRotationOffset = 15 + rng() * 30; // 15-45 degrees offset between layers
  const layerSizeDecay = 0.6 + rng() * 0.2; // Each inner layer is 60-80% of outer
  
  // Per-petal variation
  const petalSizeJitter = 0.1 + rng() * 0.15; // 10-25% size variation
  const petalAngleJitter = 3 + rng() * 7; // 3-10 degrees angle jitter
  const petalCurveJitter = 0.1 + rng() * 0.2; // 10-30% curve variation
  
  // Center style
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
      const bulgeFactor = petalWidth * 0.45;
      const bulgePoint = 0.4;
      
      const leftBulgeX = centerX + Math.cos(rad) * petalLength * bulgePoint + Math.cos(perpAngle) * bulgeFactor;
      const leftBulgeY = centerY + Math.sin(rad) * petalLength * bulgePoint + Math.sin(perpAngle) * bulgeFactor;
      const leftNarrowX = centerX + Math.cos(rad) * petalLength * 0.75 + Math.cos(perpAngle) * bulgeFactor * 0.4;
      const leftNarrowY = centerY + Math.sin(rad) * petalLength * 0.75 + Math.sin(perpAngle) * bulgeFactor * 0.4;
      
      const rightBulgeX = centerX + Math.cos(rad) * petalLength * bulgePoint - Math.cos(perpAngle) * bulgeFactor;
      const rightBulgeY = centerY + Math.sin(rad) * petalLength * bulgePoint - Math.sin(perpAngle) * bulgeFactor;
      const rightNarrowX = centerX + Math.cos(rad) * petalLength * 0.75 - Math.cos(perpAngle) * bulgeFactor * 0.4;
      const rightNarrowY = centerY + Math.sin(rad) * petalLength * 0.75 - Math.sin(perpAngle) * bulgeFactor * 0.4;
      
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
      
      const leftLobeX = tipX + Math.cos(perpAngle) * lobeWidth - Math.cos(rad) * notchDepth * 0.5;
      const leftLobeY = tipY + Math.sin(perpAngle) * lobeWidth - Math.sin(rad) * notchDepth * 0.5;
      const rightLobeX = tipX - Math.cos(perpAngle) * lobeWidth - Math.cos(rad) * notchDepth * 0.5;
      const rightLobeY = tipY - Math.sin(perpAngle) * lobeWidth - Math.sin(rad) * notchDepth * 0.5;
      const notchX = tipX - Math.cos(rad) * notchDepth;
      const notchY = tipY - Math.sin(rad) * notchDepth;
      
      return `M ${centerX} ${centerY} Q ${leftControlX} ${leftControlY} ${leftLobeX} ${leftLobeY} Q ${tipX} ${tipY} ${notchX} ${notchY} Q ${tipX} ${tipY} ${rightLobeX} ${rightLobeY} Q ${rightControlX} ${rightControlY} ${centerX} ${centerY} Z`;
    }
    
    case 'tulip': {
      // Tulip-shaped petal - cupped shape
      const cupWidth = petalWidth * 0.7;
      const cupPoint = petalLength * 0.6;
      
      const leftCupX = centerX + Math.cos(rad) * cupPoint + Math.cos(perpAngle) * cupWidth;
      const leftCupY = centerY + Math.sin(rad) * cupPoint + Math.sin(perpAngle) * cupWidth;
      const rightCupX = centerX + Math.cos(rad) * cupPoint - Math.cos(perpAngle) * cupWidth;
      const rightCupY = centerY + Math.sin(rad) * cupPoint - Math.sin(perpAngle) * cupWidth;
      
      const tipLeftX = tipX + Math.cos(perpAngle) * cupWidth * 0.5;
      const tipLeftY = tipY + Math.sin(perpAngle) * cupWidth * 0.5;
      const tipRightX = tipX - Math.cos(perpAngle) * cupWidth * 0.5;
      const tipRightY = tipY - Math.sin(perpAngle) * cupWidth * 0.5;
      
      return `M ${centerX} ${centerY} C ${leftControlX * 0.2 + centerX * 0.8} ${leftControlY * 0.2 + centerY * 0.8} ${leftCupX} ${leftCupY} ${tipLeftX} ${tipLeftY} Q ${tipX} ${tipY} ${tipRightX} ${tipRightY} C ${rightCupX} ${rightCupY} ${rightControlX * 0.2 + centerX * 0.8} ${rightControlY * 0.2 + centerY * 0.8} ${centerX} ${centerY} Z`;
    }
  }
}

/**
 * Generate detailed center based on style
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
      elements.push(`<circle cx="${centerX}" cy="${centerY}" r="${radius * 0.6}" fill="${centerColor}" />`);
      break;
    }
    
    case 'stamen': {
      const innerRadius = radius * 0.3;
      const outerRadius = radius * 1.2;
      
      elements.push(`<circle cx="${centerX}" cy="${centerY}" r="${innerRadius}" fill="${centerColor}" />`);
      
      for (let i = 0; i < stamenCount; i++) {
        const angle = (i / stamenCount) * Math.PI * 2 + rng() * 0.2;
        const stamenLength = outerRadius * (0.7 + rng() * 0.3);
        const tipX = centerX + Math.cos(angle) * stamenLength;
        const tipY = centerY + Math.sin(angle) * stamenLength;
        const startX = centerX + Math.cos(angle) * innerRadius;
        const startY = centerY + Math.sin(angle) * innerRadius;
        
        elements.push(`<line x1="${startX}" y1="${startY}" x2="${tipX}" y2="${tipY}" stroke="${centerColor}" stroke-width="0.8" />`);
        const antherSize = 1.5 + rng() * 1;
        elements.push(`<circle cx="${tipX}" cy="${tipY}" r="${antherSize}" fill="${stamenTipColor}" />`);
      }
      break;
    }
    
    case 'spiral': {
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
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
      const dotCount = Math.floor(8 + rng() * 10);
      
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
  
  const tipX = x + Math.cos(rad) * size;
  const tipY = y + Math.sin(rad) * size;
  
  switch (style) {
    case 'ellipse': {
      const width = size * 0.4;
      const bulgePoint = 0.35;
      
      const bulgeX = x + Math.cos(rad) * size * bulgePoint;
      const bulgeY = y + Math.sin(rad) * size * bulgePoint;
      const leftBulgeX = bulgeX + Math.cos(perpRad) * width;
      const leftBulgeY = bulgeY + Math.sin(perpRad) * width;
      const rightBulgeX = bulgeX - Math.cos(perpRad) * width;
      const rightBulgeY = bulgeY - Math.sin(perpRad) * width;
      
      return `<path d="M ${x} ${y} Q ${leftBulgeX} ${leftBulgeY} ${tipX} ${tipY} Q ${rightBulgeX} ${rightBulgeY} ${x} ${y} Z" fill="${color}" />`;
    }
    
    case 'pointed': {
      const width = size * 0.3;
      const bulgePoint = 0.3;
      
      const bulgeX = x + Math.cos(rad) * size * bulgePoint;
      const bulgeY = y + Math.sin(rad) * size * bulgePoint;
      const leftCtrlX = bulgeX + Math.cos(perpRad) * width;
      const leftCtrlY = bulgeY + Math.sin(perpRad) * width;
      const rightCtrlX = bulgeX - Math.cos(perpRad) * width;
      const rightCtrlY = bulgeY - Math.sin(perpRad) * width;
      
      const midX = x + Math.cos(rad) * size * 0.65;
      const midY = y + Math.sin(rad) * size * 0.65;
      const leftMidX = midX + Math.cos(perpRad) * width * 0.5;
      const leftMidY = midY + Math.sin(perpRad) * width * 0.5;
      const rightMidX = midX - Math.cos(perpRad) * width * 0.5;
      const rightMidY = midY - Math.sin(perpRad) * width * 0.5;
      
      return `<path d="M ${x} ${y} C ${leftCtrlX} ${leftCtrlY} ${leftMidX} ${leftMidY} ${tipX} ${tipY} C ${rightMidX} ${rightMidY} ${rightCtrlX} ${rightCtrlY} ${x} ${y} Z" fill="${color}" />`;
    }
    
    case 'serrated': {
      const width = size * 0.35;
      const bulgePoint = 0.35;
      const bulgeX = x + Math.cos(rad) * size * bulgePoint;
      const bulgeY = y + Math.sin(rad) * size * bulgePoint;
      
      const leftBulgeX = bulgeX + Math.cos(perpRad) * width;
      const leftBulgeY = bulgeY + Math.sin(perpRad) * width;
      const rightBulgeX = bulgeX - Math.cos(perpRad) * width;
      const rightBulgeY = bulgeY - Math.sin(perpRad) * width;
      
      const midPoint = 0.65;
      const midX = x + Math.cos(rad) * size * midPoint;
      const midY = y + Math.sin(rad) * size * midPoint;
      const leftMidX = midX + Math.cos(perpRad) * width * 0.6;
      const leftMidY = midY + Math.sin(perpRad) * width * 0.6;
      const rightMidX = midX - Math.cos(perpRad) * width * 0.6;
      const rightMidY = midY - Math.sin(perpRad) * width * 0.6;
      
      return `<path d="M ${x} ${y} Q ${leftBulgeX} ${leftBulgeY} ${leftMidX} ${leftMidY} Q ${tipX + Math.cos(perpRad) * width * 0.2} ${tipY + Math.sin(perpRad) * width * 0.2} ${tipX} ${tipY} Q ${tipX - Math.cos(perpRad) * width * 0.2} ${tipY - Math.sin(perpRad) * width * 0.2} ${rightMidX} ${rightMidY} Q ${rightBulgeX} ${rightBulgeY} ${x} ${y} Z" fill="${color}" />`;
    }
  }
}

/**
 * Generate flower SVG from parameters with layering and variation
 */
function generateFlowerSVG(params: FlowerParams, size: number, rng: () => number): string {
  const centerX = size / 2;
  const centerY = size / 2;
  const flowerRadius = size * 0.4;
  
  let svgElements: string[] = [];
  
  // Generate layered petals - outer layers first
  for (let layer = 0; layer < params.layerCount; layer++) {
    const layerScale = Math.pow(params.layerSizeDecay, layer);
    const layerRotation = params.petalRotation + layer * params.layerRotationOffset;
    const layerPetalCount = params.petalCount - layer;
    
    const layerColorAdjust = layer * 25;
    const layerPrimaryColor = adjustColor(params.primaryColor, layerColorAdjust);
    const layerSecondaryColor = adjustColor(params.secondaryColor, layerColorAdjust);
    
    const angleStep = 360 / Math.max(layerPetalCount, 3);
    
    for (let i = 0; i < layerPetalCount; i++) {
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
      
      const petalColor = i % 2 === 0 ? layerPrimaryColor : layerSecondaryColor;
      const strokeColor = adjustColor(params.centerColor, -20);
      svgElements.push(`<path d="${petalPath}" fill="${petalColor}" stroke="${strokeColor}" stroke-width="0.3" opacity="${1 - layer * 0.1}" />`);
    }
  }
  
  // Add detailed center
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
  
  // Add stem if needed
  if (params.hasStem) {
    const stemY = centerY + flowerRadius * 0.8;
    const stemHeight = size * 0.18;
    const stemWidth = size * 0.025;
    const stemColor = adjustColor(params.secondaryColor, -40);
    
    const stemCurve = (rng() - 0.5) * 4;
    svgElements.push(`<path d="M ${centerX} ${stemY} Q ${centerX + stemCurve} ${stemY + stemHeight * 0.5} ${centerX} ${stemY + stemHeight}" stroke="${stemColor}" stroke-width="${stemWidth}" fill="none" stroke-linecap="round" />`);
    
    if (params.hasLeaves) {
      const leafSize = size * 0.1;
      const leafColor = adjustColor(params.secondaryColor, -30);
      
      const leftLeafY = stemY + stemHeight * 0.35;
      svgElements.push(generateLeaf(params.leafStyle, centerX, leftLeafY, leafSize, -50, leafColor));
      
      if (rng() > 0.3) {
        const rightLeafY = stemY + stemHeight * 0.55;
        svgElements.push(generateLeaf(params.leafStyle, centerX, rightLeafY, leafSize * 0.85, 50, leafColor));
      }
    }
  }
  
  return svgElements.join('\n        ');
}

/**
 * Generate a complete SVG string for a flower based on a DID.
 * This produces the same flower as did-visualization.ts.
 */
export function generateFlowerSVGString(did: string, displaySize: number = 100): string {
  // Generate theme from DID to get colors
  const { theme } = generateThemeFromDid(did);
  const { colors } = theme;

  // Generate flower parameters from DID
  const flowerParams = generateFlowerParams(did, colors);
  
  // Create a fresh RNG for SVG generation (separate from param generation)
  const svgRng = seededRandom(did + '-svg');
  
  // Generate flower SVG
  const svgSize = 100;
  const flowerSVG = generateFlowerSVG(flowerParams, svgSize, svgRng);
  
  return `<svg width="${displaySize}" height="${displaySize}" viewBox="0 0 ${svgSize} ${svgSize}" xmlns="http://www.w3.org/2000/svg">
    ${flowerSVG}
  </svg>`;
}
