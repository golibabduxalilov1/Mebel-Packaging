/*
 * Upokovka muhiti 3D sahnasi (F26, F27). Laboratoriyadan alohida: qutilar kraft karton ko'rinishida.
 * Koordinatalar: quti ichki o'qlari x = uzunlik, y = eni, z = balandlik (mm). three.js da X = x, Y = z, Z = y.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { PackBox, PackItemPlaced } from '../types';

export interface PackCallbacks {
  onSelect?(uid: string | null): void;
  onMoveRequest?(uid: string, toBox: number): void;
  onBoxClick?(no: number): void;
}

export interface PackView {
  boxNo: number | null; // null = barcha qutilar
  lid: boolean;
  layer: number | null; // shu qatlamgacha ko'rsatish (null = hammasi)
  explode: number; // 0..1 qatlamlarni ajratish
  top: boolean; // yuqoridan 2D
  selected: string | null;
}

const KRAFT = 0xc9a479, KRAFT_DARK = 0x8a6a46;

function colorFor(name: string): THREE.Color {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const c = new THREE.Color();
  c.setHSL(((h % 360) / 360), 0.32, 0.72);
  return c;
}

interface ItemObj { item: PackItemPlaced; box: number; mesh: THREE.Mesh; edges: THREE.LineSegments; base: THREE.Vector3 }

export class PackEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private persp: THREE.PerspectiveCamera;
  private ortho: THREE.OrthographicCamera;
  private camera: THREE.Camera;
  private controls: OrbitControls;
  private root = new THREE.Group();
  private boxes: PackBox[] = [];
  private boxGroups = new Map<number, { g: THREE.Group; lid: THREE.Object3D; origin: THREE.Vector3; box: PackBox; label: HTMLDivElement }>();
  private items: ItemObj[] = [];
  private view: PackView = { boxNo: null, lid: false, layer: null, explode: 0, top: false, selected: null };
  private overlay: HTMLDivElement;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private raf = 0;
  private dirty = true;
  private ro: ResizeObserver;
  private drag: { obj: ItemObj; start: THREE.Vector3; plane: THREE.Plane; moved: boolean } | null = null;
  private ghost: THREE.Mesh | null = null;
  private disposed = false;
  private canvas: HTMLCanvasElement;

  constructor(private host: HTMLElement, private cb: PackCallbacks = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
    host.appendChild(this.canvas);
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    host.appendChild(this.overlay);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.persp = new THREE.PerspectiveCamera(36, 1, 1, 200000);
    this.ortho = new THREE.OrthographicCamera(-1000, 1000, 1000, -1000, -100000, 100000);
    this.camera = this.persp;
    this.controls = new OrbitControls(this.persp, this.canvas);
    this.controls.enableDamping = true;
    this.controls.screenSpacePanning = true;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    this.scene.add(new THREE.HemisphereLight(0xfffaf0, 0x9c8c78, 0.8));
    const d = new THREE.DirectionalLight(0xffffff, 0.9); d.position.set(1, 2.2, 1.4); this.scene.add(d);
    this.scene.add(this.root);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.bind();
    const loop = () => { if (this.disposed) return; this.raf = requestAnimationFrame(loop); this.tick(); };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.controls.dispose();
    this.clear();
    this.renderer.dispose();
    this.canvas.remove();
    this.overlay.remove();
  }

  private resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    this.fitOrtho();
    this.dirty = true;
  }

  private tick() {
    const ch = this.controls.update();
    if (!ch && !this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.updateLabels();
  }

  private clear() {
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mm = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mm)) mm.forEach((x) => x.dispose()); else mm?.dispose?.();
    });
    this.root.clear();
    this.boxGroups.forEach((b) => b.label.remove());
    this.boxGroups.clear();
    this.items = [];
  }

  /** Natijani yuklash. Kamera holati saqlanadi, agar keepCamera true bo'lsa. */
  setBoxes(boxes: PackBox[], keepCamera = false) {
    this.clear();
    this.boxes = boxes;
    const gap = 400;
    let x = 0;
    for (const b of boxes) {
      const g = new THREE.Group();
      const origin = new THREE.Vector3(x, 0, 0);
      g.position.copy(origin);
      const wall = (b.l - b.innerL) / 2 || 0;
      // karton devorlari: yarim shaffof, qalinlik bilan
      const outer = new THREE.BoxGeometry(b.l, b.h, b.w);
      outer.translate(b.l / 2 - wall, b.h / 2 - wall, b.w / 2 - wall);
      const shell = new THREE.Mesh(outer, new THREE.MeshStandardMaterial({ color: KRAFT, transparent: true, opacity: 0.16, roughness: 0.95, depthWrite: false, side: THREE.DoubleSide }));
      shell.userData.box = b.no;
      shell.renderOrder = 2;
      g.add(shell);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(outer), new THREE.LineBasicMaterial({ color: KRAFT_DARK }));
      g.add(edges);
      // tag (pol)
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(b.l, b.w), new THREE.MeshStandardMaterial({ color: KRAFT, roughness: 1 }));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(b.l / 2 - wall, -wall + 0.5, b.w / 2 - wall);
      floor.userData.box = b.no;
      g.add(floor);
      // qopqoq
      const lid = new THREE.Group();
      const lidGeo = new THREE.BoxGeometry(b.l + 6, Math.max(wall, 3), b.w + 6);
      const lidMesh = new THREE.Mesh(lidGeo, new THREE.MeshStandardMaterial({ color: KRAFT, roughness: 0.9 }));
      lidMesh.position.set(b.l / 2 - wall, b.h - wall + Math.max(wall, 3) / 2, b.w / 2 - wall);
      lid.add(lidMesh);
      const tape = new THREE.Mesh(new THREE.BoxGeometry(b.l + 8, Math.max(wall, 3) + 1, Math.min(60, b.w * 0.15)), new THREE.MeshStandardMaterial({ color: 0xa7814f, roughness: 0.6 }));
      tape.position.copy(lidMesh.position);
      lid.add(tape);
      g.add(lid);
      // elementlar
      for (const it of b.items) {
        const geo = new THREE.BoxGeometry(Math.max(it.l - 1, 0.5), Math.max(it.h - 0.6, 0.5), Math.max(it.w - 1, 0.5));
        const mat = new THREE.MeshStandardMaterial({ color: it.color && /^#[0-9a-f]{6}$/i.test(it.color) ? new THREE.Color(it.color) : colorFor(it.name + it.material), roughness: 0.75, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        const mesh = new THREE.Mesh(geo, mat);
        const base = new THREE.Vector3(it.x + it.l / 2, it.z + it.h / 2, it.y + it.w / 2);
        mesh.position.copy(base);
        mesh.userData.uid = it.uid;
        const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: 0x4a4036, transparent: true, opacity: 0.55 }));
        mesh.add(e);
        g.add(mesh);
        this.items.push({ item: it, box: b.no, mesh, edges: e, base });
      }
      const label = document.createElement('div');
      label.className = 'pack-label3d';
      this.overlay.appendChild(label);
      this.root.add(g);
      this.boxGroups.set(b.no, { g, lid, origin, box: b, label });
      x += b.l + gap;
    }
    this.apply(!keepCamera);
  }

  setView(v: Partial<PackView>, refit = false) {
    const prevBox = this.view.boxNo, prevTop = this.view.top;
    this.view = { ...this.view, ...v };
    this.apply(refit || prevBox !== this.view.boxNo || prevTop !== this.view.top);
  }

  setLabelText(fn: (b: PackBox) => string) {
    this.boxGroups.forEach((x) => { x.label.innerHTML = fn(x.box); });
    this.dirty = true;
  }

  private apply(refit: boolean) {
    const v = this.view;
    const layerH = new Map<number, number>();
    for (const o of this.items) layerH.set(o.item.layer, Math.max(layerH.get(o.item.layer) || 0, o.item.h));
    this.boxGroups.forEach((b, no) => {
      const vis = v.boxNo == null || v.boxNo === no;
      b.g.visible = vis;
      b.lid.visible = v.lid && !v.top;
      b.label.style.display = vis ? '' : 'none';
    });
    for (const o of this.items) {
      const lay = o.item.layer;
      o.mesh.visible = v.layer == null || lay <= v.layer;
      const lift = v.explode * lay * Math.max(80, (layerH.get(lay) || 20) * 4);
      o.mesh.position.set(o.base.x, o.base.y + lift, o.base.z);
      const sel = v.selected === o.item.uid;
      const m = o.mesh.material as THREE.MeshStandardMaterial;
      m.emissive.set(sel ? 0xe39a00 : 0x000000);
      m.emissiveIntensity = sel ? 0.45 : 0;
      (o.edges.material as THREE.LineBasicMaterial).color.set(sel ? 0xb36b00 : 0x4a4036);
      (o.edges.material as THREE.LineBasicMaterial).opacity = sel ? 1 : 0.55;
    }
    if (v.top) {
      this.camera = this.ortho;
      this.controls.object = this.ortho;
      this.controls.enableRotate = false;
    } else {
      this.camera = this.persp;
      this.controls.object = this.persp;
      this.controls.enableRotate = true;
    }
    if (refit) this.fit();
    this.dirty = true;
  }

  private visibleBounds(): THREE.Box3 {
    const box = new THREE.Box3();
    this.boxGroups.forEach((b) => {
      if (!b.g.visible) return;
      const bb = b.box;
      box.expandByPoint(b.origin.clone().add(new THREE.Vector3(-20, 0, -20)));
      box.expandByPoint(b.origin.clone().add(new THREE.Vector3(bb.l + 20, bb.h * (1 + this.view.explode * 0.8), bb.w + 20)));
    });
    if (box.isEmpty()) box.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1000, 500, 600));
    return box;
  }

  private fitOrtho() {
    const b = this.visibleBounds();
    const c = b.getCenter(new THREE.Vector3());
    const s = b.getSize(new THREE.Vector3());
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    const k = Math.max(s.x / w, s.z / h) * 1.15;
    this.ortho.left = (-w / 2) * k; this.ortho.right = (w / 2) * k; this.ortho.top = (h / 2) * k; this.ortho.bottom = (-h / 2) * k;
    this.ortho.position.set(c.x, c.y + 10000, c.z);
    this.ortho.up.set(0, 0, -1);
    this.ortho.lookAt(c.x, c.y, c.z);
    this.ortho.zoom = 1;
    this.ortho.updateProjectionMatrix();
    if (this.view.top) this.controls.target.set(c.x, c.y, c.z);
  }

  fit() {
    if (this.view.top) { this.fitOrtho(); this.dirty = true; return; }
    const b = this.visibleBounds();
    const c = b.getCenter(new THREE.Vector3());
    const r = b.getSize(new THREE.Vector3()).length() / 2;
    const dist = r / Math.sin((this.persp.fov * Math.PI) / 360) * 1.05;
    const dir = new THREE.Vector3(0.9, 0.85, 1.25).normalize();
    this.persp.position.copy(c).addScaledVector(dir, dist);
    this.persp.near = Math.max(1, r / 400);
    this.persp.far = r * 80;
    this.persp.updateProjectionMatrix();
    this.controls.target.copy(c);
    this.controls.update();
    this.dirty = true;
  }

  private updateLabels() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = new THREE.Vector3();
    this.boxGroups.forEach((b) => {
      if (!b.g.visible) return;
      v.set(b.origin.x + b.box.l / 2, b.box.h * (1 + this.view.explode * 0.8) + 40, b.origin.z + b.box.w / 2).project(this.camera);
      b.label.style.left = ((v.x + 1) / 2) * w + 'px';
      b.label.style.top = ((1 - v.y) / 2) * h + 'px';
      b.label.style.display = v.z > 1 ? 'none' : '';
    });
  }

  /* ---------- tanlash va sudrash (F27) ---------- */
  private setNdc(x: number, y: number) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
  }

  private pickItem(x: number, y: number): ItemObj | null {
    this.setNdc(x, y);
    const meshes = this.items.filter((o) => o.mesh.visible && this.boxGroups.get(o.box)!.g.visible).map((o) => o.mesh);
    const hit = this.ray.intersectObjects(meshes, false)[0];
    return hit ? this.items.find((o) => o.mesh === hit.object) || null : null;
  }

  private pickBox(x: number, y: number): number | null {
    this.setNdc(x, y);
    const targets: THREE.Object3D[] = [];
    this.boxGroups.forEach((b) => { if (b.g.visible) b.g.children.forEach((c) => { if (c.userData.box) targets.push(c); }); });
    const hit = this.ray.intersectObjects(targets, false)[0];
    if (hit) return hit.object.userData.box as number;
    // pol tekisligida eng yaqin quti
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p)) return null;
    let best: number | null = null, bd = Infinity;
    this.boxGroups.forEach((b, no) => {
      if (!b.g.visible) return;
      const cx = b.origin.x + b.box.l / 2, cz = b.origin.z + b.box.w / 2;
      const d = Math.max(Math.abs(p.x - cx) - b.box.l / 2, Math.abs(p.z - cz) - b.box.w / 2);
      if (d < bd) { bd = d; best = no; }
    });
    return bd < 300 ? best : null;
  }

  private bind() {
    const c = this.canvas;
    let down: { x: number; y: number } | null = null;
    c.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0) return;
      down = { x: ev.clientX, y: ev.clientY };
      const o = this.pickItem(ev.clientX, ev.clientY);
      if (o && this.view.boxNo == null && this.boxes.length > 1) {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(o.mesh.getWorldPosition(new THREE.Vector3()).y));
        const start = new THREE.Vector3();
        this.ray.ray.intersectPlane(plane, start);
        this.drag = { obj: o, start, plane, moved: false };
        this.controls.enabled = false;
        c.setPointerCapture(ev.pointerId);
      }
    });
    c.addEventListener('pointermove', (ev) => {
      if (!this.drag || !down) return;
      if (!this.drag.moved && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 6) return;
      this.drag.moved = true;
      this.setNdc(ev.clientX, ev.clientY);
      const p = new THREE.Vector3();
      if (!this.ray.ray.intersectPlane(this.drag.plane, p)) return;
      if (!this.ghost) {
        const g = this.drag.obj.mesh.geometry.clone();
        this.ghost = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xe39a00, transparent: true, opacity: 0.45, depthTest: false }));
        this.ghost.renderOrder = 20;
        this.root.add(this.ghost);
      }
      this.ghost.position.copy(p).setY(p.y);
      this.dirty = true;
    });
    c.addEventListener('pointerup', (ev) => {
      const d = down;
      down = null;
      if (this.drag) {
        const dr = this.drag;
        this.drag = null;
        this.controls.enabled = true;
        if (this.ghost) { this.root.remove(this.ghost); this.ghost.geometry.dispose(); (this.ghost.material as THREE.Material).dispose(); this.ghost = null; this.dirty = true; }
        if (dr.moved) {
          const to = this.pickBox(ev.clientX, ev.clientY);
          if (to != null && to !== dr.obj.box) this.cb.onMoveRequest?.(dr.obj.item.uid, to);
          return;
        }
      }
      if (!d || Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 5) return;
      const o = this.pickItem(ev.clientX, ev.clientY);
      if (o) { this.cb.onSelect?.(o.item.uid); return; }
      const b = this.pickBox(ev.clientX, ev.clientY);
      if (b != null && this.view.boxNo == null) this.cb.onBoxClick?.(b);
      else this.cb.onSelect?.(null);
    });
    c.addEventListener('dblclick', (ev) => {
      const b = this.pickBox(ev.clientX, ev.clientY);
      if (b != null) this.cb.onBoxClick?.(b);
    });
  }
}
