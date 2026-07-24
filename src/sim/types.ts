// Shared vocabulary between the simulation, the UI, and the AI layer.

export type ActionKind = 'seek_food' | 'approach' | 'avoid' | 'rest' | 'wander';

export interface Decision {
  action: ActionKind;
  target?: string; // organism name for approach/avoid
  say?: string; // <= 8 words
}

export type ThoughtSource = 'model' | 'instinct';

export interface Thought {
  text: string;
  source: ThoughtSource;
  action: ActionKind;
  target?: string;
  at: number; // sim time seconds
}
