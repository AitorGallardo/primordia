# primordia

A tiny living world in your browser. A petri dish seen from above, with 10–20
little organisms that wander, eat, bond, feud, reproduce, and die. Each one is
procedurally unique — its body, colour, size, motion and name are grown from a
single seed, so no two are ever the same.

The twist: their *minds* are a real open-source language model running entirely
in your browser. No API keys, no server, no telemetry. When you load the page,
the simulation starts immediately on hand-written instincts; a few seconds later
a small model wakes up and starts nudging their intentions and giving them a
voice.

Live demo: https://aitorgallardo.github.io/primordia/

## The honest architecture

I want to be precise about what is and isn't AI here, because it's easy to
oversell this kind of thing.

- **The body is steering behaviors.** Every frame, each organism runs classic
  wander / seek / flee / separate steering, plus hunger, an affinity matrix for
  relationships, reproduction and death. This is deterministic-ish, cheap, and
  it holds 60fps. The pond is fully alive with the model switched off — try
  `?minds=off` and you'll see births, deaths, bonds and rivalries with zero AI.

- **The voice and intent is a language model.** Once the sim is running,
  `SmolLM2-135M-Instruct` (an open ~135M model) loads lazily via
  [transformers.js](https://github.com/huggingface/transformers.js) on WebGPU,
  falling back to WASM. Round-robin, one organism "thinks" every few seconds: I
  build a small prompt from its state (personality, hunger, nearby food and
  neighbours, relationships) and ask for a tiny JSON action plus one short line
  to say. That action biases its steering weights for the next ~10 seconds, and
  the line appears as a speech bubble.

It's **one small model wearing different personas** — curious, grumpy, poetic,
anxious, greedy, gentle, stoic — so a single 135M model produces many voices.
I'm not claiming these creatures are conscious or that a 135M model is smart.
It's small and it says silly things. That's part of the charm.

### The JSON contract, and its failure mode

The model is asked to reply with one line like:

```json
{ "action": "seek_food", "say": "so hungry" }
```

Valid actions are `seek_food`, `approach:<name>`, `avoid:<name>`, `rest`,
`wander`. I parse this defensively — extract the JSON, validate the action
against the enum, check that any named target is actually a real nearby
organism, clamp `say` to 8 words. **On any parse failure, timeout, or if the
model never loads, that organism falls back to instinct** and says a canned,
clearly-labelled one-liner. The UI never presents instinct output as model
output: the HUD states exactly what's running, speech bubbles from instinct are
visually marked, and the inspect card tells you whether each organism's last
thought came from the model or from instinct.

## Controls

- **Drag** to pan, **scroll** to zoom.
- **Click / tap an organism** to open an inspect card (name, age, energy,
  traits, bonds, and its last thought + source).
- **Speed** toggle in the HUD: 1× / 4×.
- The **`minds:`** HUD line always tells you the truth about what's running.
- Add **`?minds=off`** to the URL to keep it on pure instinct (useful on
  low-power devices or offline).

The tab pauses when it's hidden, and pixel ratio is capped at 2, to stay light.

## Stack

- [three.js](https://threejs.org/) for the 2.5D scene (sprite glow instead of a
  full bloom pass, procedural blob/segmented bodies via a small shader).
- [@huggingface/transformers](https://github.com/huggingface/transformers.js)
  for in-browser inference, running in a Web Worker so the model never blocks
  the render loop.
- Vanilla TypeScript + Vite. No framework. Built and run with
  [bun](https://bun.sh).

## Run it

```bash
bun install
bun run dev      # http://localhost:5173/primordia/
bun run build    # type-check + production build to dist/
```

## License

MIT — see [LICENSE](./LICENSE).
