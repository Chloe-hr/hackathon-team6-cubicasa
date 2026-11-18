// One colour scale for distance, shared by the map and the histogram, so the histogram is also the map's legend.
// Ink for the plans closest to yours, pale grey for the farthest; spread by rank so every shade is used.

const NEAR = [27, 38, 52];
const FAR = [222, 227, 233];

export function ramp(p: number) {
  const t = Math.min(1, Math.max(0, p)) ** 0.7;
  const [r, g, b] = NEAR.map((near, i) => Math.round(near + (FAR[i] - near) * t));
  return `rgb(${r} ${g} ${b})`;
}

// For each distance: the share of the 5,000 plans that are closer (0 = the nearest plan, 1 = the farthest)
export function ranks(distances: number[]) {
  const order = distances.map((_, i) => i).sort((a, b) => distances[a] - distances[b]);
  const rank = new Float32Array(distances.length);
  order.forEach((index, position) => (rank[index] = position / (distances.length - 1)));
  return { order, rank };
}

// The same scale cut into steps, so the map can draw all dots of one shade in one go
export const LEVELS = 48;
export const levelColours = Array.from({ length: LEVELS }, (_, level) => ramp(level / (LEVELS - 1)));

export const median = (sorted: number[]) => sorted[Math.floor(sorted.length / 2)];
