/**
 * scene.ts — Three.js 3D visualization layer for the PyTorch Sandbox.
 *
 * A GAME-LIKE, juicy take on tensor / training visualization. Self-contained:
 * defines its own input interfaces, imports ONLY `three` and the OrbitControls
 * addon, and generates all textures procedurally (canvas). Exposes a single
 * `Visualizer` class that owns the renderer, scene, camera, controls and the
 * render loop.
 *
 * Aesthetic: a procedural starfield sky, a PyTorch-orange value ramp with a
 * cool cyan complement, glowing cubes that fly in along a Bézier arc with a
 * cosine-bounce scale and a particle trail,
 * stardust particle bursts, hover highlighting, and a
 * comet-headed glowing loss curve.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* ------------------------------------------------------------------ *
 * Public input interfaces  (DO NOT CHANGE — the rest of the app depends on these)
 * ------------------------------------------------------------------ */

export interface TensorData {
  name: string;
  shape: number[];
  dtype: string;
  data: any;
  truncated: boolean;
}

export interface RegressionData {
  x: number[];
  y: number[];
  yPred: number[];
}

export interface ClassificationData {
  points: [number, number][];
  labels: number[];
  grid: { xs: number[]; ys: number[]; probs: number[][] };
}

/* ------------------------------------------------------------------ *
 * Palette
 * ------------------------------------------------------------------ */

// PyTorch brand orange + a cool cyan complement.
const ORANGE = 0xee4c2c;
const ORANGE_HOT = 0xff6a40;
const ORANGE_AMBER = 0xf97316;
const CYAN = 0x4ecdc4;

/** value→color ramp: cool cyan → teal → amber → hot orange. */
const MAGMA_STOPS: THREE.Color[] = [
  new THREE.Color(0x0b1d2a),
  new THREE.Color(CYAN),
  new THREE.Color(0x2aa3a0),
  new THREE.Color(ORANGE_AMBER),
  new THREE.Color(ORANGE),
  new THREE.Color(ORANGE_HOT),
];

/** accent ramp for curves: amber → orange → hot. */
const ACCENT_STOPS: THREE.Color[] = [
  new THREE.Color(CYAN),
  new THREE.Color(ORANGE_AMBER),
  new THREE.Color(ORANGE),
  new THREE.Color(ORANGE_HOT),
];

const _scratchColor = new THREE.Color();

function clamp01(t: number): number {
  if (!Number.isFinite(t)) return 0;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Sample a multi-stop gradient at t in [0,1], writing into `out`. */
function sampleRamp(stops: THREE.Color[], t: number, out: THREE.Color): THREE.Color {
  t = clamp01(t);
  if (stops.length === 1) return out.copy(stops[0]);
  const scaled = t * (stops.length - 1);
  const i = Math.min(Math.floor(scaled), stops.length - 2);
  const f = scaled - i;
  return out.copy(stops[i]).lerp(stops[i + 1], f);
}

function rampColor(t: number, out: THREE.Color = _scratchColor): THREE.Color {
  return sampleRamp(MAGMA_STOPS, t, out);
}

function accentColor(t: number, out: THREE.Color = _scratchColor): THREE.Color {
  return sampleRamp(ACCENT_STOPS, t, out);
}

/** Two-class diverging map: blue (0) ↔ white (0.5) ↔ orange/red (1). */
function divergingColor(t: number, out: THREE.Color = _scratchColor): THREE.Color {
  t = clamp01(t);
  const blue = new THREE.Color(0x2a7bd6);
  const white = new THREE.Color(0xf4f4fb);
  const hot = new THREE.Color(ORANGE);
  if (t < 0.5) return out.copy(blue).lerp(white, t * 2);
  return out.copy(white).lerp(hot, (t - 0.5) * 2);
}

/* ------------------------------------------------------------------ *
 * Numeric helpers
 * ------------------------------------------------------------------ */

interface MinMax {
  min: number;
  max: number;
}

function minMax(values: number[]): MinMax {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: 0, max: 1 };
  }
  return { min, max };
}

/** Normalize v into [0,1] given a range; degenerate range → 0.5. */
function normalize(v: number, range: MinMax): number {
  const span = range.max - range.min;
  if (span <= 1e-9 || !Number.isFinite(span)) return 0.5;
  return clamp01((v - range.min) / span);
}

/** Recursively flatten an arbitrarily-nested numeric array. */
function flattenDeep(data: any, out: number[]): void {
  if (Array.isArray(data)) {
    for (const d of data) flattenDeep(d, out);
  } else if (typeof data === 'number') {
    out.push(data);
  } else if (typeof data === 'boolean') {
    out.push(data ? 1 : 0);
  }
  // ignore anything else (null/undefined/strings)
}

/** Compact numeric formatting for value labels (~2-3 sig digits). */
function formatValue(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (Number.isInteger(v) && a < 1e4) return String(v);
  if (a >= 1e4 || a < 1e-3) return v.toExponential(1);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2);
}

/* ------------------------------------------------------------------ *
 * Easing functions
 * ------------------------------------------------------------------ */

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Cosine-based bounce: a damped cosine oscillation that overshoots past 1 and
 * settles, giving a lively, springy "boing" feel. Amplitude decays as (1-t)^p.
 */
function easeOutBounceCos(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  // 2.5 half-cycles of cosine → a couple of visible bounces; (1-t)^2.2 damps them.
  return 1 - Math.cos(t * Math.PI * 2.5) * Math.pow(1 - t, 2.2);
}

/** Evaluate a cubic Bézier P0→P1→P2→P3 at t, writing into `out`. */
function cubicBezier(
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  p3: THREE.Vector3,
  t: number,
  out: THREE.Vector3
): THREE.Vector3 {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  out.set(0, 0, 0);
  out.addScaledVector(p0, uu * u);
  out.addScaledVector(p1, 3 * uu * t);
  out.addScaledVector(p2, 3 * u * tt);
  out.addScaledVector(p3, tt * t);
  return out;
}

/**
 * Control points for a curved flight path from `start` to `end`: lift the
 * midpoints upward and spread them sideways so the box swoops in along an arc
 * rather than a straight line.
 */
