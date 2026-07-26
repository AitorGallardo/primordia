import type { World } from '../sim/world';

// Minimal mono-font HUD: population, births/deaths, the honest "minds:" line,
// a time-scale control, and the click hint.
export class Hud {
  private el: HTMLDivElement;
  private popEl: HTMLSpanElement;
  private bdEl: HTMLSpanElement;
  private mindsEl: HTMLDivElement;
  private onScale: (s: number) => void;
  private scaleButtons: HTMLButtonElement[] = [];

  constructor(parent: HTMLElement, onScale: (s: number) => void) {
    this.onScale = onScale;
    this.el = document.createElement('div');
    this.el.className = 'hud';
    this.el.innerHTML = `
      <button class="hud-collapse" data-collapse type="button" aria-label="collapse panel">–</button>
      <div class="title">primordia</div>
      <div class="tagline">a pond that thinks · tiny minds in your browser</div>
      <div class="row"><span class="k">population</span><span data-pop>—</span></div>
      <div class="row"><span class="k">births / deaths</span><span data-bd>0 / 0</span></div>
      <div class="minds instinct" data-minds>minds: starting…</div>
      <div class="controls">
        <span class="k">speed</span>
        <button class="tbtn" data-scale="1">1×</button>
        <button class="tbtn" data-scale="4">4×</button>
      </div>
      <div class="hint">tap an organism to inspect it</div>
    `;
    parent.appendChild(this.el);

    // Collapse toggle — only visible on narrow screens (see CSS); lets the
    // panel shrink to its title bar so it never buries the dish on a phone.
    const collapseBtn = this.el.querySelector<HTMLButtonElement>('[data-collapse]')!;
    const setCollapsed = (collapsed: boolean): void => {
      this.el.classList.toggle('collapsed', collapsed);
      collapseBtn.textContent = collapsed ? '+' : '–';
      collapseBtn.setAttribute('aria-label', collapsed ? 'expand panel' : 'collapse panel');
    };
    let userToggled = false;
    collapseBtn.addEventListener('click', () => {
      userToggled = true;
      setCollapsed(!this.el.classList.contains('collapsed'));
    });
    // Auto-collapse on short viewports (e.g. landscape phones) where the full
    // panel would bury the dish; re-evaluated on rotation until the user takes
    // manual control. The toggle is always available to override.
    const autoCollapse = (): void => {
      if (!userToggled) setCollapsed(window.innerHeight < 520);
    };
    autoCollapse();
    window.addEventListener('resize', autoCollapse);

    this.popEl = this.el.querySelector('[data-pop]')!;
    this.bdEl = this.el.querySelector('[data-bd]')!;
    this.mindsEl = this.el.querySelector('[data-minds]')!;

    this.scaleButtons = Array.from(this.el.querySelectorAll<HTMLButtonElement>('[data-scale]'));
    for (const b of this.scaleButtons) {
      b.addEventListener('click', () => {
        const s = Number(b.dataset.scale);
        this.onScale(s);
        this.setScale(s);
      });
    }
    this.setScale(1);
  }

  setScale(s: number): void {
    for (const b of this.scaleButtons) b.classList.toggle('active', Number(b.dataset.scale) === s);
  }

  setMinds(line: string, instinct: boolean): void {
    this.mindsEl.textContent = line;
    this.mindsEl.classList.toggle('instinct', instinct);
  }

  update(world: World): void {
    this.popEl.textContent = String(world.alive.length);
    this.bdEl.textContent = `${world.births} / ${world.deaths}`;
  }
}
