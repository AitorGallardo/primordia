import type { Vec2 } from '../core/vec';
import { vec } from '../core/vec';
import type { Traits } from './traits';
import { makeTraits, breedTraits, makeNameFor } from './traits';
import type { ActionKind, Thought } from './types';

let nextId = 1;

export interface ActionState {
  kind: ActionKind;
  target?: string;
  until: number; // sim time when the bias expires
}

export interface Speech {
  text: string;
  source: 'model' | 'instinct';
  until: number;
}

export class Organism {
  readonly id: number;
  readonly name: string;
  readonly traits: Traits;
  readonly generation: number;

  pos: Vec2;
  vel: Vec2;
  wanderAngle: number;

  energy = 1;
  age = 0;
  alive = true;
  // Death animation: from 1 (alive) sinking to 0 (removed).
  decay = 0;

  action: ActionState;
  lastThought: Thought | null = null;
  speech: Speech | null = null;

  // AI scheduling / cooldowns.
  lastThoughtAt = -999;
  reproduceCooldown = 0;

  constructor(opts: {
    name: string;
    traits: Traits;
    pos: Vec2;
    generation: number;
  }) {
    this.id = nextId++;
    this.name = opts.name;
    this.traits = opts.traits;
    this.pos = opts.pos;
    this.generation = opts.generation;
    this.vel = vec(0, 0);
    this.wanderAngle = Math.random() * Math.PI * 2;
    this.action = { kind: 'wander', until: 0 };
  }

  get radius(): number {
    return this.traits.size;
  }

  // Visible brightness scales with energy (low energy => dim).
  get brightness(): number {
    const e = Math.max(0, this.energy);
    return this.alive ? 0.28 + e * 0.72 : Math.max(0, 0.3 * (1 - this.decay));
  }

  setAction(kind: ActionKind, until: number, target?: string): void {
    this.action = { kind, until, target };
  }
}

export function makeOrganism(seed: number, pos: Vec2, generation = 0): Organism {
  const traits = makeTraits(seed);
  const name = makeNameFor(seed);
  return new Organism({ name, traits, pos, generation });
}

export function breed(a: Organism, b: Organism, childSeed: number, pos: Vec2): Organism {
  const traits = breedTraits(a.traits, b.traits, childSeed);
  const name = makeNameFor(childSeed);
  return new Organism({
    name,
    traits,
    pos,
    generation: Math.max(a.generation, b.generation) + 1,
  });
}
