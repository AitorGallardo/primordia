// Small, fast, seedable PRNG (mulberry32) so every organism is procedurally
// reproducible from a single integer seed.
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Hash a string into a 32-bit seed (used to derive stable pair-affinity).
export function hashSeed(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const rngRange = (r: Rng, min: number, max: number) => min + r() * (max - min);
export const rngInt = (r: Rng, min: number, max: number) => Math.floor(rngRange(r, min, max + 1));
export const rngPick = <T>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
export const rngBool = (r: Rng, p = 0.5) => r() < p;
