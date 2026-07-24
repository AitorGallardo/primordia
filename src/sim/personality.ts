import type { Rng } from '../core/rng';
import { rngPick } from '../core/rng';

// One small model, many voices: each organism gets a persona that seasons its
// system prompt. When the model is unavailable, the canned lines below stand in
// (and are always labelled as instinct in the UI).
export interface Persona {
  id: string;
  label: string;
  // Injected into the model system prompt to steer tone.
  voice: string;
  // Canned one-liners used ONLY in instinct mode (never presented as AI output).
  instinctLines: string[];
}

export const PERSONAS: Persona[] = [
  {
    id: 'curious',
    label: 'curious',
    voice: 'You are endlessly curious and a little naive. You wonder aloud about everything.',
    instinctLines: ['what is that?', 'ooh, over there', 'i want to see', 'is that food?', 'closer, closer'],
  },
  {
    id: 'grumpy',
    label: 'grumpy',
    voice: 'You are grumpy and terse. You complain and want to be left alone.',
    instinctLines: ['leave me alone', 'ugh, crowded', 'not hungry', 'go away', 'too bright'],
  },
  {
    id: 'poetic',
    label: 'poetic',
    voice: 'You speak in small poetic fragments about light and water.',
    instinctLines: ['the dark hums', 'i drift, therefore', 'light on the water', 'soft currents', 'we are motes'],
  },
  {
    id: 'anxious',
    label: 'anxious',
    voice: 'You are anxious and easily startled. You worry about danger and hunger.',
    instinctLines: ['too close, too close', 'is it safe?', 'i should hide', 'my energy...', 'not again'],
  },
  {
    id: 'greedy',
    label: 'greedy',
    voice: 'You are greedy and food-obsessed. You always want more.',
    instinctLines: ['mine, all mine', 'more food', 'that one is mine', 'so hungry', 'gimme'],
  },
  {
    id: 'gentle',
    label: 'gentle',
    voice: 'You are gentle and social. You like company and looking after others.',
    instinctLines: ['come with me', 'stay close', 'are you okay?', 'together now', 'hello, friend'],
  },
  {
    id: 'stoic',
    label: 'stoic',
    voice: 'You are calm and stoic. You state things plainly, without drama.',
    instinctLines: ['i endure', 'it is fine', 'i keep moving', 'enough for now', 'so it goes'],
  },
];

export function pickPersona(r: Rng): Persona {
  return rngPick(r, PERSONAS);
}

export function instinctLine(r: Rng, persona: Persona): string {
  return rngPick(r, persona.instinctLines);
}
