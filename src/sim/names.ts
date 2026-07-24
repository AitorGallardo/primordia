import type { Rng } from '../core/rng';
import { rngPick, rngInt, rngBool } from '../core/rng';

// Names feel like little organisms / lab specimens: "myx-7", "brill", "quon-3".
const PREFIXES = [
  'myx', 'brill', 'quon', 'zeb', 'plok', 'nim', 'vora', 'stud', 'cael', 'dro',
  'sil', 'tuk', 'oro', 'yel', 'wisp', 'grum', 'pel', 'anx', 'lun', 'fen',
  'cyt', 'axo', 'nael', 'vex', 'poru', 'sib', 'thal', 'ombr', 'nyx', 'gil',
];

const usedNames = new Set<string>();

export function makeName(r: Rng): string {
  for (let attempt = 0; attempt < 40; attempt++) {
    const base = rngPick(r, PREFIXES);
    const name = rngBool(r, 0.55) ? `${base}-${rngInt(r, 1, 9)}` : base;
    if (!usedNames.has(name)) {
      usedNames.add(name);
      return name;
    }
  }
  // Fallback guarantees uniqueness.
  const unique = `spec-${usedNames.size + 1}`;
  usedNames.add(unique);
  return unique;
}

export function releaseName(name: string): void {
  usedNames.delete(name);
}