function bezierControls(
  start: THREE.Vector3,
  end: THREE.Vector3
): { c1: THREE.Vector3; c2: THREE.Vector3 } {
  const dir = end.clone().sub(start);
  const len = Math.max(dir.length(), 1e-3);
  const up = new THREE.Vector3(0, 1, 0);
  const perp = new THREE.Vector3().crossVectors(dir, up);
  if (perp.lengthSq() < 1e-4) perp.set(1, 0, 0);
  perp.normalize();
  const lift = len * 0.5;
  const lat = (Math.random() - 0.5) * len * 0.7;
  const c1 = start
    .clone()
    .addScaledVector(dir, 0.33)
    .addScaledVector(up, lift)
    .addScaledVector(perp, lat * 0.5);
  const c2 = start
    .clone()
    .addScaledVector(dir, 0.66)
    .addScaledVector(up, lift * 0.7)
    .addScaledVector(perp, lat);
  return { c1, c2 };
}

/* ------------------------------------------------------------------ *
 * Procedural textures (built once, shared, never disposed per-dataset)
 * ------------------------------------------------------------------ */

/** A vertical-gradient starfield used as an equirect scene background. */
function makeStarfieldTexture(): THREE.Texture {
  const w = 2048;
  const h = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const fallback = new THREE.Texture(canvas);
    fallback.needsUpdate = true;
    return fallback;
  }

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0.0, '#05060f');
  grad.addColorStop(0.4, '#0c0a24');
  grad.addColorStop(0.75, '#1a1238');
  grad.addColorStop(1.0, '#241a3d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Faint orange nebula glows for warmth.
  const nebula = (cx: number, cy: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  };
  nebula(w * 0.25, h * 0.35, 360, 'rgba(238,76,44,0.12)');
  nebula(w * 0.72, h * 0.55, 420, 'rgba(78,205,196,0.08)');
  nebula(w * 0.5, h * 0.2, 300, 'rgba(249,115,22,0.07)');

  const starTints = ['#ffffff', '#cfe0ff', '#ffd9b0', '#bfeaff', '#ffe9d6'];
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = Math.random() * Math.random() * 1.8 + 0.2;
    const a = 0.25 + Math.random() * 0.75;
    ctx.globalAlpha = a;
    ctx.fillStyle = starTints[(Math.random() * starTints.length) | 0];
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    // occasional twinkle cross
    if (r > 1.4 && Math.random() < 0.25) {
      ctx.globalAlpha = a * 0.5;
      ctx.fillRect(x - r * 3, y - 0.4, r * 6, 0.8);
      ctx.fillRect(x - 0.4, y - r * 3, 0.8, r * 6);
    }
  }
  ctx.globalAlpha = 1;

  const tex = new THREE.Texture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** A soft radial-gradient sprite texture for glows / particles. */
function makeRadialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)'): THREE.Texture {
  const s = 128;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0.0, inner);
    g.addColorStop(0.35, inner);
    g.addColorStop(1.0, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  }
  const tex = new THREE.Texture(canvas);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ------------------------------------------------------------------ *
 * Stardust particle field (juice)
 * ------------------------------------------------------------------ */

class StardustField {
  readonly points: THREE.Points;
  private positions: Float32Array;
  private colors: Float32Array;
  private baseColors: Float32Array;
  private velocities: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private geometry: THREE.BufferGeometry;
  private material: THREE.PointsMaterial;
  private capacity: number;
  private cursor = 0;
  private live = 0;

  constructor(capacity: number, texture: THREE.Texture) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.baseColors = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setDrawRange(0, 0);

    this.material = new THREE.PointsMaterial({
      size: 0.6,
      map: texture,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.9,
      sizeAttenuation: true,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** Emit `n` particles around a center with the given color tint. */
  burst(center: THREE.Vector3, color: THREE.Color, n: number, speed = 4): void {
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      if (this.live < this.capacity) this.live++;

      const i3 = i * 3;
      this.positions[i3] = center.x + (Math.random() - 0.5) * 0.6;
      this.positions[i3 + 1] = center.y + (Math.random() - 0.5) * 0.6;
      this.positions[i3 + 2] = center.z + (Math.random() - 0.5) * 0.6;

      // random outward direction on a sphere
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const sp = speed * (0.3 + Math.random() * 0.7);
      this.velocities[i3] = Math.sin(phi) * Math.cos(theta) * sp;
      this.velocities[i3 + 1] = Math.abs(Math.cos(phi)) * sp * 0.8 + 0.5;
      this.velocities[i3 + 2] = Math.sin(phi) * Math.sin(theta) * sp;

      const tint = _scratchColor.copy(color).offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.2);
      this.baseColors[i3] = tint.r;
      this.baseColors[i3 + 1] = tint.g;
      this.baseColors[i3 + 2] = tint.b;
      this.colors[i3] = tint.r;
      this.colors[i3 + 1] = tint.g;
      this.colors[i3 + 2] = tint.b;

      const ml = 0.7 + Math.random() * 0.9;
      this.life[i] = ml;
      this.maxLife[i] = ml;
    }
    this.geometry.setDrawRange(0, this.capacity);
  }

  update(dt: number): void {
    if (this.live === 0) return;
    let anyLive = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) {
        continue;
      }
      anyLive = true;
      this.life[i] -= dt;
      const i3 = i * 3;
      // gentle gravity + drag
      this.velocities[i3 + 1] -= 3.0 * dt;
      this.velocities[i3] *= 1 - 1.5 * dt;
      this.velocities[i3 + 2] *= 1 - 1.5 * dt;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] += this.velocities[i3 + 1] * dt;
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;

      // fade smoothly over life: additive blend → dimming toward black vanishes
      const f = clamp01(this.life[i] / Math.max(this.maxLife[i], 1e-3));
      this.colors[i3] = this.baseColors[i3] * f;
      this.colors[i3 + 1] = this.baseColors[i3 + 1] * f;
      this.colors[i3 + 2] = this.baseColors[i3 + 2] * f;
    }
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    if (!anyLive) this.live = 0;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* ------------------------------------------------------------------ *
 * Hover-tracking metadata stored on interactive meshes.
 * ------------------------------------------------------------------ */

interface HoverInfo {
  baseScale: THREE.Vector3;
  baseEmissive: number;
  pulsePhase: number;
}

/* ------------------------------------------------------------------ *
 * Visualizer
 * ------------------------------------------------------------------ */

export class Visualizer {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock: THREE.Clock;
  private lastElapsed = 0;

  /** Group that holds everything we add/remove per dataset. */
  private dataGroup: THREE.Group;
  /** Persistent helpers (grid) we never clear. */
  private helpersGroup: THREE.Group;

  /** Reusable shared geometry. */
  private boxGeometry: THREE.BoxGeometry;
  private edgesGeometry: THREE.EdgesGeometry;
  private sphereGeometry: THREE.SphereGeometry;

  /** Shared textures — built once, never disposed per dataset. */
  private skyTexture: THREE.Texture;
  private glowTexture: THREE.Texture;
  private dustTexture: THREE.Texture;

