import type { Vec2 } from '../core/vec';
import { vec, sub, len, normalize, dist } from '../core/vec';
import { mulberry32, type Rng } from '../core/rng';
import { Organism, makeOrganism, breed } from './organism';
import { releaseName } from './names';
import { instinctLine } from './personality';
import { Relationships } from './relationships';
import { spawnFood, updateFood, type Food } from './food';
import { computeSteering, integrate, type Neighbor, type SteerContext } from './steering';
import type { Decision, ThoughtSource, ActionKind } from './types';

export interface WorldEvents {
  onBirth?: (o: Organism, parents?: [Organism, Organism]) => void;
  onDeath?: (o: Organism) => void;
  onFoodAdded?: (f: Food) => void;
  onFoodRemoved?: (f: Food) => void;
}

const SENSE_RANGE = 14;
const DEATH_DECAY_TIME = 3.2;

export class World {
  readonly dishRadius: number;
  readonly popCap = 20;
  organisms: Organism[] = [];
  food: Food[] = [];
  rel = new Relationships();
  time = 0;
  timeScale = 1;

  births = 0;
  deaths = 0;

  private rng: Rng;
  private seedCounter: number;
  private foodTimer = 0;
  private events: WorldEvents;

  constructor(seed: number, dishRadius = 34, events: WorldEvents = {}) {
    this.dishRadius = dishRadius;
    this.rng = mulberry32(seed);
    this.seedCounter = seed ^ 0x1234567;
    this.events = events;
  }

  private nextSeed(): number {
    this.seedCounter = (Math.imul(this.seedCounter, 1664525) + 1013904223) >>> 0;
    return this.seedCounter;
  }

  populate(count: number): void {
    for (let i = 0; i < count; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = this.dishRadius * Math.sqrt(this.rng()) * 0.8;
      const org = makeOrganism(this.nextSeed(), vec(Math.cos(a) * r, Math.sin(a) * r));
      org.energy = 0.6 + this.rng() * 0.35;
      org.age = this.rng() * 20;
      this.organisms.push(org);
      this.events.onBirth?.(org);
    }
    // seed a little food
    for (let i = 0; i < 14; i++) this.addFood();
  }

  private addFood(): void {
    const f = spawnFood(this.rng, this.dishRadius);
    this.food.push(f);
    this.events.onFoodAdded?.(f);
  }

  get alive(): Organism[] {
    return this.organisms.filter((o) => o.alive);
  }

  byName(name: string): Organism | undefined {
    return this.organisms.find((o) => o.alive && o.name === name);
  }

  nearestFood(pos: Vec2): Food | null {
    let best: Food | null = null;
    let bestD = Infinity;
    for (const f of this.food) {
      if (!f.alive) continue;
      const d = dist(pos, f.pos);
      if (d < bestD) {
        bestD = d;
        best = f;
      }
    }
    return best;
  }

