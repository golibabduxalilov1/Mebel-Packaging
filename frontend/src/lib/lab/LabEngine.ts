/*
 * Laboratoriya 3D sahnasi (W1-W8, F10). Bitta three.js sahna; rejim almashganda qayta yaratilmaydi.
 * Koordinatalar: "model fazosi" = import qilingan mm koordinatalar. Sahnada model markazga va polga
 * qo'yiladi (root siljishi), shuning uchun dunyo = model + off.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import polygonClipping from 'polygon-clipping';
import type { Part, Vec2, Vec3 } from '../types';
import type { M4 } from '../model/mat4';

export interface EngineTheme { edge: string; sel: string; grid: string; main: string; attached: string; hover: string; measure: string }

export interface PickHit { partId: string; point: THREE.Vector3; faceIndex: number }

export interface EngineCallbacks {
  onClick?(hit: PickHit | null, ev: PointerEvent): void;
  onDblClick?(hit: PickHit | null, ev: MouseEvent): void;
  onHover?(hit: PickHit | null, ev: PointerEvent): void;
  onContext?(hit: PickHit | null, x: number, y: number): void;
  onBoxSelect?(ids: string[], additive: boolean): void;
  onMeasure?(dist: number | null, a: Vec3 | null, b: Vec3 | null): void;
  onCameraChange?(): void;
}

export type EngineTool = 'select' | 'box' | 'measure';

export interface VisualState {
  selected: Set<string>;
  hidden: Set<string>;
  isolate: boolean;
  xray: boolean;
  edges: boolean;
  main: Set<string>; // yelimlashdagi asosiy detal
  attached: Set<string>; // yelimlanadigan detallar
  pickable: Set<string> | null; // null = hammasi
}

interface Entry {
  part: Part;
  mesh: THREE.Mesh;
  edge: THREE.LineSegments;
  edgeLazy: boolean;
  base: THREE.Matrix4;
  glue: THREE.Matrix4;
  explode: THREE.Vector3;
  mats: THREE.MeshStandardMaterial[];
  segs?: Float32Array; // qirralar, lokal
}

const tmpM = new THREE.Matrix4();
const v3 = (a: THREE.Vector3): Vec3 => [a.x, a.y, a.z];

function snap4(v: number) { return Math.round(v * 1e4) / 1e4; }
function ring(lp: Vec2[]): [number, number][] { const r = lp.map((q) => [snap4(q[0]), snap4(q[1])] as [number, number]); r.push([r[0][0], r[0][1]]); return r; }

function extrudeMP(mp: [number, number][][][], depth: number, z: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const v2 = (r: [number, number][]) => { const a = r.map((q) => new THREE.Vector2(q[0], q[1])); a.pop(); return a; };
  for (const poly of mp) {
    if (!poly[0] || poly[0].length < 4) continue;
    const sh = new THREE.Shape(v2(poly[0]));
    for (let i = 1; i < poly.length; i++) if (poly[i].length >= 4) sh.holes.push(new THREE.Path(v2(poly[i])));
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: false, steps: 1 });
    if (z) g.translate(0, 0, z);
    out.push(g);
  }
  return out;
}

function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const nonIdx = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of nonIdx) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of nonIdx) {
    pos.set(g.attributes.position.array as Float32Array, o * 3);
    nor.set(g.attributes.normal.array as Float32Array, o * 3);
    o += g.attributes.position.count;
  }
  list.forEach((g) => g.dispose());
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

/** O'yiq (paz): o'yiqsiz qism butun qalinlikda + o'yiq tagidagi yupqa qatlam. */
function cutGeometry(p: Part): THREE.BufferGeometry {
  const loops = p.loops!;
  type MP = [number, number][][][];
  let R: MP = [[ring(loops[0])]];
  const lineLoops = p.lineLoops || loops.length;
  if (loops.length > 1) R = polygonClipping.difference(R as never, ...(loops.slice(1).map((l) => [[ring(l)]]) as never[])) as MP;
  void lineLoops;
  const cutPolys = (p.cuts || []).map((c) => [[ring(c.loop)]] as MP);
  const F = polygonClipping.difference(R as never, ...(cutPolys as never[])) as MP;
  const thick = p.thick || 0;
  const geos = extrudeMP(F, thick, 0);
  (p.cuts || []).forEach((c, i) => {
    const rest = thick - c.depth;
    if (rest <= 0.01) return;
    const P = polygonClipping.intersection(R as never, cutPolys[i] as never) as MP;
    extrudeMP(P, rest, c.top ? 0 : c.depth).forEach((g) => geos.push(g));
  });
  if (!geos.length) throw new Error("o'yiqdan keyin geometriya qolmadi");
  return mergeGeos(geos);
}