  private stardust: StardustField;

  private rafId: number | null = null;
  private disposed = false;

  /** Active animations (transitions) ticked each frame; return false to cull. */
  private animations: Array<(elapsed: number, dt: number) => boolean> = [];

  /** Tracks user interaction to gate the subtle idle auto-rotate. */
  private lastInteractionTime = -1000;
  private autoRotateEnabled = true;

  /** Interactive cubes for hover raycasting. */
  private interactives: THREE.Mesh[] = [];
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerActive = false;
  private hovered: THREE.Mesh | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private onPointerMove: (e: PointerEvent) => void;
  private onPointerLeave: () => void;
  private onControlsStart: () => void;

  constructor(container: HTMLElement) {
    this.container = container;
    this.clock = new THREE.Clock();

    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);

    // Renderer ------------------------------------------------------
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvas = this.renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    // Scene ---------------------------------------------------------
    this.scene = new THREE.Scene();
    this.skyTexture = makeStarfieldTexture();
    this.scene.background = this.skyTexture;
    this.scene.fog = new THREE.Fog(0x0c0a24, 40, 140);

    this.glowTexture = makeRadialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');
    this.dustTexture = makeRadialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

    // Camera --------------------------------------------------------
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    this.camera.position.set(14, 12, 18);
    this.camera.lookAt(0, 0, 0);

    // Controls ------------------------------------------------------
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.rotateSpeed = 0.7;
    this.controls.zoomSpeed = 0.9;
    this.controls.maxDistance = 220;
    this.controls.minDistance = 2.5;
    this.controls.target.set(0, 0, 0);
    this.onControlsStart = () => {
      this.lastInteractionTime = this.clock.getElapsedTime();
    };
    this.controls.addEventListener('start', this.onControlsStart);

    // Lighting ------------------------------------------------------
    this.setupLights();

    // Helpers (grid) -----------------------------------------------
    this.helpersGroup = new THREE.Group();
    this.scene.add(this.helpersGroup);
    this.setupHelpers();

    // Data group ----------------------------------------------------
    this.dataGroup = new THREE.Group();
    this.scene.add(this.dataGroup);

    // Shared geometry ----------------------------------------------
    this.boxGeometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    this.edgesGeometry = new THREE.EdgesGeometry(this.boxGeometry);
    this.sphereGeometry = new THREE.SphereGeometry(0.5, 28, 18);

    // Stardust ------------------------------------------------------
    this.stardust = new StardustField(1800, this.dustTexture);
    this.scene.add(this.stardust.points);

