import { hashSeed, mulberry32 } from '../core/rng';

// Affinity in [-1, 1]. Pairs have a seeded "destiny" (do they tend to bond or
// clash?) and their current affinity drifts toward it whenever they meet.
export class Relationships {
  private current = new Map<string, number>();
  private destiny = new Map<string, number>();

  private key(a: string, b: string): string {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  private destinyFor(a: string, b: string): number {
    const k = this.key(a, b);
    let d = this.destiny.get(k);
    if (d === undefined) {
      // Stable per-pair leaning, from a hash of both names.
      const rr = mulberry32(hashSeed(k));
      // Skew so bonds and clashes are both common, indifference less so.
      const raw = rr() * 2 - 1;
      d = Math.sign(raw) * (0.35 + Math.abs(raw) * 0.65);
      this.destiny.set(k, d);
    }
    return d;
  }

  get(a: string, b: string): number {
    if (a === b) return 0;
    return this.current.get(this.key(a, b)) ?? 0;
  }

  // Called while two organisms are near each other; nudges affinity toward
  // destiny, plus a little noise. dt is already scaled.
  meet(a: string, b: string, dt: number): void {
    if (a === b) return;
    const k = this.key(a, b);
    const d = this.destinyFor(a, b);
    const cur = this.current.get(k) ?? 0;
    const rate = 0.08;
    const next = cur + (d - cur) * rate * dt + (Math.random() - 0.5) * 0.02 * dt;
    this.current.set(k, Math.max(-1, Math.min(1, next)));
  }

  isBond(a: string, b: string): boolean {
    return this.get(a, b) > 0.45;
  }
  isRival(a: string, b: string): boolean {
    return this.get(a, b) < -0.45;
  }

  // Bonds/rivals for one organism, sorted by strength.
  relationsOf(name: string, names: string[]): { name: string; value: number }[] {
    const out: { name: string; value: number }[] = [];
    for (const other of names) {
      if (other === name) continue;
      const v = this.get(name, other);
      if (Math.abs(v) > 0.2) out.push({ name: other, value: v });
    }
    out.sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
    return out;
  }

  forget(name: string): void {
    for (const k of [...this.current.keys()]) {
      const [a, b] = k.split('|');
      if (a === name || b === name) this.current.delete(k);
    }
  }
}
