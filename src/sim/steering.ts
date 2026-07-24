import type { Vec2 } from '../core/vec';
import { vec, sub, add, normalize, scale, len, addInto } from '../core/vec';
import type { Organism } from './organism';

export interface Neighbor {
  org: Organism;
  d: number;
  dir: Vec2; // unit vector from self toward neighbor
}

export interface SteerContext {
  dishRadius: number;
  nearestFood: Vec2 | null;
  neighbors: Neighbor[];
  friendPos: Vec2 | null; // strongest nearby bond
  rivalPos: Vec2 | null; // strongest nearby rival
  actionTargetPos: Vec2 | null; // resolved approach/avoid target
  dt: number;
}

const MAX_FORCE = 6;

function seek(org: Organism, target: Vec2, speedScale = 1): Vec2 {
  const desired = normalize(sub(target, org.pos));
  const d = scale(desired, org.traits.maxSpeed * speedScale);
  return sub(d, org.vel);
}

function flee(org: Organism, target: Vec2): Vec2 {
  const desired = normalize(sub(org.pos, target));
  const d = scale(desired, org.traits.maxSpeed);
  return sub(d, org.vel);
}

// Compute the acceleration for this frame from weighted behaviors.
export function computeSteering(org: Organism, ctx: SteerContext): Vec2 {
  const acc = vec(0, 0);
  const hunger = 1 - org.energy; // 0..1
  const t = org.traits;

  // --- wander: smoothly rotating heading, keeps everyone alive-looking ---
  org.wanderAngle += (Math.random() - 0.5) * 3 * ctx.dt;
  const wander = vec(Math.cos(org.wanderAngle), Math.sin(org.wanderAngle));
  const wanderW = org.action.kind === 'rest' ? 0.15 : 0.6 + t.boldness * 0.4;
  addInto(acc, scale(wander, wanderW));

  // --- action bias (from AI decision or instinct) ---
  switch (org.action.kind) {
    case 'seek_food':
      if (ctx.nearestFood) addInto(acc, seek(org, ctx.nearestFood), 1.6);
      break;
    case 'approach':
      if (ctx.actionTargetPos) addInto(acc, seek(org, ctx.actionTargetPos), 1.3);
      break;
    case 'avoid':
      if (ctx.actionTargetPos) addInto(acc, flee(org, ctx.actionTargetPos), 1.4);
      break;
    case 'rest':
      // brake toward stillness
      addInto(acc, scale(org.vel, -0.8));
      break;
    case 'wander':
    default:
      break;
  }

  // --- baseline instinct: hunger always pulls a little toward food ---
  if (ctx.nearestFood && org.action.kind !== 'rest') {
    addInto(acc, seek(org, ctx.nearestFood), 0.4 + hunger * 1.2);
  }

  // --- separation: don't overlap ---
  const sep = vec(0, 0);
  let sepCount = 0;
  for (const n of ctx.neighbors) {
    const minD = (org.radius + n.org.radius) * 1.4;
    if (n.d < minD && n.d > 1e-3) {
      const push = scale(n.dir, -(minD - n.d) / minD);
      addInto(sep, push);
      sepCount++;
    }
  }
  if (sepCount > 0) addInto(acc, scale(normalize(sep), org.traits.maxSpeed), 1.1);

  // --- social instincts (independent of AI action) ---
  if (ctx.friendPos && org.action.kind === 'wander') {
    addInto(acc, seek(org, ctx.friendPos, 0.7), 0.5 * t.sociability);
  }
  if (ctx.rivalPos) {
    addInto(acc, flee(org, ctx.rivalPos), 0.6 * (1 - t.boldness));
  }

  // --- containment: steer back inside the dish rim ---
  const distToCenter = len(org.pos);
  const margin = ctx.dishRadius - org.radius - 1.2;
  if (distToCenter > margin) {
    const inward = normalize(scale(org.pos, -1));
    const strength = (distToCenter - margin) * 2.5;
    addInto(acc, scale(inward, org.traits.maxSpeed), 1 + strength);
  }

  // limit force
  const l = len(acc);
  if (l > MAX_FORCE) return scale(acc, MAX_FORCE / l);
  return acc;
}

// Integrate motion + organic wiggle. Mutates org and clamps inside the dish.
export function integrate(org: Organism, acc: Vec2, dt: number, dishRadius: number): void {
  addInto(org.vel, acc, dt);

  // organic wiggle: a small perpendicular oscillation
  const speed = len(org.vel);
  if (speed > 1e-3) {
    const perp = vec(-org.vel.y / speed, org.vel.x / speed);
    const w = Math.sin(org.age * org.traits.wiggleFreq) * org.traits.wiggleAmp * org.traits.maxSpeed;
    addInto(org.vel, perp, w * dt * 6);
  }

  // speed cap (resting organisms move slower)
  const cap = org.action.kind === 'rest' ? org.traits.maxSpeed * 0.3 : org.traits.maxSpeed;
  const s2 = len(org.vel);
  if (s2 > cap) org.vel = scale(org.vel, cap / s2);

  org.pos = add(org.pos, scale(org.vel, dt));

  // hard clamp inside the dish (safety net over containment steering)
  const d = len(org.pos);
  const limitR = dishRadius - org.radius * 0.5;
  if (d > limitR && d > 1e-6) {
    org.pos = scale(org.pos, limitR / d);
    // reflect velocity slightly so they don't stick to the rim
    const n = normalize(org.pos);
    const dot = org.vel.x * n.x + org.vel.y * n.y;
    if (dot > 0) {
      org.vel.x -= 1.6 * dot * n.x;
      org.vel.y -= 1.6 * dot * n.y;
    }
  }
}