    // Pointer / hover ----------------------------------------------
    this.onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.pointerActive = true;
    };
    this.onPointerLeave = () => {
      this.pointerActive = false;
    };
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);

    // Resize handling ----------------------------------------------
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(container);
    }

    // Render loop ---------------------------------------------------
    this.animate();
  }

  /* ---------------------------------------------------------------- *
   * Scene setup
   * ---------------------------------------------------------------- */

  private setupLights(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(0xffffff, 1.0);
    key.position.set(20, 30, 20);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 120;
    const c = key.shadow.camera as THREE.OrthographicCamera;
    c.left = -40;
    c.right = 40;
    c.top = 40;
    c.bottom = -40;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xbfdfff, 0.45);
    fill.position.set(-20, 10, -20);
    this.scene.add(fill);

    // Warm PyTorch-orange point lights.
    const warm1 = new THREE.PointLight(ORANGE, 0.9, 140, 2);
    warm1.position.set(8, 8, -14);
    this.scene.add(warm1);

    const warm2 = new THREE.PointLight(ORANGE_HOT, 0.6, 120, 2);
    warm2.position.set(-12, 5, 10);
    this.scene.add(warm2);
  }

  private setupHelpers(): void {
    const grid = new THREE.GridHelper(60, 60, 0x3a2a3f, 0x141826);
    const gm = grid.material as THREE.Material | THREE.Material[];
    if (Array.isArray(gm)) {
      gm.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.5;
      });
    } else {
      gm.transparent = true;
      gm.opacity = 0.5;
    }
    grid.position.y = -0.02;
    this.helpersGroup.add(grid);
  }

  /* ---------------------------------------------------------------- *
   * Render loop
   * ---------------------------------------------------------------- */

  private animate = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.animate);

    const elapsed = this.clock.getElapsedTime();
    // NOTE: do NOT use clock.getDelta() here — getElapsedTime() already advances
    // the clock's internal baseline, so getDelta() right after returns ~0 and
    // particles/animations would freeze. Derive dt from elapsed ourselves.
    const dt = Math.min(Math.max(elapsed - this.lastElapsed, 0), 0.05);
    this.lastElapsed = elapsed;

    // Run/cull transition animations.
    if (this.animations.length) {
      this.animations = this.animations.filter((fn) => fn(elapsed, dt));
    }

    // Stardust.
    this.stardust.update(dt);

    // Hover raycasting.
    this.updateHover();

    // Emissive pulse on interactive cubes.
    for (const mesh of this.interactives) {
      if (mesh === this.hovered) continue;
      const info = mesh.userData.hover as HoverInfo | undefined;
      const mat = mesh.material as THREE.MeshPhongMaterial;
      if (info && mat && mat.emissive) {
        const pulse = 0.5 + 0.5 * Math.sin(elapsed * 2 + info.pulsePhase);
        mat.emissiveIntensity = info.baseEmissive * (0.7 + 0.5 * pulse);
      }
    }

    // Subtle idle auto-rotate (only when the user hasn't touched it lately).
    if (this.autoRotateEnabled) {
      const idle = elapsed - this.lastInteractionTime;
      if (idle > 4.0 && !this.pointerActive) {
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.4;
      } else {
        this.controls.autoRotate = false;
      }
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /* ---------------------------------------------------------------- *
   * Hover interactivity
   * ---------------------------------------------------------------- */

  private updateHover(): void {
    if (!this.pointerActive || this.interactives.length === 0) {
      if (this.hovered) this.restoreHover(this.hovered);
      this.hovered = null;
      return;
    }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactives, false);
    const top = hits.length > 0 ? (hits[0].object as THREE.Mesh) : null;

    if (top === this.hovered) return;

    if (this.hovered) this.restoreHover(this.hovered);
    this.hovered = top;
    if (top) this.applyHover(top);
  }

  private applyHover(mesh: THREE.Mesh): void {
    const info = mesh.userData.hover as HoverInfo | undefined;
    if (!info) return;
    const mat = mesh.material as THREE.MeshPhongMaterial;
    mesh.scale.copy(info.baseScale).multiplyScalar(1.25);
    if (mat && mat.emissive) {
      mat.emissive.set(ORANGE_HOT);
      mat.emissiveIntensity = 1.4;
    }
  }

  private restoreHover(mesh: THREE.Mesh): void {
    const info = mesh.userData.hover as HoverInfo | undefined;
    if (!info) return;
    const mat = mesh.material as THREE.MeshPhongMaterial;
    mesh.scale.copy(info.baseScale);
    if (mat && mat.emissive && mesh.userData.emissiveColor instanceof THREE.Color) {
      mat.emissive.copy(mesh.userData.emissiveColor as THREE.Color);
      mat.emissiveIntensity = info.baseEmissive;
    }
  }

  /* ---------------------------------------------------------------- *
   * Lifecycle
   * ---------------------------------------------------------------- */

  resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  clear(): void {
    this.animations = [];
    this.interactives = [];
    this.hovered = null;
    this.disposeGroupChildren(this.dataGroup);
    this.dataGroup.position.set(0, 0, 0);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.controls.removeEventListener('start', this.onControlsStart);

    this.disposeGroupChildren(this.dataGroup);
    this.disposeGroupChildren(this.helpersGroup);

    this.stardust.dispose();

    this.boxGeometry.dispose();
    this.edgesGeometry.dispose();
    this.sphereGeometry.dispose();

    this.skyTexture.dispose();
    this.glowTexture.dispose();
    this.dustTexture.dispose();

    this.controls.dispose();
    this.renderer.dispose();

    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  /** Recursively dispose geometries/materials and detach a group's children. */
  private disposeGroupChildren(group: THREE.Group): void {
    const shared = new Set<THREE.BufferGeometry>([
      this.boxGeometry,
      this.edgesGeometry,
      this.sphereGeometry,
    ]);
    const sharedTex = new Set<THREE.Texture>([this.skyTexture, this.glowTexture, this.dustTexture]);
    const children = [...group.children];
    for (const child of children) {
      group.remove(child);
      child.traverse((obj: THREE.Object3D) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry && !shared.has(mesh.geometry)) {
          mesh.geometry.dispose();
        }
        const mat = (obj as any).material as THREE.Material | THREE.Material[] | undefined;
        if (mat) {
          const disposeMat = (m: THREE.Material) => {
            const anyMat = m as any;
            const map = anyMat.map as THREE.Texture | undefined;
            if (map && !sharedTex.has(map)) map.dispose();
            m.dispose();
          };
          if (Array.isArray(mat)) mat.forEach(disposeMat);
          else disposeMat(mat);
        }
      });
    }
  }

  /* ---------------------------------------------------------------- *
   * Camera framing
   * ---------------------------------------------------------------- */

  /** Smoothly frame the camera so `box` fits comfortably in view. */
  private frame(box: THREE.Box3, opts: { padding?: number; topBias?: number } = {}): void {
    if (box.isEmpty()) return;
    const padding = opts.padding ?? 1.5;
    const topBias = opts.topBias ?? 0.55;

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);

    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const fov = (this.camera.fov * Math.PI) / 180;
    let dist = (maxDim * padding) / (2 * Math.tan(fov / 2));
    dist = Math.max(dist, 5);

    const dir = new THREE.Vector3(0.85, topBias + 0.35, 1).normalize();
    const targetPos = center.clone().add(dir.multiplyScalar(dist));

    this.tweenCamera(targetPos, center);

    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.near = dist * 0.7;
      this.scene.fog.far = dist * 4 + maxDim;
    }
  }

  private tweenCamera(toPos: THREE.Vector3, toTarget: THREE.Vector3): void {
    const fromPos = this.camera.position.clone();
    const fromTarget = this.controls.target.clone();
    const start = this.clock.getElapsedTime();
    const duration = 0.9;

    const tick = (elapsed: number): boolean => {
      const t = clamp01((elapsed - start) / duration);
      const e = easeInOutCubic(t);
      this.camera.position.lerpVectors(fromPos, toPos, e);
      this.controls.target.lerpVectors(fromTarget, toTarget, e);
      return t < 1;
    };
    this.animations.push(tick);
    // Reset idle timer so we don't auto-rotate mid-tween.
    this.lastInteractionTime = start;
  }

  /* ---------------------------------------------------------------- *
   * Sprite label factory
   * ---------------------------------------------------------------- */

  /** Build a crisp monospace canvas-sprite label. Returns a Sprite. */
  private makeLabel(
    text: string,
    opts: { color?: string; bg?: string; scale?: number; fontPx?: number } = {}
  ): THREE.Sprite {
    const color = opts.color ?? '#ffffff';
    const bg = opts.bg ?? 'rgba(8,8,20,0.55)';
    const fontPx = opts.fontPx ?? 48;
    const pad = fontPx * 0.4;

    const measure = document.createElement('canvas');
    const mctx = measure.getContext('2d');
    const font = `bold ${fontPx}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
    let textW = text.length * fontPx * 0.6;
    if (mctx) {
      mctx.font = font;
      textW = mctx.measureText(text).width;
    }

    const w = Math.ceil(textW + pad * 2);
    const h = Math.ceil(fontPx + pad * 2);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // rounded background
      ctx.fillStyle = bg;
      const r = h * 0.28;
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.arcTo(w, 0, w, h, r);
      ctx.arcTo(w, h, 0, h, r);
      ctx.arcTo(0, h, 0, 0, r);
      ctx.arcTo(0, 0, w, 0, r);
      ctx.closePath();
      ctx.fill();

      ctx.font = font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color;
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = fontPx * 0.15;
      ctx.fillText(text, w / 2, h / 2 + 1);
    }

    const tex = new THREE.Texture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    const sprite = new THREE.Sprite(mat);
    const baseScale = opts.scale ?? 1;
    const aspect = w / h;
    sprite.scale.set(baseScale * aspect, baseScale, 1);
    return sprite;
  }

  /* ---------------------------------------------------------------- *
   * Cube factory (the headline element)
   * ---------------------------------------------------------------- */

  /**
   * Create a value cube: colored by `norm`, with white wireframe edges,
   * registered for hover, and animated to fly in along a Bézier arc with a
   * cosine bounce.
   * `targetH` scales the cube vertically (height encodes value).
   */
  private makeCube(
    norm: number,
    targetScale: THREE.Vector3,
    targetPos: THREE.Vector3,
    delay: number
  ): THREE.Mesh {
    const col = rampColor(norm).clone();
    const emissiveBase = 0.35 + 0.35 * norm;
    const mat = new THREE.MeshPhongMaterial({
      color: col,
      emissive: col.clone().multiplyScalar(0.45),
      emissiveIntensity: emissiveBase,
      shininess: 60,
      specular: 0x333333,
      transparent: true,
      opacity: 0.85,
    });

    const cube = new THREE.Mesh(this.boxGeometry, mat);
    cube.castShadow = true;
    cube.receiveShadow = true;

    // white wireframe edges
    const edges = new THREE.LineSegments(
      this.edgesGeometry,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })
    );
    cube.add(edges);

    cube.userData.hover = {
      baseScale: targetScale.clone(),
      baseEmissive: emissiveBase,
      pulsePhase: Math.random() * Math.PI * 2,
    } as HoverInfo;
    cube.userData.emissiveColor = col.clone().multiplyScalar(0.45);

    // The cube carries a non-uniform target scale (height encodes value);
    // hover scaling multiplies a uniform factor, so we record base as 1 and
    // bake the value-height into the spawn animation.
    this.spawnCube(cube, mat, targetScale, targetPos, delay);

    this.interactives.push(cube);
    return cube;
  }

  /** Bouncy spawn: start tiny + below + transparent, ease up to target. */
  private spawnCube(
    cube: THREE.Mesh,
    mat: THREE.MeshPhongMaterial,
    targetScale: THREE.Vector3,
    targetPos: THREE.Vector3,
    delay: number
  ): void {
    const startPos = targetPos.clone();
    startPos.y -= 4;
    cube.position.copy(startPos);
    cube.scale.setScalar(0.01);
    mat.opacity = 0;

    // Record the full (possibly non-uniform) target scale so hover can grow
    // the cube without flattening its value-encoded height.
    const info = cube.userData.hover as HoverInfo;
    info.baseScale = targetScale.clone();

    // Curved Bézier flight path + a particle trail tinted to the cube's color.
    const { c1, c2 } = bezierControls(startPos, targetPos);
    const trailColor = mat.color.clone();

    const start = this.clock.getElapsedTime() + delay;
    const duration = 0.7;

    const tick = (elapsed: number): boolean => {
      if (elapsed < start) return true;
      const t = clamp01((elapsed - start) / duration);
      const eScale = easeOutBounceCos(t); // cosine "boing"
      const ePath = easeInOutCubic(t); // smooth progress along the arc
      const eOp = easeOutCubic(Math.min(1, t * 1.6));

      cube.scale.set(
        Math.max(0.01, targetScale.x * eScale),
        Math.max(0.01, targetScale.y * eScale),
        Math.max(0.01, targetScale.z * eScale)
      );
      cubicBezier(startPos, c1, c2, targetPos, ePath, cube.position);
      mat.opacity = 0.85 * eOp;

      // Comet-like trail behind the moving box (capped so huge tensors stay fast).
      if (t < 0.9 && this.interactives.length <= 400) {
        this.stardust.burst(cube.position, trailColor, 1, 0.8);
      }
      return t < 1;
    };
    this.animations.push(tick);
  }

  /* ---------------------------------------------------------------- *
   * TENSORS — the headline feature
   * ---------------------------------------------------------------- */

  showTensors(tensors: TensorData[]): void {
    this.clear();
    if (!tensors || tensors.length === 0) {
      this.frame(new THREE.Box3(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 4, 4)));
      return;
    }

    const ZGAP = 5;
    let zCursor = 0;
    const burstCenters: THREE.Vector3[] = [];

    for (let i = 0; i < tensors.length; i++) {
      const t = tensors[i];
      const group = this.buildTensorGroup(t);
      if (!group) continue;

      this.dataGroup.add(group);
      group.position.z = zCursor;
      group.updateMatrixWorld(true);

      // Measure footprint to space the next one out.
      const gbox = new THREE.Box3().setFromObject(group);
      const gsize = new THREE.Vector3();
      gbox.getSize(gsize);
      if (!Number.isFinite(gsize.z) || gsize.z <= 0) gsize.z = 2;

      const gc = new THREE.Vector3();
      gbox.getCenter(gc);
      burstCenters.push(gc);

      zCursor += Math.max(gsize.z, 2) + ZGAP;
    }

    // Re-center along Z.
    if (zCursor > 0) {
      const shift = (zCursor - ZGAP) / 2;
      this.dataGroup.position.z = -shift;
    }

    this.dataGroup.updateMatrixWorld(true);
    const framed = new THREE.Box3().setFromObject(this.dataGroup);
    this.frame(framed, { padding: 1.55 });

    // Juice: stardust bursts once cubes are placed.
    this.dataGroup.updateMatrixWorld(true);
    for (const c of burstCenters) {
      const world = c.clone();
      world.z += this.dataGroup.position.z;
      this.stardust.burst(world, accentColor(0.7).clone(), 60, 5);
    }
  }

  /** Dispatch a single tensor to the right rank renderer. */
  private buildTensorGroup(t: TensorData): THREE.Group | null {
    const shape = Array.isArray(t.shape) ? t.shape.filter((n) => n > 0) : [];
    const rank = shape.length;

    const flat: number[] = [];
    flattenDeep(t.data, flat);

    const g = new THREE.Group();
    g.name = `tensor:${t.name}`;

    if (flat.length === 0) {
      this.addTitle(g, t, new THREE.Vector3(0, 2, 0));
      return g;
    }

    const range = minMax(flat);
    const showLabels = flat.length <= 64;

    if (rank === 0 || (rank === 1 && shape[0] === 1) || flat.length === 1) {
      this.buildScalar(g, flat[0], range);
    } else if (rank === 1) {
      this.buildVector(g, flat, range, showLabels);
    } else if (rank === 2) {
      this.buildMatrix(g, flat, shape[0], shape[1], range, showLabels);
    } else if (rank === 3) {
      this.buildVolume(g, flat, [shape[0], shape[1], shape[2]], range, showLabels);
    } else {
      this.buildHighRank(g, flat, shape, range);
    }

    // Title sprite above the arrangement.
    const box = new THREE.Box3().setFromObject(g);
    const top = box.isEmpty() ? 3 : box.max.y + 1.2;
    const cx = box.isEmpty() ? 0 : (box.min.x + box.max.x) / 2;
    this.addTitle(g, t, new THREE.Vector3(cx, top, 0));

    return g;
  }

  private addTitle(g: THREE.Group, t: TensorData, pos: THREE.Vector3): void {
    const shapeStr = t.shape && t.shape.length ? `(${t.shape.join(', ')})` : '(scalar)';
    const dtype = t.dtype || '';
    const trunc = t.truncated ? '  …trunc' : '';
    const title = this.makeLabel(`${t.name}  ${shapeStr}  ${dtype}${trunc}`, {
      color: '#ffd9c8',
      bg: 'rgba(238,76,44,0.22)',
      fontPx: 52,
      scale: 1.1,
    });
    title.position.copy(pos);
    g.add(title);
  }

  private addValueLabel(g: THREE.Group, value: number, pos: THREE.Vector3, delay: number): void {
    const label = this.makeLabel(formatValue(value), {
      color: '#f4f4fb',
      bg: 'rgba(8,8,20,0.5)',
      fontPx: 40,
      scale: 0.55,
    });
    label.position.copy(pos);
    label.material.opacity = 0;
    g.add(label);
    // fade in alongside the cubes
    const start = this.clock.getElapsedTime() + delay + 0.2;
    const tick = (elapsed: number): boolean => {
      if (elapsed < start) return true;
      const t = clamp01((elapsed - start) / 0.4);
      label.material.opacity = t;
      return t < 1;
    };
    this.animations.push(tick);
  }

  private buildScalar(g: THREE.Group, value: number, range: MinMax): void {
    const norm = normalize(value, range);
    // single big glowing cube at origin
    const size = 2.2;
    const pos = new THREE.Vector3(0, size / 2 + 0.1, 0);
    const cube = this.makeCube(norm, new THREE.Vector3(size, size, size), pos, 0);
    g.add(cube);

    // glow halo
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: rampColor(norm).clone(),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    halo.position.copy(pos);
    halo.scale.setScalar(size * 2.4);
    g.add(halo);

    this.addValueLabel(g, value, new THREE.Vector3(0, size + 0.9, 0), 0.1);
  }

  private buildVector(g: THREE.Group, flat: number[], range: MinMax, showLabels: boolean): void {
    const n = flat.length;
    const pitch = 1.15;
    const maxH = 5;
    const startX = -((n - 1) * pitch) / 2;

    for (let i = 0; i < n; i++) {
      const v = flat[i];
      const norm = normalize(v, range);
      const h = 0.4 + norm * maxH;
      const pos = new THREE.Vector3(startX + i * pitch, h / 2, 0);
      const cube = this.makeCube(norm, new THREE.Vector3(0.95, h, 0.95), pos, i * 0.028);
      g.add(cube);
      if (showLabels) {
        this.addValueLabel(g, v, new THREE.Vector3(pos.x, h + 0.6, 0), i * 0.028);
      }
    }
  }

  private buildMatrix(
    g: THREE.Group,
    flat: number[],
    rows: number,
    cols: number,
    range: MinMax,
    showLabels: boolean
  ): void {
    // Cap to ≤ 32×32 of *cubes* via striding (large ones skip labels anyway).
    const MAXN = 32;
    const rStride = Math.max(1, Math.ceil(rows / MAXN));
    const cStride = Math.max(1, Math.ceil(cols / MAXN));
    const rOut = Math.ceil(rows / rStride);
    const cOut = Math.ceil(cols / cStride);

    const pitch = 1.15;
    const maxH = 3.5;
    const startX = -((cOut - 1) * pitch) / 2;
    const startZ = -((rOut - 1) * pitch) / 2;

    let linear = 0;
    for (let ri = 0; ri < rOut; ri++) {
      for (let ci = 0; ci < cOut; ci++) {
        const r = Math.min(ri * rStride, rows - 1);
        const c = Math.min(ci * cStride, cols - 1);
        const v = flat[r * cols + c];
        const norm = normalize(v, range);
        const h = 0.35 + norm * maxH;
        const pos = new THREE.Vector3(startX + ci * pitch, h / 2, startZ + ri * pitch);
        const cube = this.makeCube(norm, new THREE.Vector3(0.95, h, 0.95), pos, linear * 0.025);
        g.add(cube);
        if (showLabels) {
          this.addValueLabel(g, v, new THREE.Vector3(pos.x, h + 0.55, pos.z), linear * 0.025);
        }
        linear++;
      }
    }
  }

  private buildVolume(
    g: THREE.Group,
    flat: number[],
    dims: number[],
    range: MinMax,
    showLabels: boolean
  ): void {
    const [d, rows, cols] = dims;
    // Cap voxels by striding the largest axis.
    const MAX = 4096;
    let dS = 1;
    let rS = 1;
    let cS = 1;
    const recount = () => Math.ceil(d / dS) * Math.ceil(rows / rS) * Math.ceil(cols / cS);
    while (recount() > MAX) {
      const dn = Math.ceil(d / dS);
      const rn = Math.ceil(rows / rS);
      const cn = Math.ceil(cols / cS);
      const m = Math.max(dn, rn, cn);
      if (m === dn) dS++;
      else if (m === rn) rS++;
      else cS++;
    }
    const dOut = Math.ceil(d / dS);
    const rOut = Math.ceil(rows / rS);
    const cOut = Math.ceil(cols / cS);

    const pitch = 1.1;
    const sliceArea = rows * cols;
    const startX = -((cOut - 1) * pitch) / 2;
    const startY = 0.7;
    const startZ = -((rOut - 1) * pitch) / 2;

    let linear = 0;
    for (let di = 0; di < dOut; di++) {
      for (let ri = 0; ri < rOut; ri++) {
        for (let ci = 0; ci < cOut; ci++) {
          const dd = Math.min(di * dS, d - 1);
          const rr = Math.min(ri * rS, rows - 1);
          const cc = Math.min(ci * cS, cols - 1);
          const v = flat[dd * sliceArea + rr * cols + cc];
          const norm = normalize(v, range);
          // magnitude drives voxel size so structure reads through
          const s = 0.45 + 0.5 * norm;
          const pos = new THREE.Vector3(
            startX + ci * pitch,
            startY + di * pitch,
            startZ + ri * pitch
          );
          const cube = this.makeCube(norm, new THREE.Vector3(s, s, s), pos, linear * 0.012);
          g.add(cube);
          if (showLabels) {
            this.addValueLabel(g, v, new THREE.Vector3(pos.x, pos.y + 0.55, pos.z), linear * 0.012);
          }
          linear++;
        }
      }
    }
  }

  /** rank >= 4: hierarchical nested layout. Dims beyond 3 cycle along X,Y,Z. */
  private buildHighRank(g: THREE.Group, flat: number[], shape: number[], range: MinMax): void {
    // Cap the number of cubes by striding each dim down.
    const dims = shape.slice();
    const total = dims.reduce((a, b) => a * b, 1);
    const MAX = 2048;
    const strides = dims.map(() => 1);
    let count = total;
    // greedily increase stride on the largest current extent
    while (count > MAX) {
      let bi = 0;
      let best = -1;
      for (let i = 0; i < dims.length; i++) {
        const ext = Math.ceil(dims[i] / strides[i]);
        if (ext > best) {
          best = ext;
          bi = i;
        }
      }
      strides[bi]++;
      count = dims.reduce((acc, dim, i) => acc * Math.ceil(dim / strides[i]), 1);
    }

    const outDims = dims.map((dim, i) => Math.ceil(dim / strides[i]));

    // Iterate over all output index combinations.
    const idx: number[] = new Array<number>(dims.length).fill(0);
    let linear = 0;
    const flatStride = (i: number) => {
      // stride in the flat array for dimension i
      let s = 1;
      for (let k = i + 1; k < dims.length; k++) s *= dims[k];
      return s;
    };
    const flatStrides = dims.map((_, i) => flatStride(i));

    const tmp = new THREE.Vector3();

    const emit = (): void => {
      // map sampled multi-index → flat offset
      let off = 0;
      for (let i = 0; i < dims.length; i++) {
        const src = Math.min(idx[i] * strides[i], dims[i] - 1);
        off += src * flatStrides[i];
      }
      const v = flat[off] ?? 0;
      const norm = normalize(v, range);
      const s = 0.45 + 0.5 * norm;
      const pos = this.calculateHierarchicalPosition(idx, outDims, tmp.clone());
      const cube = this.makeCube(norm, new THREE.Vector3(s, s, s), pos.clone(), linear * 0.01);
      g.add(cube);
      linear++;
    };

    // odometer over outDims
    const rec = (dim: number): void => {
      if (dim === dims.length) {
        emit();
        return;
      }
      for (let i = 0; i < outDims[dim]; i++) {
        idx[dim] = i;
        rec(dim + 1);
      }
    };
    rec(0);
  }

  /**
   * Hierarchical layout: the first 3 dims map to X,Y,Z; each subsequent dim
   * cycles back through X,Y,Z with a growing spacing so nested blocks separate.
   */
  private calculateHierarchicalPosition(
    indices: number[],
    dims: number[],
    out: THREE.Vector3
  ): THREE.Vector3 {
    out.set(0, 0, 0);
    const base = 1.2;
    // running block size per axis to compute the growing offset
    const axisExtent = [1, 1, 1];
    for (let i = 0; i < indices.length; i++) {
      const axis = i % 3;
      const spacing = base * axisExtent[axis] * (i >= 3 ? 1.6 : 1);
      const offset = indices[i] * spacing;
      if (axis === 0) out.x += offset;
      else if (axis === 1) out.y += offset;
      else out.z += offset;
      axisExtent[axis] *= Math.max(1, dims[i]) + 1;
    }
    // lift off the floor a touch
    out.y += 0.6;
    return out;
  }

  /* ---------------------------------------------------------------- *
   * REGRESSION
   * ---------------------------------------------------------------- */

  showRegression(d: RegressionData): void {
    this.clear();

    const x = d?.x ?? [];
    const y = d?.y ?? [];
    const yPred = d?.yPred ?? [];
    if (x.length === 0) {
      this.frame(new THREE.Box3(new THREE.Vector3(-6, 0, -2), new THREE.Vector3(6, 6, 2)));
      return;
    }

    const xr = minMax(x);
    const allY = y.concat(yPred);
    const yr = minMax(allY.length ? allY : [0, 1]);

    const SPAN_X = 16;
    const SPAN_Y = 8;
    const mapX = (v: number) => (normalize(v, xr) - 0.5) * SPAN_X;
    const mapY = (v: number) => normalize(v, yr) * SPAN_Y;

    const g = new THREE.Group();

    // Scatter ground-truth points as emissive cyan spheres.
    const ptMat = new THREE.MeshPhongMaterial({
      color: CYAN,
      emissive: new THREE.Color(CYAN).multiplyScalar(0.5),
      emissiveIntensity: 0.7,
      shininess: 80,
    });
    const ptMesh = new THREE.InstancedMesh(this.sphereGeometry, ptMat, x.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < x.length; i++) {
      dummy.position.set(mapX(x[i]), mapY(y[i] ?? 0), 0);
      dummy.scale.setScalar(0.3);
      dummy.updateMatrix();
      ptMesh.setMatrixAt(i, dummy.matrix);
    }
    ptMesh.instanceMatrix.needsUpdate = true;
    g.add(ptMesh);

    // Fitted curve as a glowing orange tube.
    if (yPred.length >= 2) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < yPred.length; i++) {
        pts.push(new THREE.Vector3(mapX(x[i] ?? 0), mapY(yPred[i]), 0));
      }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const tubular = Math.min(400, Math.max(16, yPred.length * 4));
      const tubeGeo = new THREE.TubeGeometry(curve, tubular, 0.16, 12, false);
      this.applyGradientVertexColors(tubeGeo, ACCENT_STOPS);
      const tubeMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: new THREE.Color(ORANGE).multiplyScalar(0.4),
        emissiveIntensity: 1.0,
        roughness: 0.3,
        metalness: 0.2,
      });
      g.add(new THREE.Mesh(tubeGeo, tubeMat));
    }

    this.dataGroup.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.frame(box, { padding: 1.4, topBias: 0.25 });
  }

  /* ---------------------------------------------------------------- *
   * CLASSIFICATION
   * ---------------------------------------------------------------- */

  showClassification(d: ClassificationData): void {
    this.clear();

    const grid = d?.grid;
    const xs = grid?.xs ?? [];
    const ys = grid?.ys ?? [];
    const probs = grid?.probs ?? [];

    if (xs.length < 2 || ys.length < 2 || probs.length === 0) {
      this.frame(new THREE.Box3(new THREE.Vector3(-8, 0, -8), new THREE.Vector3(8, 4, 8)));
      return;
    }

    const SPAN = 16;
    const HEIGHT = 2.4;
    const xr = minMax(xs);
    const yr = minMax(ys);
    const mapX = (v: number) => (normalize(v, xr) - 0.5) * SPAN;
    const mapZ = (v: number) => (normalize(v, yr) - 0.5) * SPAN;

    const g = new THREE.Group();

    const W = xs.length;
    const H = ys.length;
    const geo = new THREE.PlaneGeometry(1, 1, W - 1, H - 1);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const col = new THREE.Color();

    for (let j = 0; j < H; j++) {
      const row = probs[j] ?? [];
      for (let i = 0; i < W; i++) {
        const vi = j * W + i;
        const p = clamp01(row[i] ?? 0.5);
        const px = mapX(xs[i]);
        const pz = mapZ(ys[j]);
        const py = (p - 0.5) * 2 * HEIGHT;
        pos.setXYZ(vi, px, py, pz);
        divergingColor(p, col);
        colors[vi * 3] = col.r;
        colors[vi * 3 + 1] = col.g;
        colors[vi * 3 + 2] = col.b;
      }
    }
    pos.needsUpdate = true;
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const surfMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.5,
      metalness: 0.05,
      transparent: true,
      opacity: 0.95,
      emissiveIntensity: 0.15,
    });
    const surface = new THREE.Mesh(geo, surfMat);
    surface.receiveShadow = true;
    g.add(surface);

    const wire = new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08 })
    );
    g.add(wire);

    const points = d.points ?? [];
    const labels = d.labels ?? [];
    if (points.length > 0) {
      const sampleY = (rawX: number, rawZ: number): number => {
        const fx = normalize(rawX, xr) * (W - 1);
        const fz = normalize(rawZ, yr) * (H - 1);
        const i0 = Math.max(0, Math.min(W - 1, Math.round(fx)));
        const j0 = Math.max(0, Math.min(H - 1, Math.round(fz)));
        const p = clamp01(probs[j0]?.[i0] ?? 0.5);
        return (p - 0.5) * 2 * HEIGHT;
      };

      const c0 = new THREE.Color(0x2a7bd6);
      const c1 = new THREE.Color(ORANGE);
      const class0: THREE.Matrix4[] = [];
      const class1: THREE.Matrix4[] = [];
      const dummy = new THREE.Object3D();

      for (let k = 0; k < points.length; k++) {
        const px = mapX(points[k][0]);
        const pz = mapZ(points[k][1]);
        const py = sampleY(points[k][0], points[k][1]) + 0.5;
        dummy.position.set(px, py, pz);
        dummy.scale.setScalar(0.26);
        dummy.updateMatrix();
        (labels[k] === 1 ? class1 : class0).push(dummy.matrix.clone());
      }

      const buildScatter = (mats: THREE.Matrix4[], color: THREE.Color) => {
        if (mats.length === 0) return;
        const mat = new THREE.MeshPhongMaterial({
          color: color.clone(),
          emissive: color.clone().multiplyScalar(0.5),
          emissiveIntensity: 0.7,
          shininess: 80,
        });
        const im = new THREE.InstancedMesh(this.sphereGeometry, mat, mats.length);
        for (let k = 0; k < mats.length; k++) im.setMatrixAt(k, mats[k]);
        im.instanceMatrix.needsUpdate = true;
        g.add(im);
      };
      buildScatter(class0, c0);
      buildScatter(class1, c1);
    }

    this.dataGroup.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.frame(box, { padding: 1.5, topBias: 0.5 });
  }

  /* ---------------------------------------------------------------- *
   * LOSS CURVE
   * ---------------------------------------------------------------- */

  showLossCurve(history: number[]): void {
    this.clear();

    const h = (history ?? []).filter((v) => Number.isFinite(v));
    if (h.length === 0) {
      this.frame(new THREE.Box3(new THREE.Vector3(-8, 0, -2), new THREE.Vector3(8, 6, 2)));
      return;
    }

    const allPositive = h.every((v) => v > 0);
    const raw = minMax(h);
    const useLog = allPositive && raw.max / Math.max(raw.min, 1e-9) > 50;
    const transform = (v: number) => (useLog ? Math.log10(Math.max(v, 1e-9)) : v);
    const tvals = h.map(transform);
    const tr = minMax(tvals);

    const SPAN_X = 18;
    const SPAN_Y = 7;
    const n = h.length;
    const mapX = (i: number) => (n <= 1 ? 0 : (i / (n - 1) - 0.5) * SPAN_X);
    const mapY = (v: number) => normalize(v, tr) * SPAN_Y + 0.1;

    const g = new THREE.Group();

    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      pts.push(new THREE.Vector3(mapX(i), mapY(tvals[i]), 0));
    }

    if (pts.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const segs = Math.min(600, Math.max(16, n * 4));
      const tubeGeo = new THREE.TubeGeometry(curve, segs, 0.13, 12, false);
      this.applyGradientVertexColors(tubeGeo, ACCENT_STOPS);
      const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        emissive: new THREE.Color(ORANGE).multiplyScalar(0.35),
        emissiveIntensity: 1.1,
        roughness: 0.3,
        metalness: 0.25,
      });
      g.add(new THREE.Mesh(tubeGeo, mat));
    } else {
      const m = new THREE.Mesh(
        this.sphereGeometry,
        new THREE.MeshPhongMaterial({
          color: ORANGE,
          emissive: new THREE.Color(ORANGE).multiplyScalar(0.6),
          emissiveIntensity: 1.0,
        })
      );
      m.position.copy(pts[0]);
      m.scale.setScalar(0.35);
      g.add(m);
    }

    // Bright additive comet head at the latest point.
    const last = pts[pts.length - 1];
    const headCore = new THREE.Mesh(
      this.sphereGeometry,
      new THREE.MeshPhongMaterial({
        color: ORANGE_HOT,
        emissive: new THREE.Color(ORANGE_HOT).multiplyScalar(0.8),
        emissiveIntensity: 1.4,
      })
    );
    headCore.position.copy(last);
    headCore.scale.setScalar(0.4);
    g.add(headCore);

    const cometGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: new THREE.Color(ORANGE_HOT),
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    cometGlow.position.copy(last);
    cometGlow.scale.setScalar(2.2);
    g.add(cometGlow);

    // gentle pulse of the comet head
    const phase0 = this.clock.getElapsedTime();
    const tick = (elapsed: number): boolean => {
      const p = 0.5 + 0.5 * Math.sin((elapsed - phase0) * 4);
      cometGlow.scale.setScalar(2.0 + p * 0.8);
      cometGlow.material.opacity = 0.6 + p * 0.35;
      return true; // persist until cleared
    };
    this.animations.push(tick);

    this.dataGroup.add(g);
    const box = new THREE.Box3().setFromObject(g);
    this.frame(box, { padding: 1.3, topBias: 0.2 });
  }

  /* ---------------------------------------------------------------- *
   * Geometry utilities
   * ---------------------------------------------------------------- */

  /** Color a tube/curve geometry along its length using a ramp. */
  private applyGradientVertexColors(geo: THREE.BufferGeometry, stops: THREE.Color[]): void {
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    const col = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const t = count <= 1 ? 0 : i / (count - 1);
      sampleRamp(stops, t, col);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
}
