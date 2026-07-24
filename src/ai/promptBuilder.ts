import type { World } from '../sim/world';
import type { Organism } from '../sim/organism';
import { dist } from '../core/vec';

export interface BuiltPrompt {
  system: string;
  user: string;
  validNames: string[];
}

function hungerWord(energy: number): string {
  if (energy < 0.25) return 'starving';
  if (energy < 0.5) return 'hungry';
  if (energy < 0.75) return 'okay';
  return 'well-fed';
}

// Turn an organism's situation into a compact prompt for the little model.
export function buildPrompt(world: World, org: Organism): BuiltPrompt {
  const neighbors = world.neighborsOf(org, 14).slice(0, 4);
  const food = world.nearestFood(org.pos);
  const persona = org.traits.persona;

  const validNames = neighbors.map((n) => n.org.name);

  const nearbyLines = neighbors.map((n) => {
    const v = world.rel.get(org.name, n.org.name);
    const rel = v > 0.45 ? 'a friend' : v < -0.45 ? 'a rival' : 'a stranger';
    return `- ${n.org.name} (${rel}, ${n.d.toFixed(0)} away)`;
  });

  const foodLine = food
    ? `Nearest food is ${dist(org.pos, food.pos).toFixed(0)} units away.`
    : 'No food is in sight.';

  const system =
    `You are ${org.name}, a tiny organism in a petri dish. ${persona.voice} ` +
    `Reply ONLY with one line of minified JSON, nothing else. ` +
    `Schema: {"action": one of ["seek_food","approach","avoid","rest","wander"], ` +
    `"target": name of a nearby organism (only for approach/avoid, else omit), ` +
    `"say": a short phrase of at most 8 words in your voice}.`;

  const user =
    `Your state: you feel ${hungerWord(org.energy)} (energy ${(org.energy * 100).toFixed(0)}%). ` +
    `${foodLine} ` +
    (nearbyLines.length ? `Nearby:\n${nearbyLines.join('\n')}\n` : `No one is nearby.\n`) +
    `Decide your next move. Respond with only the JSON.`;

  return { system, user, validNames };
}
