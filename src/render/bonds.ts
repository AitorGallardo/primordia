import * as THREE from 'three';
import type { World } from '../sim/world';

// Faint threads drawn between bonded pairs when they are close.
export class Bonds {
  readonly object: THREE.LineSegments;
  private positions: Float32Array;
  private colors: Float32Array;
  private geo: THREE.BufferGeometry;
  private maxPairs = 64;

  constructor() {
    this.positions = new Float32Array(this.maxPairs * 2 * 3);
    this.colors = new Float32Array(this.maxPairs * 2 * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const mat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.object = new THREE.LineSegments(this.geo, mat);
    this.object.renderOrder = 0;
    this.object.frustumCulled = false;
  }

  update(world: World): void {
    const live = world.alive;
    let pair = 0;
    const range = 12;
    for (let i = 0; i < live.length && pair < this.maxPairs; i++) {
      const a = live[i];
      for (let j = i + 1; j < live.length && pair < this.maxPairs; j++) {
        const b = live[j];
        const v = world.rel.get(a.name, b.name);
        if (v <= 0.45) continue;
        const dx = a.pos.x - b.pos.x;
        const dz = a.pos.y - b.pos.y;
        const d = Math.hypot(dx, dz);
        if (d > range) continue;

        const fade = (1 - d / range) * (v - 0.45) * 2;
        const o = pair * 6;
        this.positions[o] = a.pos.x;
        this.positions[o + 1] = 0.05;
        this.positions[o + 2] = a.pos.y;
        this.positions[o + 3] = b.pos.x;
        this.positions[o + 4] = 0.05;
        this.positions[o + 5] = b.pos.y;

        // soft warm-neutral thread, brightness by bond strength/closeness
        const c = Math.min(1, 0.15 + fade * 0.7);
        for (let k = 0; k < 2; k++) {
          this.colors[o + k * 3] = c * 0.6;
          this.colors[o + k * 3 + 1] = c * 0.85;
          this.colors[o + k * 3 + 2] = c;
        }
        pair++;
      }
    }
    this.geo.setDrawRange(0, pair * 2);
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }
}
