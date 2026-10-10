/* Deterministic noise helpers used for world generation */

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** fast integer hash -> 0..1 */
export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return (h >>> 0) / 4294967296;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function noise1(x: number, seed = 0): number {
  return valueNoise(x, 0.5, seed);
}

export function fbm(x: number, y: number, oct = 4, seed = 0, lac = 2, gain = 0.5): number {
  let f = 1, a = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * valueNoise(x * f, y * f, seed + i * 977);
    norm += a;
    f *= lac;
    a *= gain;
  }
  return sum / norm;
}

export function fbm1(x: number, oct = 4, seed = 0): number {
  let f = 1, a = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += a * noise1(x * f, seed + i * 613);
    norm += a;
    f *= 2;
    a *= 0.5;
  }
  return sum / norm;
}

export function ridge(x: number, y: number, seed = 0, oct = 3): number {
  let f = 1, a = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    const n = Math.abs(valueNoise(x * f, y * f, seed + i * 331) * 2 - 1);
    sum += a * (1 - n);
    norm += a;
    f *= 2;
    a *= 0.5;
  }
  return sum / norm;
}
