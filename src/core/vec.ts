// Minimal 2D vector helpers. The simulation lives on a flat plane (x, y);
// the renderer maps that to world space (x, 0, y).
export interface Vec2 {
  x: number;
  y: number;
}

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });
export const clone = (a: Vec2): Vec2 => ({ x: a.x, y: a.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const lenSq = (a: Vec2): number => a.x * a.x + a.y * a.y;
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l > 1e-6 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
}

export function limit(a: Vec2, max: number): Vec2 {
  const l = len(a);
  if (l > max && l > 1e-6) return { x: (a.x / l) * max, y: (a.y / l) * max };
  return { x: a.x, y: a.y };
}

export function addInto(a: Vec2, b: Vec2, s = 1): void {
  a.x += b.x * s;
  a.y += b.y * s;
}
