import * as THREE from 'three';
import type { World } from '../sim/world';
import type { Organism } from '../sim/organism';
import type { Food } from '../sim/food';
import { CreatureView } from './creatureView';
import { Bonds } from './bonds';
import { foodTexture } from './glowTexture';

function dishTexture(radius: number): THREE.Texture {
  const s = 512;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, s, s);
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(16, 26, 32, 1)');
  g.addColorStop(0.6, 'rgba(9, 15, 20, 1)');
  g.addColorStop(0.92, 'rgba(6, 10, 14, 1)');
  g.addColorStop(1, 'rgba(3, 5, 7, 1)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  void radius;
  return tex;
}

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private raycaster = new THREE.Raycaster();
  private views = new Map<number, CreatureView>();
  private foodSprites = new Map<number, THREE.Sprite>();
  private bonds = new Bonds();
  private glowSprites: THREE.Sprite[] = [];

  // camera rig
  private target = new THREE.Vector3(0, 0, 0);
  private distance: number;
  private basePhi = 0.62;
  private baseTheta = -Math.PI / 2;
  private minD: number;
  private maxD: number;

  constructor(private container: HTMLElement, dishRadius: number) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setClearColor(0x03050a, 1);
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.FogExp2(0x03050a, 0.006);
    this.camera = new THREE.PerspectiveCamera(48, container.clientWidth / container.clientHeight, 0.1, 400);
    this.distance = dishRadius * 2.1;
    this.minD = dishRadius * 1.1;
    this.maxD = dishRadius * 3.2;

    // dish floor
    const floorGeo = new THREE.CircleGeometry(dishRadius * 1.02, 96);
    const floorMat = new THREE.MeshBasicMaterial({ map: dishTexture(dishRadius) });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.2;
    this.scene.add(floor);

    // rim glow ring
    const ringGeo = new THREE.RingGeometry(dishRadius * 0.99, dishRadius * 1.06, 128);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x1a3b44,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.15;
    this.scene.add(ring);

    this.scene.add(this.bonds.object);

    this.installControls();
    window.addEventListener('resize', () => this.resize());
  }

  // ---- entities --------------------------------------------------------
  addCreature(org: Organism): void {
    const v = new CreatureView(org);
    this.views.set(org.id, v);
    this.scene.add(v.group);
    this.glowSprites.push(v.glow);
  }

  removeCreature(org: Organism): void {
    const v = this.views.get(org.id);
    if (!v) return;
    this.scene.remove(v.group);
    v.dispose();
    this.views.delete(org.id);
    this.glowSprites = this.glowSprites.filter((s) => s !== v.glow);
  }

  addFood(f: Food): void {
    const mat = new THREE.SpriteMaterial({
      map: foodTexture(),
      color: 0xaef7c8,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.9,
    });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(1.1);
    s.position.set(f.pos.x, 0.15, f.pos.y);
    this.foodSprites.set(f.id, s);
    this.scene.add(s);
  }

  removeFood(f: Food): void {
    const s = this.foodSprites.get(f.id);
    if (!s) return;
    this.scene.remove(s);
    (s.material as THREE.SpriteMaterial).dispose();
    this.foodSprites.delete(f.id);
  }

  // ---- per-frame -------------------------------------------------------
  updateFrame(world: World, time: number): void {
    for (const v of this.views.values()) v.update(time);
    for (const f of world.food) {
      const s = this.foodSprites.get(f.id);
      if (s) {
        s.position.set(f.pos.x, 0.15, f.pos.y);
        const life = 1 - f.age / f.life;
        (s.material as THREE.SpriteMaterial).opacity = 0.35 + Math.max(0, Math.min(1, life)) * 0.55;
      }
    }
    this.bonds.update(world);
    this.updateCamera(time);
    this.renderer.render(this.scene, this.camera);
  }

  private updateCamera(time: number): void {
    // slow ambient drift
    const theta = this.baseTheta + Math.sin(time * 0.04) * 0.13 + time * 0.006;
    const phi = this.basePhi + Math.sin(time * 0.03) * 0.03;
    const sinPhi = Math.sin(phi);
    this.camera.position.set(
      this.target.x + this.distance * sinPhi * Math.cos(theta),
      this.target.y + this.distance * Math.cos(phi),
      this.target.z + this.distance * sinPhi * Math.sin(theta),
    );
    this.camera.lookAt(this.target);
  }

  // ---- picking / projection -------------------------------------------
  pick(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.params.Sprite = { threshold: 0 } as never;
    const hits = this.raycaster.intersectObjects(this.glowSprites, false);
    if (hits.length > 0) {
      return (hits[0].object.userData.organismId as number) ?? null;
    }
    return null;
  }

  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
      visible: v.z < 1,
    };
  }

  // ---- controls --------------------------------------------------------
  private installControls(): void {
    const el = this.renderer.domElement;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
    });
    window.addEventListener('pointerup', () => {
      dragging = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const panScale = this.distance * 0.0016;
      // pan in the camera's ground plane (approx, ignoring drift azimuth)
      this.target.x -= dx * panScale;
      this.target.z -= dy * panScale;
      const r = Math.hypot(this.target.x, this.target.z);
      const maxPan = 20;
      if (r > maxPan) {
        this.target.x *= maxPan / r;
        this.target.z *= maxPan / r;
      }
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.distance = Math.max(this.minD, Math.min(this.maxD, this.distance * (1 + Math.sign(e.deltaY) * 0.08)));
      },
      { passive: false },
    );
  }

  resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}