  neighborsOf(org: Organism, range = SENSE_RANGE): Neighbor[] {
    const out: Neighbor[] = [];
    for (const o of this.organisms) {
      if (o === org || !o.alive) continue;
      const diff = sub(o.pos, org.pos);
      const d = len(diff);
      if (d < range) out.push({ org: o, d, dir: normalize(diff) });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  // ---- main tick -------------------------------------------------------
  update(dtReal: number): void {
    const dt = Math.min(dtReal, 0.05) * this.timeScale;
    // sub-step at high time scale to keep integration stable
    const steps = this.timeScale > 2 ? 4 : 1;
    const sdt = dt / steps;
    for (let s = 0; s < steps; s++) this.step(sdt);
  }

  private step(dt: number): void {
    this.time += dt;

    // --- food spawning ---
    this.foodTimer -= dt;
    const desired = Math.max(8, Math.min(15, this.alive.length + 1));
    if (this.foodTimer <= 0 && this.food.filter((f) => f.alive).length < desired) {
      this.addFood();
      this.foodTimer = 0.45 + this.rng() * 0.6;
    }

    // --- food motion ---
    for (const f of this.food) {
      if (f.alive) updateFood(f, dt, this.dishRadius);
    }

    // --- organisms ---
    for (const org of this.organisms) {
      if (!org.alive) {
        org.decay = Math.min(1, org.decay + dt / DEATH_DECAY_TIME);
        continue;
      }

      const neighbors = this.neighborsOf(org);
      const ctx = this.buildContext(org, neighbors, dt);

      // instinct refresh when the current bias has lapsed
      if (this.time >= org.action.until) this.instinctDecision(org, neighbors);

      const acc = computeSteering(org, ctx);
      integrate(org, acc, dt, this.dishRadius);

      // relationships evolve on contact
      for (const n of neighbors) {
        if (n.d < (org.radius + n.org.radius) * 3) this.rel.meet(org.name, n.org.name, dt);
      }

      // energy: metabolism plus movement cost
      const speed = len(org.vel);
      const moveCost = (speed / org.traits.maxSpeed) * org.traits.metabolism * 0.6;
      const restBonus = org.action.kind === 'rest' ? 0.4 : 1;
      org.energy -= (org.traits.metabolism + moveCost) * restBonus * dt;

      // eating
      this.tryEat(org);

      org.age += dt;
      if (org.reproduceCooldown > 0) org.reproduceCooldown -= dt;

      // expire speech
      if (org.speech && this.time >= org.speech.until) org.speech = null;

      if (org.energy <= 0) this.kill(org);
    }

    // --- reproduction ---
    this.tryReproduce(dt);

    // --- cull fully decayed & dead food ---
    this.cull();
  }

  private buildContext(org: Organism, neighbors: Neighbor[], dt: number): SteerContext {
    const nf = this.nearestFood(org.pos);
    let friendPos: Vec2 | null = null;
    let rivalPos: Vec2 | null = null;
    let friendVal = 0.45;
    let rivalVal = -0.45;
    for (const n of neighbors) {
      const v = this.rel.get(org.name, n.org.name);
      if (v > friendVal) {
        friendVal = v;
        friendPos = n.org.pos;
      }
      if (v < rivalVal) {
        rivalVal = v;
        rivalPos = n.org.pos;
      }
    }
    let actionTargetPos: Vec2 | null = null;
    if ((org.action.kind === 'approach' || org.action.kind === 'avoid') && org.action.target) {
      const t = this.byName(org.action.target);
      if (t) actionTargetPos = t.pos;
    }
    return {
      dishRadius: this.dishRadius,
      nearestFood: nf ? nf.pos : null,
      neighbors,
      friendPos,
      rivalPos,
      actionTargetPos,
      dt,
    };
  }

  private tryEat(org: Organism): void {
    for (const f of this.food) {
      if (!f.alive) continue;
      if (dist(org.pos, f.pos) < org.radius + 1.2) {
        org.energy = Math.min(1, org.energy + f.energy);
        f.alive = false;
        this.events.onFoodRemoved?.(f);
      }
    }
  }

  // Instinct-level action selection (no AI needed). Also sets a canned line
  // occasionally, always tagged as instinct.
  private instinctDecision(org: Organism, neighbors: Neighbor[]): void {
    const hunger = 1 - org.energy;
    let kind: ActionKind = 'wander';
    let target: string | undefined;

    const rival = neighbors.find((n) => this.rel.isRival(org.name, n.org.name) && n.d < 8);
    const friend = neighbors.find((n) => this.rel.isBond(org.name, n.org.name) && n.d < 12);

    if (rival && org.traits.boldness < 0.6) {
      kind = 'avoid';
      target = rival.org.name;
    } else if (hunger > 0.5 && this.nearestFood(org.pos)) {
      kind = 'seek_food';
    } else if (friend && org.traits.sociability > 0.5 && this.rng() < 0.5) {
      kind = 'approach';
      target = friend.org.name;
    } else if (org.energy < 0.35 && this.rng() < 0.4) {
      kind = 'rest';
    } else {
      kind = this.rng() < 0.75 ? 'wander' : 'rest';
    }

    org.setAction(kind, this.time + 4 + this.rng() * 5, target);

    // occasional instinct speech (clearly marked as instinct in the UI)
    if (!org.speech && this.rng() < 0.12) {
      const text = instinctLine(mulberry32((org.id * 2654435761) ^ Math.floor(this.time)), org.traits.persona);
      org.speech = { text, source: 'instinct', until: this.time + 3.5 };
      org.lastThought = { text, source: 'instinct', action: kind, target, at: this.time };
    } else if (!org.lastThought) {
      org.lastThought = { text: '', source: 'instinct', action: kind, target, at: this.time };
    }
  }

  private tryReproduce(dt: number): void {
    if (this.alive.length >= this.popCap) return;
    const live = this.alive;
    // probabilistic; checked per eligible pair
    for (let i = 0; i < live.length; i++) {
      const a = live[i];
      if (a.energy < 0.78 || a.reproduceCooldown > 0) continue;
      for (let j = i + 1; j < live.length; j++) {
        const b = live[j];
        if (b.energy < 0.78 || b.reproduceCooldown > 0) continue;
        if (this.rel.isRival(a.name, b.name)) continue;
        const d = dist(a.pos, b.pos);
        if (d > (a.radius + b.radius) * 2.4) continue;
        // ~ once every few seconds of eligible contact
        if (this.rng() < 0.28 * dt) {
          this.spawnChild(a, b);
          if (this.alive.length >= this.popCap) return;
        }
      }
    }
  }

  private spawnChild(a: Organism, b: Organism): void {
    const mid = vec((a.pos.x + b.pos.x) / 2, (a.pos.y + b.pos.y) / 2);
    mid.x += (this.rng() - 0.5) * 2;
    mid.y += (this.rng() - 0.5) * 2;
    const child = breed(a, b, this.nextSeed(), mid);
    child.energy = 0.5;
    child.reproduceCooldown = 28;
    a.energy -= 0.36;
    b.energy -= 0.36;
    a.reproduceCooldown = 26;
    b.reproduceCooldown = 26;
    this.organisms.push(child);
    this.births++;
    this.events.onBirth?.(child, [a, b]);
  }

  private kill(org: Organism): void {
    if (!org.alive) return;
    org.alive = false;
    org.energy = 0;
    org.decay = 0;
    org.speech = null;
    this.deaths++;
    this.rel.forget(org.name);
    this.events.onDeath?.(org);
  }

  private cull(): void {
    this.organisms = this.organisms.filter((o) => {
      if (!o.alive && o.decay >= 1) {
        releaseName(o.name);
        return false;
      }
      return true;
    });
    this.food = this.food.filter((f) => f.alive);
  }

  // ---- AI integration --------------------------------------------------
  // Apply a decision produced by the minds layer.
  applyDecision(org: Organism, decision: Decision, source: ThoughtSource): void {
    if (!org.alive) return;
    let kind = decision.action;
    let target = decision.target;

    // validate target existence for approach/avoid
    if ((kind === 'approach' || kind === 'avoid') && (!target || !this.byName(target))) {
      kind = 'wander';
      target = undefined;
    }
    org.setAction(kind, this.time + 10, target);

    const say = (decision.say ?? '').trim();
    if (say) {
      org.speech = { text: say, source, until: this.time + 4.5 };
    }
    org.lastThought = { text: say, source, action: kind, target, at: this.time };
    org.lastThoughtAt = this.time;
  }

  markThinking(org: Organism): void {
    org.lastThoughtAt = this.time;
  }

  // Public instinct fallback (used by the minds layer when the model is
  // unavailable or a reply can't be parsed).
  instinctFor(org: Organism): void {
    if (org.alive) this.instinctDecision(org, this.neighborsOf(org));
  }
}
