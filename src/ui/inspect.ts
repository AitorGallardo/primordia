import type { World } from '../sim/world';
import type { Organism } from '../sim/organism';

// Small live inspect card for the currently selected organism.
export class Inspect {
  private el: HTMLDivElement;
  private current: Organism | null = null;

  constructor(parent: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'inspect hidden';
    parent.appendChild(this.el);
  }

  select(org: Organism | null): void {
    this.current = org;
    if (!org) this.el.classList.add('hidden');
  }

  get selectedId(): number | null {
    return this.current?.id ?? null;
  }

  update(world: World): void {
    const org = this.current;
    if (!org) return;
    if (!org.alive && org.decay >= 1) {
      this.select(null);
      return;
    }
    this.el.classList.remove('hidden');

    const t = org.traits;
    const rels = world.rel.relationsOf(org.name, world.alive.map((o) => o.name)).slice(0, 4);
    const relHtml = rels.length
      ? rels
          .map((r) => {
            const cls = r.value > 0 ? 'bond-pos' : 'bond-neg';
            const label = r.value > 0 ? 'bond' : 'rival';
            return `<div class="line"><span>${escapeHtml(r.name)}</span><span class="${cls}">${label} ${r.value.toFixed(2)}</span></div>`;
          })
          .join('')
      : `<div class="line"><span class="k">no strong ties yet</span></div>`;

    const th = org.lastThought;
    let thoughtHtml = `<div class="k">—</div>`;
    if (th) {
      const srcCls = th.source === 'model' ? 'model' : 'instinct';
      const srcLabel = th.source === 'model' ? 'via model' : 'via instinct';
      const body = th.text ? `“${escapeHtml(th.text)}”` : `<span class="k">${escapeHtml(th.action)}${th.target ? ' → ' + escapeHtml(th.target) : ''}</span>`;
      thoughtHtml = `<div class="thought">${body}</div><div class="src ${srcCls}">${srcLabel} · ${escapeHtml(th.action)}${th.target ? ' → ' + escapeHtml(th.target) : ''}</div>`;
    }

    this.el.innerHTML = `
      <div class="head">
        <span class="name">${escapeHtml(org.name)}</span>
        <button class="close" data-close>×</button>
      </div>
      <div class="line"><span class="k">persona</span><span>${escapeHtml(t.persona.label)}</span></div>
      <div class="line"><span class="k">age</span><span>${org.age.toFixed(0)}s · gen ${org.generation}</span></div>
      <div class="line"><span class="k">body</span><span>${t.bodyKind}${t.bodyKind === 'segmented' ? ' ×' + t.segments : ''}</span></div>
      <div class="k" style="margin-top:6px">energy</div>
      <div class="bar"><i style="width:${Math.max(0, org.energy * 100).toFixed(0)}%"></i></div>
      <div class="section">
        <div class="h">traits</div>
        <div class="line"><span class="k">size</span><span>${t.size.toFixed(2)}</span></div>
        <div class="line"><span class="k">boldness</span><span>${t.boldness.toFixed(2)}</span></div>
        <div class="line"><span class="k">sociability</span><span>${t.sociability.toFixed(2)}</span></div>
      </div>
      <div class="section">
        <div class="h">bonds</div>
        ${relHtml}
      </div>
      <div class="section">
        <div class="h">last thought</div>
        ${thoughtHtml}
      </div>
    `;
    this.el.querySelector('[data-close]')?.addEventListener('click', () => this.select(null));
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
