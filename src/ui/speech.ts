import type { World } from '../sim/world';
import type { Stage } from '../render/stage';

// Ephemeral speech bubbles projected above each organism. Instinct lines are
// visually marked so model output is never faked.
export class SpeechLayer {
  private layer: HTMLDivElement;
  private bubbles = new Map<number, HTMLDivElement>();

  constructor(parent: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'speech-layer';
    parent.appendChild(this.layer);
  }

  update(world: World, stage: Stage): void {
    const seen = new Set<number>();
    for (const org of world.alive) {
      if (!org.speech) continue;
      seen.add(org.id);
      let b = this.bubbles.get(org.id);
      if (!b) {
        b = document.createElement('div');
        this.layer.appendChild(b);
        this.bubbles.set(org.id, b);
      }
      const instinct = org.speech.source === 'instinct';
      b.className = `bubble${instinct ? ' instinct' : ''}`;
      b.innerHTML = instinct
        ? `${escapeHtml(org.speech.text)}<span class="tag">instinct</span>`
        : escapeHtml(org.speech.text);

      const p = stage.project(org.pos.x, org.traits.size + 1.2, org.pos.y);
      if (p.visible) {
        b.style.display = 'block';
        b.style.left = `${p.x}px`;
        b.style.top = `${p.y}px`;
      } else {
        b.style.display = 'none';
      }
    }
    // remove stale bubbles
    for (const [id, b] of this.bubbles) {
      if (!seen.has(id)) {
        b.remove();
        this.bubbles.delete(id);
      }
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
