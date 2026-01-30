/**
 * Marching Squares Algorithm for Contour Extraction
 *
 * Converts a 2D scalar field (noise grid) into SVG path data
 * representing contour lines at specified threshold levels.
 */

export interface ContourPath {
  d: string;           // SVG path data (all chains, for strokes)
  dClosed?: string;    // Closed chains only (for fills); avoids straight-edge artifacts
  threshold: number;   // Contour level (0-1)
}

interface Point {
  x: number;
  y: number;
}

/**
 * Linear interpolation to find contour crossing point
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Find the interpolated point where the contour crosses between two values
 */
function interpolate(
  p1: Point,
  p2: Point,
  v1: number,
  v2: number,
  threshold: number
): Point {
  if (Math.abs(v1 - v2) < 0.0001) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  }
  const t = (threshold - v1) / (v2 - v1);
  return {
    x: lerp(p1.x, p2.x, t),
    y: lerp(p1.y, p2.y, t)
  };
}

/**
 * Marching squares lookup table
 * Each case defines line segments as pairs of edge indices
 * Edges: 0=top, 1=right, 2=bottom, 3=left
 */
const CASES: number[][] = [
  [],           // 0: all below
  [3, 2],       // 1: bottom-left above
  [2, 1],       // 2: bottom-right above
  [3, 1],       // 3: bottom above
  [1, 0],       // 4: top-right above
  [3, 2, 1, 0], // 5: saddle - diagonal (bottom-left + top-right)
  [2, 0],       // 6: right above
  [3, 0],       // 7: all except top-left above
  [0, 3],       // 8: top-left above
  [0, 2],       // 9: left above
  [0, 1, 2, 3], // 10: saddle - diagonal (top-left + bottom-right)
  [0, 1],       // 11: all except bottom-right above
  [1, 3],       // 12: top above
  [1, 2],       // 13: all except bottom-left above
  [2, 3],       // 14: all except top-right above
  []            // 15: all above
];

/**
 * Get edge point on a cell
 */
function getEdgePoint(
  x: number,
  y: number,
  edge: number,
  grid: number[][],
  threshold: number,
  cellSize: number
): Point {
  const v00 = grid[y][x];           // top-left
  const v10 = grid[y][x + 1];       // top-right
  const v01 = grid[y + 1][x];       // bottom-left
  const v11 = grid[y + 1][x + 1];   // bottom-right

  const px = x * cellSize;
  const py = y * cellSize;

  switch (edge) {
    case 0: // top edge
      return interpolate(
        { x: px, y: py },
        { x: px + cellSize, y: py },
        v00, v10, threshold
      );
    case 1: // right edge
      return interpolate(
        { x: px + cellSize, y: py },
        { x: px + cellSize, y: py + cellSize },
        v10, v11, threshold
      );
    case 2: // bottom edge
      return interpolate(
        { x: px, y: py + cellSize },
        { x: px + cellSize, y: py + cellSize },
        v01, v11, threshold
      );
    case 3: // left edge
      return interpolate(
        { x: px, y: py },
        { x: px, y: py + cellSize },
        v00, v01, threshold
      );
    default:
      return { x: px, y: py };
  }
}

/**
 * Get the marching squares case for a cell
 */
function getCase(
  grid: number[][],
  x: number,
  y: number,
  threshold: number
): number {
  let caseIndex = 0;
  if (grid[y][x] >= threshold) caseIndex |= 8;         // top-left
  if (grid[y][x + 1] >= threshold) caseIndex |= 4;     // top-right
  if (grid[y + 1][x + 1] >= threshold) caseIndex |= 2; // bottom-right
  if (grid[y + 1][x] >= threshold) caseIndex |= 1;     // bottom-left
  return caseIndex;
}

/** Saddle cases use straight diagonals; we bend them to avoid harsh lines. */
const SADDLE_CASES = [5, 10];

/**
 * Replace a saddle diagonal with two segments meeting at an offset midpoint,
 * so the contour bends instead of a straight diagonal.
 */
function saddleMidpoint(p1: Point, p2: Point, cellSize: number): Point {
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const perpX = -dy / len;
  const perpY = dx / len;
  const k = cellSize * 0.22;
  return { x: mx + k * perpX, y: my + k * perpY };
}

/**
 * Extract contour lines from a noise grid at specified thresholds
 *
 * @param grid - 2D array of values normalized to [0, 1]
 * @param thresholds - Array of contour levels (0-1)
 * @param width - Output width in pixels
 * @param height - Output height in pixels
 * @returns Array of contour paths with SVG path data
 */
