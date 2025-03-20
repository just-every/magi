/**
 * Color Manager Module
 *
 * Handles the generation and persistence of process theme colors.
 */
import { saveData, loadData } from '../utils/storage';

/**
 * RGB color type as a tuple of three numbers [r, g, b]
 */
export type RGBColor = [number, number, number];

/**
 * Store previously used colors to ensure variety
 * Each entry is [r, g, b] values
 * Initialize from stored values if available
 */
let usedColors: Array<RGBColor> = [];

/**
 * Load used colors from storage
 */
export function initColorManager(): void {
  usedColors = loadUsedColors();
}

/**
 * Save the used process colors to persistent storage
 *
 * @param colors - Array of [r,g,b] color values
 */
export function saveUsedColors(colors: Array<RGBColor> = usedColors): void {
  saveData('USED_COLORS', JSON.stringify(colors));
}

/**
 * Load previously used process colors from storage
 *
 * @returns Array of [r,g,b] color values, or empty array if none found
 */
export function loadUsedColors(): Array<RGBColor> {
  const colorsJson = loadData('USED_COLORS');
  if (!colorsJson) {
    return [];
  }

  try {
    return JSON.parse(colorsJson) as Array<RGBColor>;
  } catch (error) {
    console.error('Error parsing stored colors:', error);
    return [];
  }
}

/**
 * Calculate the minimum distance between a color and all used colors
 * Higher distance means more distinct color
 *
 * @param color - The RGB color to check
 * @returns The minimum distance to any used color
 */
function minColorDistance(color: RGBColor): number {
  if (usedColors.length === 0) return Infinity;

  return Math.min(...usedColors.map(usedColor => {
    // Calculate Euclidean distance in RGB space
    const dr = color[0] - usedColor[0];
    const dg = color[1] - usedColor[1];
    const db = color[2] - usedColor[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  }));
}

/**
 * Generate colors for a process header and text
 * Creates distinct colors with maximum difference from existing ones
 *
 * @returns Object with background and text colors in rgba format
 */
export function generateProcessColors(): { bgColor: string, textColor: string } {
  // If we have too many colors stored, we'll start forgetting the oldest ones
  // to avoid over-constraining our color generation
  const maxColorMemory = 10;
  if (usedColors.length > maxColorMemory) {
    usedColors.shift(); // Remove the oldest color
  }

  // Generate a set of candidate colors to choose from
  const candidates: Array<RGBColor> = [];
  const numCandidates = 20; // Generate 20 candidates to choose from

  for (let i = 0; i < numCandidates; i++) {
    // Create base colors, avoid too much yellow by keeping red and green from both being too high
    let r = Math.floor(Math.random() * 200) + 55; // 55-255
    let g = Math.floor(Math.random() * 200) + 55; // 55-255
    let b = Math.floor(Math.random() * 200) + 55; // 55-255

    // Ensure one color dominates to make the theme clear
    const dominantIndex = Math.floor(Math.random() * 3);
    if (dominantIndex === 0) {
      r = Math.min(255, r + 50);
      g = Math.max(50, g - 30);
      b = Math.max(50, b - 30);
    } else if (dominantIndex === 1) {
      g = Math.min(255, g + 50);
      r = Math.max(50, r - 30);
      b = Math.max(50, b - 30);
    } else {
      b = Math.min(255, b + 50);
      r = Math.max(50, r - 30);
      g = Math.max(50, g - 30);
    }

    candidates.push([r, g, b]);
  }

  // Choose the candidate with the maximum minimum distance
  let bestCandidate = candidates[0];
  let bestDistance = minColorDistance(bestCandidate);

  for (let i = 1; i < candidates.length; i++) {
    const distance = minColorDistance(candidates[i]);
    if (distance > bestDistance) {
      bestDistance = distance;
      bestCandidate = candidates[i];
    }
  }

  // Add the selected color to our used colors list
  usedColors.push(bestCandidate);

  // Create background with very low alpha
  const [r, g, b] = bestCandidate;
  const bgColor = `rgba(${r}, ${g}, ${b}, 0.2)`;

  // Create darker text version for contrast
  const textColor = `rgba(${Math.floor(r * 0.6)}, ${Math.floor(g * 0.6)}, ${Math.floor(b * 0.6)}, 0.9)`;

  return { bgColor, textColor };
}
