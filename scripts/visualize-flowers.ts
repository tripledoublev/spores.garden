/**
 * Flower Grid Visualization Script
 *
 * Generates flower visualizations as PNG images.
 *
 * Usage: 
 *   npx tsx scripts/visualize-flowers.ts <count>           # Generate <count> grids of 256 flowers
 *   npx tsx scripts/visualize-flowers.ts <did>             # Generate single flower from specific DID
 */

import sharp from 'sharp';
import { generateFlowerSVGString } from '../src/utils/flower-svg';

const GRID_SIZE = 16;
const TOTAL_FLOWERS = GRID_SIZE * GRID_SIZE; // 256
const OUTPUT_SIZE = 2000;
const CELL_SIZE = OUTPUT_SIZE / GRID_SIZE; // 125
const FLOWER_SIZE = 100; // viewBox size of each flower

/**
 * Generate unique seed DIDs for diverse flowers
 */
function generateSeeds(count: number, gridIndex: number): string[] {
  const seeds: string[] = [];
  const timestamp = Date.now();
  for (let i = 0; i < count; i++) {
    // Use varied seed patterns for maximum diversity
    seeds.push(`did:plc:flower-grid-${gridIndex}-${i}-${timestamp}`);
  }
  return seeds;
}

/**
 * Extract inner SVG content (without wrapper) from a flower SVG string
 */
function extractSVGContent(svgString: string): string {
  // Match content between <svg ...> and </svg>
  const match = svgString.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
  return match ? match[1].trim() : '';
}

/**
 * Build a combined SVG with all flowers arranged in a grid
 */
function buildGridSVG(seeds: string[]): string {
  const flowerGroups: string[] = [];

  for (let i = 0; i < seeds.length; i++) {
    const row = Math.floor(i / GRID_SIZE);
    const col = i % GRID_SIZE;

    // Calculate position in output coordinates
    const x = col * CELL_SIZE + (CELL_SIZE - FLOWER_SIZE) / 2;
    const y = row * CELL_SIZE + (CELL_SIZE - FLOWER_SIZE) / 2;

    // Generate flower SVG and extract its content
    const flowerSVG = generateFlowerSVGString(seeds[i], FLOWER_SIZE);
    const innerContent = extractSVGContent(flowerSVG);

    // Wrap in a group with translation
    flowerGroups.push(`
    <g transform="translate(${x}, ${y})">
      ${innerContent}
    </g>`);
  }

  // Build the final SVG
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${OUTPUT_SIZE}" height="${OUTPUT_SIZE}" viewBox="0 0 ${OUTPUT_SIZE} ${OUTPUT_SIZE}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#f8f8f8"/>
  ${flowerGroups.join('\n')}
</svg>`;
}

async function generateGrid(gridIndex: number): Promise<string> {
  // Generate unique seeds for this grid
  const seeds = generateSeeds(TOTAL_FLOWERS, gridIndex);

  // Build combined SVG
  const gridSVG = buildGridSVG(seeds);

  // Convert to PNG using sharp
  const outputPath = `flower-grid-${gridIndex + 1}.png`;

  await sharp(Buffer.from(gridSVG))
    .resize(OUTPUT_SIZE, OUTPUT_SIZE)
    .png()
    .toFile(outputPath);

  return outputPath;
}

async function generateSingleFlower(did: string): Promise<string> {
  const flowerSize = 500;
  const flowerSVG = generateFlowerSVGString(did, flowerSize);

  // Create output filename from DID (sanitize for filesystem)
  const sanitizedDid = did.replace(/:/g, '-');
  const outputPath = `flower-${sanitizedDid}.png`;

  await sharp(Buffer.from(flowerSVG))
    .resize(flowerSize, flowerSize)
    .png()
    .toFile(outputPath);

  return outputPath;
}

async function main() {
  const firstArg = process.argv[2];

  // Check if first argument is a DID
  if (firstArg && firstArg.startsWith('did:')) {
    console.log(`Generating single flower for DID: ${firstArg}...`);
    const outputPath = await generateSingleFlower(firstArg);
    console.log(`Saved to ${outputPath}`);
    console.log('\nDone!');
    return;
  }

  // Otherwise, generate grids
  const count = parseInt(firstArg || '1', 10);

  console.log(`Generating ${count} grid(s), each with ${TOTAL_FLOWERS} flowers (${GRID_SIZE}x${GRID_SIZE})...`);

  for (let i = 0; i < count; i++) {
    console.log(`\nGenerating grid ${i + 1}/${count}...`);
    const outputPath = await generateGrid(i);
    console.log(`Saved to ${outputPath}`);
  }

  console.log('\nDone!');
}

main().catch(console.error);
