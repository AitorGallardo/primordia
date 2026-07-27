import type { World } from '../sim/world';
import type { Organism } from '../sim/organism';
import type { Decision, ActionKind } from '../sim/types';
import { buildPrompt } from './promptBuilder';

export type MindState = 'off' | 'loading' | 'ready' | 'failed';

const ACTIONS: ActionKind[] = ['seek_food', 'approach', 'avoid', 'rest', 'wander'];

// Best-effort extraction of the tiny JSON the model was asked to emit.
export function parseDecision(text: string, validNames: string[]): Decision | null {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const o = obj as Record<string, unknown>;

  const action = String(o.action ?? '').toLowerCase().trim() as ActionKind;
  if (!ACTIONS.includes(action)) return null;

  let target: string | undefined;
  if (action === 'approach' || action === 'avoid') {
    const t = o.target != null ? String(o.target).trim() : '';
    // accept only if it names a real nearby organism
    target = validNames.find((n) => n.toLowerCase() === t.toLowerCase());
    if (!target) return null;
  }

  let say = o.say != null ? String(o.say).trim() : '';
  // clamp to 8 words, strip quotes/newlines
  say = say.replace(/\s+/g, ' ').replace(/^["']|["']$/g, '');
  if (say) say = say.split(' ').slice(0, 8).join(' ');

  return { action, target, say };
}

export interface MindsOptions {
  onStatus?: (state: MindState, line: string) => void;
}

export class Minds {
  state: MindState = 'off';
  backend: 'webgpu' | 'wasm' | null = null;
  private worker: Worker | null = null;
  private reqId = 0;
  private pending: Map<number, { org: Organism; validNames: string[]; timer: number }> = new Map();
  private rrIndex = 0;
  private loopTimer: number | null = null;
  private loadTimer: number | null = null;
  private opts: MindsOptions;

  constructor(private world: World, opts: MindsOptions = {}) {
    this.opts = opts;
  }

  statusLine(): string {
    switch (this.state) {
      case 'off':
        return 'minds: instinct mode (model not loaded)';
      case 'loading':
        return 'minds: loading SmolLM2-135M…';
      case 'ready':
        return `minds: SmolLM2-135M running in your browser (${this.backend?.toUpperCase()})`;
      case 'failed':
        return 'minds: instinct mode (model unavailable)';
    }
  }

  private emit(): void {
    this.opts.onStatus?.(this.state, this.statusLine());
  }

  // Called after the sim is already running.
  load(): void {
    if (this.state !== 'off') return;
    this.state = 'loading';
    this.emit();
    try {
      this.worker = new Worker(new URL('./mindsWorker.ts', import.meta.url), { type: 'module' });
    } catch (err) {
      this.fail(`worker spawn failed: ${String(err)}`);
      return;
    }
    this.worker.addEventListener('message', (ev) => this.onMessage(ev.data));
    this.worker.addEventListener('error', (ev) => this.fail(`worker error: ${ev.message}`));
    this.worker.postMessage({ type: 'init' });

    // If the download stalls or the network blocks the model, don't hang in
    // "loading" forever — fall back to instinct mode. The sim is already alive.
    this.loadTimer = window.setTimeout(() => {
      if (this.state === 'loading') this.fail('model load timed out');
    }, 180000);
  }

  private fail(reason: string): void {
    console.warn('[minds] falling back to instinct:', reason);
    if (this.loadTimer !== null) {
      clearTimeout(this.loadTimer);
      this.loadTimer = null;
    }
    this.state = 'failed';
    this.backend = null;
    this.emit();
  }

  private onMessage(data: {
    type: string;
    backend?: 'webgpu' | 'wasm';
    id?: number;
    ok?: boolean;
    text?: string;
    error?: string;
    status?: string;
    progress?: number;
    file?: string;
    message?: string;
  }): void {
    switch (data.type) {
      case 'progress': {
        if (data.status === 'progress' && typeof data.progress === 'number') {
          this.opts.onStatus?.('loading', `minds: loading SmolLM2-135M… ${Math.round(data.progress)}%`);
        }
        break;
      }
      case 'ready': {
        if (this.loadTimer !== null) {
          clearTimeout(this.loadTimer);
          this.loadTimer = null;
        }
        this.state = 'ready';
        this.backend = data.backend ?? 'wasm';
        this.emit();
        this.scheduleNext(600);
        break;
      }
      case 'warn': {
        console.warn('[minds]', data.message);
        break;
      }
      case 'error': {
        // The worker couldn't bring any backend up. Fall back to instinct now
        // instead of waiting out the load timeout.
        this.fail(data.error ?? 'model init failed');
        break;
      }
      case 'result': {
        this.handleResult(data.id!, data.ok === true, data.text ?? '', data.error);
        break;
      }
    }
  }

  private handleResult(id: number, ok: boolean, text: string, error?: string): void {
    const req = this.pending.get(id);
    if (!req) return;
    clearTimeout(req.timer);
    this.pending.delete(id);

    if (ok) {
      const decision = parseDecision(text, req.validNames);
      if (decision) {
        this.world.applyDecision(req.org, decision, 'model');
      } else {
        // parse failure => fall back to instinct for this organism
        this.world.instinctFor(req.org);
      }
    } else {
      if (error && error !== 'not-loaded') console.warn('[minds] generate error:', error);
      this.world.instinctFor(req.org);
    }
    // small gap before the next organism thinks
    this.scheduleNext(2400);
  }

  private scheduleNext(delayMs: number): void {
    if (this.loopTimer !== null) clearTimeout(this.loopTimer);
    this.loopTimer = window.setTimeout(() => this.think(), delayMs);
  }

  private think(): void {
    if (this.state !== 'ready' || !this.worker) return;
    const live = this.world.alive;
    if (live.length === 0) {
      this.scheduleNext(1500);
      return;
    }
    // round-robin over living organisms
    this.rrIndex = (this.rrIndex + 1) % live.length;
    const org = live[this.rrIndex];

    const prompt = buildPrompt(this.world, org);
    const id = ++this.reqId;
    this.world.markThinking(org);
    const timer = window.setTimeout(() => {
      // request took too long; drop it and move on with instinct
      if (this.pending.has(id)) {
        this.pending.delete(id);
        this.world.instinctFor(org);
        this.scheduleNext(1200);
      }
    }, 20000);
    this.pending.set(id, { org, validNames: prompt.validNames, timer });
    this.worker.postMessage({ type: 'generate', id, system: prompt.system, user: prompt.user });
  }

  dispose(): void {
    if (this.loopTimer !== null) clearTimeout(this.loopTimer);
    if (this.loadTimer !== null) clearTimeout(this.loadTimer);
    this.worker?.terminate();
  }
}
