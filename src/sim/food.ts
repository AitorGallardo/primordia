import type { Vec2 } from '../core/vec';
import { vec } from '../core/vec';
import type { Rng } from '../core/rng';
import { rngRange } from '../core/rng';

export interface Food {
  id: number;
  pos: Vec2;
  vel: Vec2;
  energy: number;
  age: number;
  life: number;
  alive: boolean;
}

let nextFoodId = 1;

// Motes drift in from just inside the rim and wander slowly toward the middle.
export function spawnFood(r: Rng, dishRadius: number): Food {
  const a = r() * Math.PI * 2;
  const rad = dishRadius * rngRange(r, 0.7, 0.97);
  const pos = vec(Math.cos(a) * rad, Math.sin(a) * rad);
  // gentle drift, biased slightly inward
  const inward = rngRange(r, 0.05, 0.25);
  const vel = vec(-Math.cos(a) * inward + rngRange(r, -0.1, 0.1), -Math.sin(a) * inward + rngRange(r, -0.1, 0.1));
  return {
    id: nextFoodId++,
    pos,
    vel,
    energy: rngRange(r, 0.20, 0.38),
    age: 0,
    life: rngRange(r, 30, 50),
    alive: true,
  };
}

export function updateFood(f: Food, dt: number, dishRadius: number): void {
  f.pos.x += f.vel.x * dt;
  f.pos.y += f.vel.y * dt;
  f.age += dt;
  // very light drag so motes settle
  f.vel.x *= 1 - 0.2 * dt;
  f.vel.y *= 1 - 0.2 * dt;
  const d = Math.hypot(f.pos.x, f.pos.y);
  if (d > dishRadius * 0.98) {
    // nudge back inside
    f.vel.x -= (f.pos.x / d) * 0.4 * dt;
    f.vel.y -= (f.pos.y / d) * 0.4 * dt;
  }
  if (f.age >= f.life) f.alive = false;
}
