import * as THREE from 'three';
import type { Organism } from '../sim/organism';
import { glowTexture } from './glowTexture';

// Shared flat disc geometry (unit radius, in local XY plane).
const bodyGeo = new THREE.CircleGeometry(1, 56);

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uWiggleFreq;
  uniform float uWiggleAmp;
  uniform float uSeed;
  varying float vRadius;
  void main() {
    float r = length(position.xy);
    float a = atan(position.xy.y, position.xy.x);
    float wob =
      sin(a * 3.0 + uTime * uWiggleFreq + uSeed) * 0.6 +
      sin(a * 5.0 - uTime * uWiggleFreq * 0.7 + uSeed * 1.7) * 0.4;
    vec3 p = position;
    p.xy *= 1.0 + wob * uWiggleAmp * r;
    vRadius = r;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uCore;
  uniform float uBrightness;
  uniform float uOpacity;
  varying float vRadius;
  void main() {
    float edge = smoothstep(1.0, 0.5, vRadius);
    vec3 col = mix(uCore, uColor, smoothstep(0.0, 0.75, vRadius));
    col *= 0.45 + uBrightness * 0.85;
    float alpha = edge * uOpacity;
    gl_FragColor = vec4(col, alpha);
  }
`;

function makeBodyMaterial(org: Organism): THREE.ShaderMaterial {
  const p = org.traits.palette;
  const base = new THREE.Color().setHSL(p.hue, p.sat, p.light);
  const core = new THREE.Color().setHSL(p.hue, Math.min(1, p.sat * 0.7), Math.min(0.85, p.light + 0.28));
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWiggleFreq: { value: org.traits.wiggleFreq },
      uWiggleAmp: { value: org.traits.wiggleAmp },
      uSeed: { value: (org.traits.seed % 1000) / 100 },
      uColor: { value: base },
      uCore: { value: core },
      uBrightness: { value: 1 },
      uOpacity: { value: 1 },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
  });
}

export class CreatureView {
  readonly group = new THREE.Group();
  readonly glow: THREE.Sprite;
  private materials: THREE.ShaderMaterial[] = [];
  private segments: THREE.Mesh[] = [];
  private baseGlowScale: number;

  constructor(public org: Organism) {
    const p = org.traits.palette;
    // additive glow sprite (cheap bloom)
    const glowColor = new THREE.Color().setHSL(p.glowHue, Math.min(1, p.sat + 0.1), 0.6);
    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture(),
      color: glowColor,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.glow = new THREE.Sprite(glowMat);
    this.baseGlowScale = org.traits.size * 5.2;
    this.glow.scale.setScalar(this.baseGlowScale);
    this.glow.position.y = 0.2;
    this.glow.userData.organismId = org.id;
    this.group.add(this.glow);

    // body: one blob, or a short chain for segmented
    const count = org.traits.bodyKind === 'segmented' ? org.traits.segments : 1;
    for (let i = 0; i < count; i++) {
      const mat = makeBodyMaterial(org);
      const mesh = new THREE.Mesh(bodyGeo, mat);
      mesh.rotation.x = -Math.PI / 2; // lay flat on XZ
      const scale = org.traits.size * (count === 1 ? 1 : 1 - i * 0.13);
      mesh.scale.setScalar(scale);
      mesh.renderOrder = 2;
      this.materials.push(mat);
      this.segments.push(mesh);
      this.group.add(mesh);
    }
    this.glow.renderOrder = 1;
  }

  update(time: number): void {
    const org = this.org;
    // world mapping: sim (x, y) -> world (x, bob, y)
    const bob = Math.sin(time * org.traits.wiggleFreq * 0.6 + org.id) * 0.15;
    const sinkY = org.alive ? bob : bob - org.decay * 6;
    this.group.position.set(org.pos.x, sinkY, org.pos.y);

    const brightness = org.brightness;
    const opacity = org.alive ? 1 : 1 - org.decay;

    // segment chain trails behind heading
    const heading = Math.atan2(org.vel.y, org.vel.x);
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (i > 0) {
        const back = i * org.traits.size * 0.8;
        seg.position.set(-Math.cos(heading) * back, 0.01 * i, -Math.sin(heading) * back);
      }
      const mat = this.materials[i];
      mat.uniforms.uTime.value = time;
      mat.uniforms.uBrightness.value = brightness;
      mat.uniforms.uOpacity.value = opacity;
    }

    const glowMat = this.glow.material as THREE.SpriteMaterial;
    glowMat.opacity = (0.35 + brightness * 0.5) * opacity;
    this.glow.scale.setScalar(this.baseGlowScale * (0.85 + brightness * 0.3));
  }

  dispose(): void {
    for (const m of this.materials) m.dispose();
    (this.glow.material as THREE.SpriteMaterial).dispose();
  }
}
