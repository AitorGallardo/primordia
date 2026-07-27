import './style.css';
import { installErrorReporter } from './diag';
import { World } from './sim/world';
import { Stage } from './render/stage';
import { Hud } from './ui/hud';
import { SpeechLayer } from './ui/speech';
import { Inspect } from './ui/inspect';
import { Minds } from './ai/minds';

// Wire the on-page error reporter before anything else can throw, so any
// failure during boot surfaces as a visible line instead of a dead splash.
installErrorReporter();

const app = document.getElementById('app')!;

// boot veil
const boot = document.createElement('div');
boot.className = 'boot';
boot.textContent = 'assembling primordia…';
app.appendChild(boot);

function clearBoot(): void {
  boot.classList.add('gone');
  setTimeout(() => boot.remove(), 700);
}

// Failsafe: whatever happens (a throw during setup, a wedged first frame, an
// unsupported API on some browser), the veil must never linger. If the normal
// first-frame clear hasn't fired within 10s, drop it and show whatever we have.
const bootFailsafe = window.setTimeout(clearBoot, 10000);

const DISH_RADIUS = 34;
const stage = new Stage(app, DISH_RADIUS);

const world = new World(Math.floor(Math.random() * 1e9), DISH_RADIUS, {
  onBirth: (o) => stage.addCreature(o),
  onDeath: () => {},
  onFoodAdded: (f) => stage.addFood(f),
  onFoodRemoved: (f) => stage.removeFood(f),
});

// initial population 10–16
world.populate(12 + Math.floor(Math.random() * 5));

const hud = new Hud(app, (s) => {
  world.timeScale = s;
});
const speech = new SpeechLayer(app);
const inspect = new Inspect(app);
const minds = new Minds(world, {
  onStatus: (state, line) => hud.setMinds(line, state !== 'ready'),
});
hud.setMinds(minds.statusLine(), true);

// ---- picking: distinguish a click from a drag ----
let downX = 0;
let downY = 0;
let downT = 0;
stage.renderer.domElement.addEventListener('pointerdown', (e) => {
  downX = e.clientX;
  downY = e.clientY;
  downT = performance.now();
});
stage.renderer.domElement.addEventListener('pointerup', (e) => {
  if (stage.isGesturing) return; // ignore taps that are part of a pinch gesture
  const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
  if (moved < 6 && performance.now() - downT < 450) {
    const id = stage.pick(e.clientX, e.clientY);
    if (id != null) {
      const org = world.organisms.find((o) => o.id === id) ?? null;
      inspect.select(org);
    } else {
      inspect.select(null);
    }
  }
});

// remove dead creature views once fully decayed
function reapViews(): void {
  for (const o of world.organisms) {
    if (!o.alive && o.decay >= 1) stage.removeCreature(o);
  }
}

// ---- main loop ----
let last = performance.now();
let uiAccum = 0;
let started = false;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = (now - last) / 1000;
  last = now;

  if (document.hidden) return; // pause simulation when tab is hidden

  world.update(dt);
  reapViews();
  stage.updateFrame(world, world.time);
  speech.update(world, stage);

  // throttle text-heavy UI to ~8 Hz
  uiAccum += dt;
  if (uiAccum > 0.12) {
    uiAccum = 0;
    hud.update(world);
    inspect.update(world);
  }

  if (!started) {
    started = true;
    clearTimeout(bootFailsafe);
    clearBoot();
    // lazily wake the minds once the pond is already alive.
    // ?minds=off keeps the world on pure instinct (handy for a quick look,
    // low-power devices, or offline).
    const mindsOff = new URLSearchParams(location.search).get('minds') === 'off';
    if (mindsOff) hud.setMinds('minds: instinct mode (disabled via ?minds=off)', true);
    else setTimeout(() => minds.load(), 2500);
  }
}
requestAnimationFrame(frame);

// keep dt sane when returning to a hidden tab
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) last = performance.now();
});

// expose for debugging in the console
(window as unknown as { primordia: unknown }).primordia = { world, stage, minds };