export function extractContours(
  grid: number[][],
  thresholds: number[],
  width: number,
  height: number
): ContourPath[] {
  const paths: ContourPath[] = [];
  const gridHeight = grid.length - 1;
  const gridWidth = grid[0].length - 1;

  const cellWidth = width / gridWidth;
  const cellHeight = height / gridHeight;
  // Use uniform cell size for simplicity (square cells)
  const cellSize = Math.min(cellWidth, cellHeight);

  for (const threshold of thresholds) {
    const segments: [Point, Point][] = [];

    // Process each cell
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const caseIndex = getCase(grid, x, y, threshold);
        const edges = CASES[caseIndex];

        // Process edge pairs
        const isSaddle = SADDLE_CASES.includes(caseIndex);
        for (let i = 0; i < edges.length; i += 2) {
          const p1 = getEdgePoint(x, y, edges[i], grid, threshold, cellSize);
          const p2 = getEdgePoint(x, y, edges[i + 1], grid, threshold, cellSize);
          if (isSaddle) {
            const c = saddleMidpoint(p1, p2, cellSize);
            segments.push([p1, c], [c, p2]);
          } else {
            segments.push([p1, p2]);
          }
        }
      }
    }

    // Convert segments to SVG path
    if (segments.length > 0) {
      const { full, closedOnly } = segmentsToPath(segments);
      if (full) {
        paths.push({
          d: full,
          ...(closedOnly && { dClosed: closedOnly }),
          threshold
        });
      }
    }
  }

  return paths;
}

/** Result of connecting segments: full path (strokes) and closed-only (fills). */
export interface SegmentsToPathResult {
  full: string;
  closedOnly: string;
}

/**
 * Connect line segments into continuous paths.
 * Returns both full path (for strokes) and closed-only path (for fills).
 * Open contours that hit the grid edge would be implicitly closed by a straight
 * line when filled, causing visible "non-curvy" artifacts—so we only fill closed chains.
 */
function segmentsToPath(segments: [Point, Point][]): SegmentsToPathResult {
  const empty = { full: '', closedOnly: '' };
  if (segments.length === 0) return empty;

  const chains: Point[][] = [];
  const used = new Set<number>();
  const epsilon = 0.5; // Tolerance for point matching

  function pointsEqual(a: Point, b: Point): boolean {
    return Math.abs(a.x - b.x) < epsilon && Math.abs(a.y - b.y) < epsilon;
  }

  function findConnecting(point: Point): { index: number; end: 'start' | 'end' } | null {
    for (let i = 0; i < segments.length; i++) {
      if (used.has(i)) continue;
      const [start, end] = segments[i];
      if (pointsEqual(point, start)) return { index: i, end: 'start' };
      if (pointsEqual(point, end)) return { index: i, end: 'end' };
    }
    return null;
  }

  // Build chains from segments
  for (let i = 0; i < segments.length; i++) {
    if (used.has(i)) continue;

    const chain: Point[] = [...segments[i]];
    used.add(i);

    // Extend forward
    let found = true;
    while (found) {
      found = false;
      const last = chain[chain.length - 1];
      const connection = findConnecting(last);
      if (connection) {
        used.add(connection.index);
        const [start, end] = segments[connection.index];
        if (connection.end === 'start') {
          chain.push(end);
        } else {
          chain.push(start);
        }
        found = true;
      }
    }

    // Extend backward
    found = true;
    while (found) {
      found = false;
      const first = chain[0];
      const connection = findConnecting(first);
      if (connection) {
        used.add(connection.index);
        const [start, end] = segments[connection.index];
        if (connection.end === 'start') {
          chain.unshift(end);
        } else {
          chain.unshift(start);
        }
        found = true;
      }
    }

    chains.push(chain);
  }

  const pathParts: string[] = [];
  const closedParts: string[] = [];

  for (const chain of chains) {
    if (chain.length < 2) continue;

    const parts: string[] = [];
    parts.push(`M ${chain[0].x.toFixed(2)} ${chain[0].y.toFixed(2)}`);

    // Use quadratic curves for smooth, rounded contours
    for (let i = 1; i < chain.length; i++) {
      const prev = chain[i - 1];
      const curr = chain[i];
      
      // Control point is the previous point for smooth flow
      parts.push(`Q ${prev.x.toFixed(2)} ${prev.y.toFixed(2)} ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`);
    }

    const closed = pointsEqual(chain[0], chain[chain.length - 1]);
    if (closed) {
      parts.push('Z');
      closedParts.push(parts.join(' '));
    }

    pathParts.push(parts.join(' '));
  }

  return {
    full: pathParts.join(' '),
    closedOnly: closedParts.length > 0 ? closedParts.join(' ') : ''
  };
}

/**
 * Generate threshold values evenly distributed between min and max
 */
export function generateThresholds(
  count: number,
  min: number = 0.2,
  max: number = 0.8
): number[] {
  const thresholds: number[] = [];
  for (let i = 0; i < count; i++) {
    thresholds.push(min + (max - min) * (i / (count - 1 || 1)));
  }
  return thresholds;
}