export class LabEngine {
  readonly canvas: HTMLCanvasElement;
  private host: HTMLElement;
  private overlay: HTMLDivElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private root = new THREE.Group();
  private grid: THREE.GridHelper | null = null;
  private axesScene = new THREE.Scene();
  private axesCam = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  private entries = new Map<string, Entry>();
  private list: Entry[] = [];
  private center = new THREE.Vector3();
  private radius = 1000;
  private off = new THREE.Vector3();
  private dirty = true;
  private raf = 0;
  private fly: { t0: number; ms: number; p0: THREE.Vector3; q0: THREE.Vector3; p1: THREE.Vector3; q1: THREE.Vector3 } | null = null;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private vis: VisualState = { selected: new Set(), hidden: new Set(), isolate: false, xray: false, edges: true, main: new Set(), attached: new Set(), pickable: null };
  private hoverId: string | null = null;
  private tool: EngineTool = 'select';
  private theme: EngineTheme = { edge: '#25303B', sel: '#E39A00', grid: '#B4C0CA', main: '#B3602A', attached: '#1F7A55', hover: '#3B82F6', measure: '#C2410C' };
  private measure: { a: THREE.Vector3 | null; b: THREE.Vector3 | null; obj: THREE.Group | null; label: HTMLDivElement } ;
  private boxEl: HTMLDivElement;
  private down: { x: number; y: number; button: number; shift: boolean; ctrl: boolean } | null = null;
  private boxing = false;
  private showAxes = true;
  private ro: ResizeObserver;
  private explodeK = 0;
  private entityOf: (id: string) => string = (id) => id;
  private disposed = false;
  private hoverRaf = 0;
  private lastMove: PointerEvent | null = null;
  private camTimer: ReturnType<typeof setTimeout> | null = null;
  private heavy = false;
  private textures = new Map<string, string>();
  private reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  constructor(host: HTMLElement, private cb: EngineCallbacks = {}) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lab-canvas';
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    host.appendChild(this.canvas);
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    host.appendChild(this.overlay);
    this.boxEl = document.createElement('div');
    this.boxEl.className = 'lab-boxsel';
    this.boxEl.hidden = true;
    this.overlay.appendChild(this.boxEl);
    const label = document.createElement('div');
    label.className = 'lab-measure-label';
    label.hidden = true;
    this.overlay.appendChild(label);
    this.measure = { a: null, b: null, obj: null, label };

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.autoClear = false;
    this.camera = new THREE.PerspectiveCamera(38, 1, 1, 100000);
    this.camera.position.set(2200, 1600, 2600);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.screenSpacePanning = true;
    this.controls.rotateSpeed = 0.85;
    this.controls.addEventListener('change', () => { this.dirty = true; this.scheduleCam(); });

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a97a4, 0.9));
    const d1 = new THREE.DirectionalLight(0xffffff, 1.0); d1.position.set(1, 2, 1.5); this.scene.add(d1);
    const d2 = new THREE.DirectionalLight(0xffffff, 0.45); d2.position.set(-1.5, 0.6, -1); this.scene.add(d2);
    this.scene.add(this.root);

    // o'qlar ko'rsatkichi
    const ax = new THREE.AxesHelper(1);
    this.axesScene.add(ax);
    (['X', 'Y', 'Z'] as const).forEach((t, i) => {
      const s = this.textSprite(t, ['#D64545', '#2E9E5B', '#3B6FD6'][i]);
      s.position.set(i === 0 ? 1.25 : 0, i === 1 ? 1.25 : 0, i === 2 ? 1.25 : 0);
      s.scale.set(0.42, 0.42, 0.42);
      this.axesScene.add(s);
    });

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bindPointer();
    const loop = (now: number) => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      this.tick(now);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /* ---------- umumiy ---------- */
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.clearModel();
    this.renderer.dispose();
    this.canvas.remove();
    this.overlay.remove();
  }

  setTheme(t: Partial<EngineTheme>) {
    this.theme = { ...this.theme, ...t };
    this.buildGrid();
    this.applyVisual();
  }

  private textSprite(text: string, color: string): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.font = '600 40px Inter, system-ui, sans-serif';
    g.fillStyle = color;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 32, 34);
    const tex = new THREE.CanvasTexture(c);
    return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private scheduleCam() {
    if (this.camTimer) clearTimeout(this.camTimer);
    this.camTimer = setTimeout(() => this.cb.onCameraChange?.(), 600);
  }

  private tick(now: number) {
    if (this.fly) {
      const k = Math.min(1, (now - this.fly.t0) / this.fly.ms);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.camera.position.lerpVectors(this.fly.p0, this.fly.p1, e);
      this.controls.target.lerpVectors(this.fly.q0, this.fly.q1, e);
      if (k >= 1) this.fly = null;
      this.dirty = true;
    }
    const changed = this.controls.update();
    if (!changed && !this.dirty) return;
    this.dirty = false;
    const r = this.renderer;
    const w = this.host.clientWidth, h = this.host.clientHeight;
    r.setViewport(0, 0, w, h);
    r.setScissorTest(false);
    r.clear();
    r.render(this.scene, this.camera);
    if (this.showAxes) {
      const s = 96;
      r.clearDepth();
      r.setScissorTest(true);
      r.setScissor(8, 8, s, s);
      r.setViewport(8, 8, s, s);
      const dirv = this.camera.position.clone().sub(this.controls.target).normalize().multiplyScalar(4.2);
      this.axesCam.position.copy(dirv);
      this.axesCam.up.copy(this.camera.up);
      this.axesCam.lookAt(0, 0, 0);
      r.render(this.axesScene, this.axesCam);
      r.setScissorTest(false);
      r.setViewport(0, 0, w, h);
    }
    this.updateLabel();
  }

  requestRender() { this.dirty = true; }

  /* ---------- model ---------- */
  private clearModel() {
    this.root.children.slice().forEach((o) => this.root.remove(o));
    this.entries.forEach((e) => {
      e.mesh.geometry.dispose();
      e.mats.forEach((m) => { m.map?.dispose(); m.dispose(); });
      e.edge.geometry.dispose();
      (e.edge.material as THREE.Material).dispose();
    });
    this.entries.clear();
    this.list = [];
    this.clearMeasure();
  }

  setTextures(map: Map<string, string>) { this.textures = map; }

  load(parts: Part[]): { failedCuts: number } {
    this.clearModel();
    let failedCuts = 0;
    this.heavy = parts.reduce((s, p) => s + (p.tris || 0), 0) > 250000;
    for (const p of parts) {
      if (p.geom === 'none') continue;
      let geo: THREE.BufferGeometry;
      const base = new THREE.Matrix4();
      if (p.geom === 'mesh' && p.positions) {
        geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
        if (p.uvs) geo.setAttribute('uv', new THREE.BufferAttribute(p.uvs, 2));
        geo.computeVertexNormals();
        (p.matGroups || []).forEach((g, i) => geo.addGroup(g.start, g.count, i));
      } else if (p.geom === 'contour' && p.loops) {
        geo = this.contourGeo(p, () => failedCuts++);
        base.compose(new THREE.Vector3(...(p.pos || [0, 0, 0])), new THREE.Quaternion(...(p.quat || [0, 0, 0, 1])), new THREE.Vector3(1, 1, 1));
      } else {
        const a = p.boxMin || [0, 0, 0], b = p.boxMax || [0, 0, 0];
        geo = new THREE.BoxGeometry(Math.max(b[0] - a[0], 0.5), Math.max(b[1] - a[1], 0.5), Math.max(b[2] - a[2], 0.5));
        geo.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
        if (p.pos) base.compose(new THREE.Vector3(...p.pos), new THREE.Quaternion(...(p.quat || [0, 0, 0, 1])), new THREE.Vector3(1, 1, 1));
      }
      const isMesh = p.geom === 'mesh';
      const groups = isMesh && p.matGroups && p.matGroups.length ? p.matGroups : [{ material: p.material, color: p.color, texName: '', start: 0, count: 0 }];
      const mats = groups.map((g) => {
        const m = new THREE.MeshStandardMaterial({ color: g.color || p.color, roughness: 0.8, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, side: isMesh ? THREE.DoubleSide : THREE.FrontSide });
        if (g.texName) {
          const key = g.texName.split(/[\\/]/).pop()!.toLowerCase();
          const url = this.textures.get(key);
          if (url) new THREE.TextureLoader().load(url, (t) => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; m.map = t; m.color.set(0xffffff); m.needsUpdate = true; this.dirty = true; });
        }
        return m;
      });
      const mesh = new THREE.Mesh(geo, mats.length === 1 ? mats[0] : mats);
      mesh.matrixAutoUpdate = false;
      mesh.userData.pid = p.id;
      const lazy = this.heavy && isMesh;
      const edge = new THREE.LineSegments(lazy ? new THREE.BufferGeometry() : new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: this.theme.edge, transparent: true }));
      edge.raycast = () => undefined;
      mesh.add(edge);
      this.root.add(mesh);
      const e: Entry = { part: p, mesh, edge, edgeLazy: lazy, base, glue: new THREE.Matrix4(), explode: new THREE.Vector3(), mats };
      this.entries.set(p.id, e);
      this.list.push(e);
      this.updateMatrix(e);
    }
    this.frame();
    return { failedCuts };
  }

  private contourGeo(p: Part, onFail: () => void): THREE.BufferGeometry {
    if (p.kind === 'panel' && p.cuts && p.cuts.length) {
      try { return cutGeometry(p); } catch { onFail(); }
    }
    const v2 = (lp: Vec2[]) => lp.map((q) => new THREE.Vector2(q[0], q[1]));
    const shape = new THREE.Shape(v2(p.loops![0]));
    for (let i = 1; i < p.loops!.length; i++) shape.holes.push(new THREE.Path(v2(p.loops![i])));
    const g = new THREE.ExtrudeGeometry(shape, { depth: Math.max(p.thick || 0, 0.1), bevelEnabled: false, steps: 1 });
    if (p.zShift) g.translate(0, 0, p.zShift);
    return g;
  }

  /** Model markazga va polga qo'yiladi; grid va kamera chegaralari shu bo'yicha. */
  private frame() {
    const box = new THREE.Box3();
    for (const e of this.list) {
      if (!e.mesh.geometry.boundingBox) e.mesh.geometry.computeBoundingBox();
      box.union(e.mesh.geometry.boundingBox!.clone().applyMatrix4(e.base));
    }
    if (box.isEmpty()) { box.set(new THREE.Vector3(-500, 0, -500), new THREE.Vector3(500, 1000, 500)); }
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    this.off.set(-c.x, -box.min.y, -c.z);
    this.root.position.copy(this.off);
    this.root.updateMatrixWorld(true);
    this.center.set(0, size.y / 2, 0);
    this.radius = Math.max(size.length() / 2, 1);
    this.camera.near = Math.max(0.5, this.radius / 500);
    this.camera.far = this.radius * 60;
    this.camera.updateProjectionMatrix();
    this.controls.minDistance = this.radius * 0.02;
    this.controls.maxDistance = this.radius * 14;
    for (const e of this.list) {
      const b = e.mesh.geometry.boundingBox!.clone().applyMatrix4(e.base);
      e.explode.copy(b.getCenter(new THREE.Vector3()).add(this.off).sub(this.center));
    }
    this.modelSize = size;
    this.buildGrid();
  }

  private modelSize = new THREE.Vector3(1000, 1000, 1000);
  private gridOn = true;

  private buildGrid() {
    if (this.grid) { this.scene.remove(this.grid); this.grid.geometry.dispose(); (this.grid.material as THREE.Material).dispose(); this.grid = null; }
    if (!this.gridOn) { this.dirty = true; return; }
    const size = Math.ceil((Math.max(this.modelSize.x, this.modelSize.z) * 2.6) / 100) * 100 || 2000;
    const div = Math.min(60, Math.max(10, Math.round(size / 100)));
    this.grid = new THREE.GridHelper(size, div, new THREE.Color(this.theme.grid), new THREE.Color(this.theme.grid));
    const gm = this.grid.material as THREE.LineBasicMaterial;
    gm.transparent = true;
    gm.opacity = 0.55;
    this.grid.position.y = -0.5;
    this.scene.add(this.grid);
    this.dirty = true;
  }

  setGrid(on: boolean) { this.gridOn = on; this.buildGrid(); }
  setAxes(on: boolean) { this.showAxes = on; this.dirty = true; }

  private updateMatrix(e: Entry) {
    const m = e.mesh.matrix;
    m.copy(e.glue).multiply(e.base);
    if (this.explodeK) m.premultiply(tmpM.makeTranslation(e.explode.x * this.explodeK, e.explode.y * this.explodeK, e.explode.z * this.explodeK));
    e.mesh.matrixWorldNeedsUpdate = true;
    this.dirty = true;
  }

  /** Kompozit a'zolarining siljish matritsalari (model fazosida). */
  setMatrices(map: Record<string, M4>) {
    for (const e of this.list) {
      const m = map[e.part.id];
      if (m) e.glue.fromArray(m); else e.glue.identity();
      this.updateMatrix(e);
    }
    this.root.updateMatrixWorld(true);
  }

  setExplode(k: number, entityOf?: (id: string) => string) {
    this.explodeK = k * 1.1;
    if (entityOf) this.entityOf = entityOf;
    // kompozit a'zolari bir xil siljiydi: kompozit markazi bo'yicha
    const ent = new Map<string, { sum: THREE.Vector3; n: number }>();
    for (const e of this.list) {
      const id = this.entityOf(e.part.id);
      const b = e.mesh.geometry.boundingBox!.clone().applyMatrix4(tmpM.copy(e.glue).multiply(e.base));
      const c = b.getCenter(new THREE.Vector3()).add(this.off).sub(this.center);
      const x = ent.get(id) || { sum: new THREE.Vector3(), n: 0 };
      x.sum.add(c); x.n++;
      ent.set(id, x);
    }
    for (const e of this.list) {
      const x = ent.get(this.entityOf(e.part.id))!;
      e.explode.copy(x.sum).divideScalar(x.n);
      this.updateMatrix(e);
    }
    this.root.updateMatrixWorld(true);
    const need = this.viewDistance(this.radius * (1 + 0.55 * k) * 1.08);
    const d = this.camera.position.clone().sub(this.controls.target);
    if (d.length() < need) { this.camera.position.copy(this.controls.target).addScaledVector(d.normalize(), need); this.dirty = true; }
  }

  /* ---------- ko'rinish holati ---------- */
  setVisual(v: Partial<VisualState>) {
    this.vis = { ...this.vis, ...v };
    this.applyVisual();
  }

  private applyVisual() {
    const v = this.vis;
    const anySel = v.selected.size > 0;
    const sel = new THREE.Color(this.theme.sel), mov = new THREE.Color(this.theme.main), tgt = new THREE.Color(this.theme.attached);
    for (const e of this.list) {
      const id = e.part.id;
      const isSel = v.selected.has(id);
      const dim = (v.isolate && anySel && !isSel) || (v.pickable != null && !v.pickable.has(id) && !v.main.has(id) && !v.attached.has(id));
      e.mesh.visible = !v.hidden.has(id) && !(v.isolate && anySel && !isSel && false);
      const op = dim ? 0.08 : v.xray ? 0.35 : 1;
      for (const m of e.mats) {
        m.transparent = op < 1;
        m.opacity = op;
        m.depthWrite = op >= 1;
        if (v.main.has(id)) m.emissive.copy(mov).multiplyScalar(0.45);
        else if (v.attached.has(id)) m.emissive.copy(tgt).multiplyScalar(0.4);
        else if (isSel) m.emissive.copy(sel).multiplyScalar(0.32);
        else if (id === this.hoverId && !dim) m.emissive.set(0x262626);
        else m.emissive.set(0x000000);
      }
      if ((isSel || v.main.has(id) || v.attached.has(id)) && e.edgeLazy) this.ensureEdges(e);
      e.edge.visible = v.edges || isSel || v.main.has(id) || v.attached.has(id);
      const em = e.edge.material as THREE.LineBasicMaterial;
      em.color.set(v.main.has(id) ? this.theme.main : v.attached.has(id) ? this.theme.attached : isSel ? this.theme.sel : this.theme.edge);
      em.opacity = dim ? 0.1 : 1;
      e.mesh.userData.dim = dim;
    }
    this.dirty = true;
  }

  private ensureEdges(e: Entry) {
    if (!e.edgeLazy) return;
    e.edge.geometry.dispose();
    e.edge.geometry = new THREE.EdgesGeometry(e.mesh.geometry, 25);
    e.edgeLazy = false;
  }

  /* ---------- kamera ---------- */
  private viewDistance(r: number) {
    const vf = (this.camera.fov * Math.PI) / 180;
    const hf = Math.atan(Math.tan(vf / 2) * this.camera.aspect);
    return r / Math.sin(Math.min(vf / 2, hf));
  }

  private flyTo(p1: THREE.Vector3, q1: THREE.Vector3, instant?: boolean) {
    if (instant || this.reduceMotion) {
      this.camera.position.copy(p1); this.controls.target.copy(q1); this.controls.update(); this.dirty = true; this.fly = null; return;
    }
    this.fly = { t0: performance.now(), ms: 460, p0: this.camera.position.clone(), q0: this.controls.target.clone(), p1: p1.clone(), q1: q1.clone() };
  }

  setView(name: 'iso' | 'front' | 'side' | 'top' | 'back', instant?: boolean) {
    const dirs: Record<string, [number, number, number]> = { iso: [1, 0.75, 1.15], front: [0, 0, 1], back: [0, 0, -1], side: [1, 0, 0], top: [0, 1, 0.0001] };
    const d = new THREE.Vector3(...dirs[name]).normalize();
    const r = this.radius * (1 + 0.55 * (this.explodeK / 1.1)) * 1.08;
    this.flyTo(this.center.clone().addScaledVector(d, this.viewDistance(r)), this.center, instant);
  }

  focus(ids: string[]) {
    const box = new THREE.Box3();
    for (const id of ids) { const e = this.entries.get(id); if (e && e.mesh.visible) box.expandByObject(e.mesh); }
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 40);
    const dirv = this.camera.position.clone().sub(this.controls.target).normalize();
    this.flyTo(c.clone().addScaledVector(dirv, this.viewDistance(r) * 1.25), c);
  }

  getCamera(): { pos: Vec3; target: Vec3 } {
    return { pos: v3(this.camera.position), target: v3(this.controls.target) };
  }

  setCamera(c: { pos: Vec3; target: Vec3 }) {
    this.flyTo(new THREE.Vector3(...c.pos), new THREE.Vector3(...c.target), true);
  }

  /* ---------- tanlash ---------- */
  private setNdc(x: number, y: number) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
  }

  pick(x: number, y: number, only?: Set<string> | null): PickHit | null {
    this.setNdc(x, y);
    this.root.updateMatrixWorld(true);
    const targets = this.list.filter((e) => e.mesh.visible && !e.mesh.userData.dim && (!only || only.has(e.part.id))).map((e) => e.mesh);
    const hit = this.ray.intersectObjects(targets, false)[0];
    if (!hit) return null;
    return { partId: hit.object.userData.pid, point: hit.point.clone(), faceIndex: hit.faceIndex ?? -1 };
  }

  setTool(t: EngineTool) {
    this.tool = t;
    this.canvas.style.cursor = t === 'box' || t === 'measure' ? 'crosshair' : 'grab';
    if (t !== 'measure') this.clearMeasure();
  }

  private bindPointer() {
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerdown', (ev) => {
      this.down = { x: ev.clientX, y: ev.clientY, button: ev.button, shift: ev.shiftKey, ctrl: ev.ctrlKey || ev.metaKey };
      if (ev.button === 0 && (this.tool === 'box' || (this.tool === 'select' && ev.shiftKey))) {
        this.boxing = true;
        this.controls.enabled = false;
        c.setPointerCapture(ev.pointerId);
      }
    });
    c.addEventListener('pointermove', (ev) => {
      if (this.boxing && this.down) { this.drawBox(this.down.x, this.down.y, ev.clientX, ev.clientY); return; }
      if (ev.buttons) return;
      this.lastMove = ev;
      if (this.hoverRaf) return;
      this.hoverRaf = requestAnimationFrame(() => {
        this.hoverRaf = 0;
        const e2 = this.lastMove!;
        const hit = this.pick(e2.clientX, e2.clientY, this.vis.pickable);
        const id = hit ? hit.partId : null;
        if (id !== this.hoverId) { this.hoverId = id; this.applyVisual(); }
        this.cb.onHover?.(hit, e2);
      });
    });
    c.addEventListener('pointerup', (ev) => {
      const d = this.down;
      this.down = null;
      if (this.boxing) {
        this.boxing = false;
        this.controls.enabled = true;
        this.boxEl.hidden = true;
        if (d) {
          if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 4) this.finishBox(d.x, d.y, ev.clientX, ev.clientY, d.ctrl || d.shift);
          else this.cb.onClick?.(this.pick(ev.clientX, ev.clientY, this.vis.pickable), ev);
        }
        return;
      }
      if (!d) return;
      const moved = Math.hypot(ev.clientX - d.x, ev.clientY - d.y);
      if (moved >= 5) return;
      if (d.button === 2) { this.cb.onContext?.(this.pick(ev.clientX, ev.clientY, this.vis.pickable), ev.clientX, ev.clientY); return; }
      if (d.button !== 0) return;
      if (this.tool === 'measure') { this.measureClick(ev.clientX, ev.clientY); return; }
      this.cb.onClick?.(this.pick(ev.clientX, ev.clientY, this.vis.pickable), ev);
    });
    c.addEventListener('dblclick', (ev) => this.cb.onDblClick?.(this.pick(ev.clientX, ev.clientY, this.vis.pickable), ev));
    c.addEventListener('pointerleave', () => {
      if (this.hoverId) { this.hoverId = null; this.applyVisual(); }
      this.cb.onHover?.(null, new PointerEvent('pointerleave'));
    });
  }

  private drawBox(x0: number, y0: number, x1: number, y1: number) {
    const r = this.host.getBoundingClientRect();
    const l = Math.min(x0, x1) - r.left, t = Math.min(y0, y1) - r.top;
    Object.assign(this.boxEl.style, { left: l + 'px', top: t + 'px', width: Math.abs(x1 - x0) + 'px', height: Math.abs(y1 - y0) + 'px' });
    this.boxEl.hidden = false;
  }

  private finishBox(x0: number, y0: number, x1: number, y1: number, additive: boolean) {
    const r = this.canvas.getBoundingClientRect();
    const minx = Math.min(x0, x1), maxx = Math.max(x0, x1), miny = Math.min(y0, y1), maxy = Math.max(y0, y1);
    const ids: string[] = [];
    const v = new THREE.Vector3();
    this.root.updateMatrixWorld(true);
    for (const e of this.list) {
      if (!e.mesh.visible || e.mesh.userData.dim) continue;
      const b = new THREE.Box3().setFromObject(e.mesh);
      b.getCenter(v).project(this.camera);
      if (v.z > 1) continue;
      const sx = r.left + ((v.x + 1) / 2) * r.width, sy = r.top + ((1 - v.y) / 2) * r.height;
      if (sx >= minx && sx <= maxx && sy >= miny && sy <= maxy) ids.push(e.part.id);
    }
    this.cb.onBoxSelect?.(ids, additive);
  }

  /* ---------- o'lchash ---------- */
  private clearMeasure() {
    if (this.measure.obj) { this.root.remove(this.measure.obj); this.measure.obj.traverse((o) => { const m = o as THREE.Mesh; m.geometry?.dispose(); (m.material as THREE.Material | undefined)?.dispose?.(); }); }
    this.measure.obj = null;
    this.measure.a = this.measure.b = null;
    this.measure.label.hidden = true;
    this.dirty = true;
  }

  private snapPoint(hit: PickHit, x: number, y: number): THREE.Vector3 {
    const e = this.entries.get(hit.partId);
    if (!e) return hit.point;
    this.ensureEdges(e);
    const pos = e.edge.geometry.attributes.position;
    if (!pos) return hit.point;
    const r = this.canvas.getBoundingClientRect();
    let best: THREE.Vector3 | null = null, bd = 12;
    const w = new THREE.Vector3(), s = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      w.fromBufferAttribute(pos, i).applyMatrix4(e.mesh.matrixWorld);
      s.copy(w).project(this.camera);
      const sx = r.left + ((s.x + 1) / 2) * r.width, sy = r.top + ((1 - s.y) / 2) * r.height;
      const d = Math.hypot(sx - x, sy - y);
      if (d < bd) { bd = d; best = w.clone(); }
    }
    return best || hit.point;
  }

  private measureClick(x: number, y: number) {
    const hit = this.pick(x, y);
    if (!hit) return;
    const p = this.snapPoint(hit, x, y).clone().sub(this.off); // model fazosi
    if (!this.measure.a || this.measure.b) { this.clearMeasure(); this.measure.a = p; }
    else this.measure.b = p;
    const g = new THREE.Group();
    const r = this.radius * 0.006;
    const mat = new THREE.MeshBasicMaterial({ color: this.theme.measure, depthTest: false });
    for (const q of [this.measure.a, this.measure.b]) {
      if (!q) continue;
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), mat);
      s.position.copy(q);
      s.renderOrder = 10;
      g.add(s);
    }
    if (this.measure.a && this.measure.b) {
      const lg = new THREE.BufferGeometry().setFromPoints([this.measure.a, this.measure.b]);
      const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: this.theme.measure, depthTest: false }));
      line.renderOrder = 10;
      g.add(line);
    }
    if (this.measure.obj) this.root.remove(this.measure.obj);
    this.measure.obj = g;
    this.root.add(g);
    const dist = this.measure.a && this.measure.b ? this.measure.a.distanceTo(this.measure.b) : null;
    this.cb.onMeasure?.(dist, this.measure.a ? v3(this.measure.a) : null, this.measure.b ? v3(this.measure.b) : null);
    this.dirty = true;
  }

  private updateLabel() {
    const m = this.measure;
    if (!m.a || !m.b) { m.label.hidden = true; return; }
    const mid = m.a.clone().add(m.b).multiplyScalar(0.5).add(this.off).project(this.camera);
    const w = this.host.clientWidth, h = this.host.clientHeight;
    m.label.textContent = (Math.round(m.a.distanceTo(m.b) * 10) / 10).toFixed(1) + ' mm';
    m.label.style.left = ((mid.x + 1) / 2) * w + 'px';
    m.label.style.top = ((1 - mid.y) / 2) * h + 'px';
    m.label.hidden = mid.z > 1;
  }

  /** Detalning ekran nuqtasi (kontekst menyu va tooltip uchun). */
  partIds(): string[] { return this.list.map((e) => e.part.id); }
}
