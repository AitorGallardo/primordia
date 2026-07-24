import { mulberry32, rngRange, rngPick, rngInt } from '../core/rng';
import { pickPersona, type Persona } from './personality';
import { makeName } from './names';

export type BodyKind = 'blob' | 'segmented';

// HSL, kept in a muted bioluminescent band on near-black.
export interface Palette {
  hue: number; // 0..1
  sat: number; // 0..1
  light: number; // 0..1
  glowHue: number; // slightly shifted glow tint
}

export interface Traits {
  seed: number;
  bodyKind: BodyKind;
  segments: number; // for segmented bodies
  size: number; // base radius in world units
  wiggleFreq: number; // motion cadence
  wiggleAmp: number;
  maxSpeed: number;
  metabolism: number; // energy drained per second at rest
  boldness: number; // 0..1, affects wander vs caution
  sociability: number; // 0..1, affects bonding tendency
  palette: Palette;
  persona: Persona;
}

// Bioluminescent-leaning hues: cyans, teals, violets, the odd amber.
const HUE_BANDS: [number, number][] = [
  [0.45, 0.58], // teal / cyan
  [0.55, 0.72], // blue / indigo
  [0.72, 0.85], // violet
  [0.08, 0.14], // amber (rare)
];

export function makeTraits(seed: number): Traits {
  const r = mulberry32(seed);
  const bodyKind: BodyKind = r() < 0.5 ? 'blob' : 'segmented';
  const bandIdx = r() < 0.85 ? rngInt(r, 0, 2) : 3; // amber is uncommon
  const [h0, h1] = HUE_BANDS[bandIdx];
  const hue = rngRange(r, h0, h1);

  const palette: Palette = {
    hue,
    sat: rngRange(r, 0.5, 0.85),
    light: rngRange(r, 0.5, 0.66),
    glowHue: (hue + rngRange(r, -0.04, 0.06) + 1) % 1,
  };

  return {
    seed,
    bodyKind,
    segments: bodyKind === 'segmented' ? rngInt(r, 3, 6) : 1,
    size: rngRange(r, 0.9, 1.7),
    wiggleFreq: rngRange(r, 1.4, 3.6),
    wiggleAmp: rngRange(r, 0.06, 0.16),
    maxSpeed: rngRange(r, 2.6, 4.6),
    metabolism: rngRange(r, 0.011, 0.018),
    boldness: r(),
    sociability: r(),
    palette,
    persona: pickPersona(r),
  };
}

// Blend two parents' traits with mutation for reproduction.
export function breedTraits(a: Traits, b: Traits, childSeed: number): Traits {
  const r = mulberry32(childSeed);
  const mix = (x: number, y: number, jitter: number) => {
    const base = r() < 0.5 ? x : y;
    const avg = (x + y) / 2;
    const v = base * 0.5 + avg * 0.5 + rngRange(r, -jitter, jitter);
    return v;
  };

  const hue = (mix(a.palette.hue, b.palette.hue, 0.06) + 1) % 1;
  const bodyKind: BodyKind = r() < 0.5 ? a.bodyKind : b.bodyKind;

  return {
    seed: childSeed,
    bodyKind,
    segments: bodyKind === 'segmented' ? Math.max(3, Math.round(mix(a.segments, b.segments, 1))) : 1,
    size: Math.min(2.0, Math.max(0.8, mix(a.size, b.size, 0.2))),
    wiggleFreq: Math.max(1.0, mix(a.wiggleFreq, b.wiggleFreq, 0.4)),
    wiggleAmp: Math.max(0.04, mix(a.wiggleAmp, b.wiggleAmp, 0.03)),
    maxSpeed: Math.max(2.0, mix(a.maxSpeed, b.maxSpeed, 0.4)),
    metabolism: Math.max(0.007, mix(a.metabolism, b.metabolism, 0.003)),
    boldness: Math.min(1, Math.max(0, mix(a.boldness, b.boldness, 0.15))),
    sociability: Math.min(1, Math.max(0, mix(a.sociability, b.sociability, 0.15))),
    palette: {
      hue,
      sat: Math.min(0.9, Math.max(0.4, mix(a.palette.sat, b.palette.sat, 0.08))),
      light: Math.min(0.7, Math.max(0.45, mix(a.palette.light, b.palette.light, 0.06))),
      glowHue: (hue + rngRange(r, -0.04, 0.06) + 1) % 1,
    },
    // Offspring usually inherit a parent persona, sometimes mutate to a new one.
    persona: r() < 0.8 ? rngPick(r, [a.persona, b.persona]) : pickPersona(r),
  };
}

export function makeNameFor(seed: number): string {
  return makeName(mulberry32(seed ^ 0x9e3779b9));
}
