/*
 * Laboratoriya holati (W1-W9). React'dan mustaqil: useSyncExternalStore orqali ulanadi.
 * Hujjat (LabDoc) o'zgarishlari faqat commit() orqali o'tadi: undo/redo, avtosaqlash va
 * 3D sahna bilan sinxronlash shu yerda.
 */
import { useSyncExternalStore } from 'react';
import { tr } from '../i18n';
import type { GlueLink, ImportResult, LabDoc, LabMode, Material, Part, PartEdit, SceneState } from '../types';
import {
  addGroup, assignGroup, autoRows, compositeParts, groupOfPart, normalizeGroups, removeGroup, renameGroup, detach, dissolve, editParts, entityMembers, entityOf, glue as glueDoc, materialMap, mergeRows,
  hasGeometry, newDoc, packItems, packSignature, partMatrices, resetParts, rowViews, splitRow, type PackItemIn, type RowView,
} from '../model/labdoc';
import type { LabEngine, PickHit } from './LabEngine';
import { entityCavities, type Cavity } from '../pack/cavity';

/** Yelimlash holati: asosiy birlik va unga yelimlanadigan birliklar (birlik = detal yoki kompozit id). */
export interface GlueState {
  main: string | null;
  attached: string[];
}

/** Qadam: 1 asosiy detalni tanla, 2 yelimlanadigan detallarni tanla, 3 "Yelimla". */
export type GlueStep = 1 | 2 | 3;

export function glueStepOf(g: GlueState): GlueStep {
  return !g.main ? 1 : g.attached.length ? 3 : 2;
}

/** "Yelimla" tugmasi o'chiq bo'lsa sababi (i18n kaliti), aks holda null. */
export function glueBlocker(g: GlueState | null): string | null {
  if (!g || !g.main) return 'glue.why.noMain';
  if (!g.attached.length) return 'glue.why.noAttached';
  return null;
}

export type LabTool = 'select' | 'box' | 'measure';
export type SideTab = 'model' | 'drawing' | 'data';
export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export interface LabState {
  ready: boolean;
  result: ImportResult | null;
  parts: Part[];
  doc: LabDoc;
  materials: Material[];
  views: RowView[];
  mode: LabMode;
  tool: LabTool;
  tab: SideTab;
  selected: Set<string>;
  hidden: Set<string>;
  isolate: boolean;
  xray: boolean;
  edges: boolean;
  grid: boolean;
  axes: boolean;
  explode: number;
  measure: number | null;
  glue: GlueState | null;
  canUndo: boolean;
  canRedo: boolean;
  save: SaveState;
  saveError: string;
  ctx: { x: number; y: number; partId: string | null } | null;
  hover: string | null;
  toast: { text: string; kind: 'info' | 'ok' | 'warn' | 'error'; id: number } | null;
  readOnly: boolean;
}

export interface LabPerms { editParts: boolean; merge: boolean; glue: boolean }

export interface LabSaver {
  (payload: { doc: LabDoc; scene: SceneState; items: PackItemIn[]; signature: string; summary: PartSummary[] }): Promise<void>;
}

export interface PartSummary {
  id: string; name: string; material: string; kind: string; L: number | null; W: number | null; T: number | null; weight: number | null; rowId: string;
}

const HISTORY = 100;
let toastSeq = 0;

export class LabStore {
  private s: LabState;
  private subs = new Set<() => void>();
  private past: LabDoc[] = [];
  private future: LabDoc[] = [];
  private engine: LabEngine | null = null;
  private byId = new Map<string, Part>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saver: LabSaver | null = null;
  perms: LabPerms = { editParts: true, merge: true, glue: true };

  constructor() {
    this.s = {
      ready: false, result: null, parts: [], doc: newDoc(), materials: [], views: [], mode: 'view', tool: 'select', tab: 'model',
      selected: new Set(), hidden: new Set(), isolate: false, xray: false, edges: true, grid: true, axes: true, explode: 0,
      measure: null, glue: null, canUndo: false, canRedo: false, save: 'idle', saveError: '', ctx: null, hover: null, toast: null, readOnly: false,
    };
  }

  /* ---------- obuna ---------- */
  get = () => this.s;
  subscribe = (fn: () => void) => { this.subs.add(fn); return () => { this.subs.delete(fn); }; };
  private set(patch: Partial<LabState>) {
    this.s = { ...this.s, ...patch };
    this.subs.forEach((f) => f());
  }

  toast(text: string, kind: 'info' | 'ok' | 'warn' | 'error' = 'info') { this.set({ toast: { text, kind, id: ++toastSeq } }); }

  /* ---------- yuklash ---------- */
  load(result: ImportResult, doc: LabDoc | null, scene: SceneState | null, materials: Material[], opts: { saver?: LabSaver | null; readOnly?: boolean; perms?: LabPerms; textures?: Map<string, string> } = {}) {
    this.textures = opts.textures || new Map();
    this.byId = new Map(result.parts.map((p) => [p.id, p]));
    this.saver = opts.saver || null;
    if (opts.perms) this.perms = opts.perms;
    const d = normalizeDoc(result.parts, doc || newDoc());
    const hidden = new Set((scene?.hidden || []).filter((id) => this.byId.has(id)));
    this.past = []; this.future = [];
    this.set({
      ready: true, result, parts: result.parts, doc: d, materials, views: rowViews(result.parts, d, materialMap(materials)),
      mode: scene?.mode || 'view', hidden, selected: new Set(), glue: null, canUndo: false, canRedo: false, save: 'idle', readOnly: !!opts.readOnly,
    });
    if (this.engine) this.bootEngine(scene);
    else this.pendingScene = scene;
  }

  private pendingScene: SceneState | null = null;
  private textures = new Map<string, string>();

  setMaterials(materials: Material[]) {
    this.set({ materials, views: rowViews(this.s.parts, this.s.doc, materialMap(materials)) });
  }

  /* ---------- 3D bilan bog'lash ---------- */
  attach(engine: LabEngine) {
    this.engine = engine;
    if (this.s.ready) this.bootEngine(this.pendingScene);
    this.pendingScene = null;
  }

  detachEngine(engine: LabEngine) { if (this.engine === engine) this.engine = null; }

  private bootEngine(scene: SceneState | null) {
    const e = this.engine;
    if (!e) return;
    e.setTextures(this.textures);
    e.load(this.s.parts);
    e.setGrid(this.s.grid);
    e.setAxes(this.s.axes);
    this.syncMatrices();
    this.syncVisual();
    if (scene?.camera) e.setCamera(scene.camera); else e.setView('iso', true);
  }

  private syncMatrices() {
    const e = this.engine;
    if (!e) return;
    e.setMatrices(partMatrices(this.s.doc));
    e.setExplode(this.s.explode, (id) => entityOf(this.s.doc, id));
  }

  private gluePartSets(g: GlueState | null = this.s.glue) {
    const main = new Set<string>(), attached = new Set<string>();
    if (g) {
      if (g.main) for (const p of entityMembers(this.s.doc, g.main)) main.add(p);
      for (const ent of g.attached) for (const p of entityMembers(this.s.doc, ent)) attached.add(p);
    }
    return { main, attached };
  }

  private syncVisual() {
    const e = this.engine;
    if (!e) return;
    const s = this.s;
    const { main, attached } = this.gluePartSets();
    const tint = new Map<string, string>();
    for (const [pid, gid] of Object.entries(s.doc.partGroup || {})) { const g = (s.doc.packGroups || []).find((x) => x.id === gid); if (g) tint.set(pid, g.color); }
    e.setVisual({ selected: s.glue ? new Set() : s.selected, hidden: s.hidden, isolate: s.isolate, xray: s.xray, edges: s.edges, main, attached, pickable: null, tint });
    e.setTool(s.tool === 'measure' ? 'measure' : s.tool === 'box' ? 'box' : 'select');
  }

  /* ---------- hujjat o'zgarishi ---------- */
  private commit(doc: LabDoc, msg?: string) {
    if (this.s.readOnly) { this.toast(tr('msg.readOnly'), 'warn'); return; }
    this.past.push(this.s.doc);
    if (this.past.length > HISTORY) this.past.shift();
    this.future = [];
    this.applyDoc(doc);
    if (msg) this.toast(msg, 'ok');
  }

  private applyDoc(doc: LabDoc) {
    const prevComp = this.s.doc.composites;
    this.set({
      doc, views: rowViews(this.s.parts, doc, materialMap(this.s.materials)), canUndo: this.past.length > 0, canRedo: this.future.length > 0,
    });
    if (prevComp !== doc.composites) this.syncMatrices();
    this.syncVisual();
    this.scheduleSave();
  }

  undo() {
    const d = this.past.pop();
    if (!d) return;
    if (this.s.glue) this.cancelGlue();
    this.future.push(this.s.doc);
    this.applyDoc(d);
  }

  redo() {
    const d = this.future.pop();
    if (!d) return;
    if (this.s.glue) this.cancelGlue();
    this.past.push(this.s.doc);
    this.applyDoc(d);
  }

  /* ---------- saqlash ---------- */
  scene(): SceneState {
    return { camera: this.engine ? this.engine.getCamera() : null, hidden: [...this.s.hidden], mode: this.s.mode };
  }

  private cavCache = new Map<string, Cavity[]>();

  /** Qator yoki kompozit ichidagi bo'shliqlar (geometriya bo'yicha, keshlanadi). */
  private cavitiesOf(v: RowView): Cavity[] {
    if (v.partKind === 'ignore') return [];
    const key = [v.kind, v.id, v.members.join(','), v.L, v.W, v.T, v.kind === 'composite' ? JSON.stringify(this.s.doc.composites.find((c) => c.id === v.id)?.members.map((m) => m.matrix.join(','))) : ''].join('|');
    const hit = this.cavCache.get(key);
    if (hit) return hit;
    let cav: Cavity[] = [];
    try { cav = entityCavities(this.s.doc, this.s.parts, v.id, v.kind, v.members, [v.L, v.W, v.T]); } catch { cav = []; }
    this.cavCache.set(key, cav);
    return cav;
  }

  packPayload() {
    const ctx = { doc: this.s.doc, parts: this.s.parts, mats: materialMap(this.s.materials), cavities: (v: RowView) => this.cavitiesOf(v) };
    const items = packItems(this.s.views, ctx).filter((i) => i.kind !== 'ignore');
    return { items, signature: packSignature(items) };
  }

  summary(): PartSummary[] {
    const out: PartSummary[] = [];
    for (const v of this.s.views) {
      for (const id of v.members) {
        const p = this.byId.get(id);
        if (!p) continue;
        const e = this.s.doc.edits[id] || {};
        out.push({
          id, name: e.name ?? p.name, material: e.material ?? p.material, kind: e.kind ?? p.kind, L: e.L ?? p.dims.L, W: e.W ?? p.dims.W, T: e.T ?? p.dims.T,
          weight: v.kind === 'row' ? v.unitWeight : null, rowId: v.id,
        });
      }
    }
    return out;
  }

  scheduleSave(delay = 1200) {
    if (!this.saver || this.s.readOnly) return;
    this.set({ save: 'dirty' });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => { void this.saveNow(); }, delay);
  }

  async saveNow() {
    if (!this.saver || this.s.readOnly) return;
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; }
    this.set({ save: 'saving' });
    try {
      const { items, signature } = this.packPayload();
      await this.saver({ doc: this.s.doc, scene: this.scene(), items, signature, summary: this.summary() });
      this.set({ save: 'saved', saveError: '' });
    } catch (e) {
      this.set({ save: 'error', saveError: e instanceof Error ? e.message : String(e) });
    }
  }

  get canSave() { return !!this.saver && !this.s.readOnly; }
  get isDirty() { return this.s.save === 'dirty' || this.s.save === 'saving' || this.s.save === 'error'; }

  /* ---------- rejim va ko'rinish ---------- */
  setMode(mode: LabMode) {
    if (mode === this.s.mode) return;
    if (this.s.glue) this.cancelGlue(true);
    this.set({ mode, ctx: null });
    if (mode === 'glue') this.startGlue();
    this.syncVisual();
    this.scheduleSave(2500);
  }

  setTab(tab: SideTab) { this.set({ tab }); }
  setTool(tool: LabTool) { this.set({ tool, measure: tool === 'measure' ? this.s.measure : null }); this.syncVisual(); }
  toggle(key: 'isolate' | 'xray' | 'edges' | 'grid' | 'axes') {
    const v = !this.s[key];
    this.set({ [key]: v } as Partial<LabState>);
    if (key === 'grid') this.engine?.setGrid(v);
    else if (key === 'axes') this.engine?.setAxes(v);
    else this.syncVisual();
  }
  setExplode(k: number) { this.set({ explode: k }); this.engine?.setExplode(k, (id) => entityOf(this.s.doc, id)); }
  view(name: 'iso' | 'front' | 'side' | 'top' | 'back') { this.engine?.setView(name); }
  focusSelected() { const ids = [...this.s.selected]; if (ids.length) this.engine?.focus(ids); else this.engine?.setView('iso'); }
  focusIds(ids: string[]) { this.engine?.focus(ids); }
  onMeasure(d: number | null) { this.set({ measure: d }); }
  setHover(id: string | null) { if (id !== this.s.hover) this.set({ hover: id }); }
  closeCtx() { if (this.s.ctx) this.set({ ctx: null }); }
  saveCamera() { this.scheduleSave(2500); }

  /* ---------- tanlash ---------- */
  private expand(ids: string[]): string[] {
    const out = new Set<string>();
    const d = this.s.doc;
    for (const id of ids) {
      if (this.s.mode === 'merge') {
        const r = d.rows.find((x) => x.members.indexOf(id) >= 0);
        if (r) { r.members.forEach((m) => out.add(m)); continue; }
      }
      entityMembers(d, entityOf(d, id)).forEach((m) => out.add(m));
    }
    return [...out];
  }

  select(ids: string[], mode: 'set' | 'add' | 'toggle' = 'set', expand = true) {
    const list = expand ? this.expand(ids) : ids;
    let sel: Set<string>;
    if (mode === 'set') sel = new Set(list);
    else {
      sel = new Set(this.s.selected);
      const allIn = list.every((x) => sel.has(x));
      for (const x of list) { if (mode === 'toggle' && allIn) sel.delete(x); else sel.add(x); }
    }
    this.set({ selected: sel });
    this.syncVisual();
  }

  selectAll() { this.select(this.s.parts.filter((p) => !this.s.hidden.has(p.id)).map((p) => p.id), 'set', false); }
  clearSelection() { if (this.s.selected.size) this.select([], 'set'); }

  hide(ids: string[]) { const h = new Set(this.s.hidden); ids.forEach((i) => h.add(i)); const sel = new Set([...this.s.selected].filter((i) => !h.has(i))); this.set({ hidden: h, selected: sel }); this.syncVisual(); this.scheduleSave(2500); }
  show(ids: string[]) { const h = new Set(this.s.hidden); ids.forEach((i) => h.delete(i)); this.set({ hidden: h }); this.syncVisual(); this.scheduleSave(2500); }
  showAll() { this.set({ hidden: new Set(), isolate: false }); this.syncVisual(); this.scheduleSave(2500); }
  toggleHidden(ids: string[]) { if (ids.every((i) => this.s.hidden.has(i))) this.show(ids); else this.hide(ids); }
  isolateSelection() { if (!this.s.selected.size) return; this.set({ isolate: true }); this.syncVisual(); }

  /* ---------- 3D hodisalar ---------- */
  onPick(hit: PickHit | null, ev: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; clientX: number; clientY: number }) {
    this.closeCtx();
    const g = this.s.glue;
    if (g) { if (hit) this.glueAdd([hit.partId]); return; }
    const add = ev.ctrlKey || ev.metaKey;
    if (!hit) { if (!add) this.clearSelection(); return; }
    this.select([hit.partId], add ? 'toggle' : 'set');
  }

  onBoxSelect(ids: string[], additive: boolean) {
    if (this.s.glue) { this.glueAdd(ids); return; }
    this.select(ids, additive ? 'add' : 'set');
  }

  onContext(hit: PickHit | null, x: number, y: number) {
    if (this.s.glue) return;
    if (hit && !this.s.selected.has(hit.partId)) this.select([hit.partId], 'set');
    this.set({ ctx: { x, y, partId: hit ? hit.partId : null } });
  }

  /* ---------- F13 tahrirlash ---------- */
  editSelected(patch: PartEdit) {
    if (!this.perms.editParts) return this.toast(tr('msg.noP2'), 'warn');
    const ids = [...this.s.selected];
    if (!ids.length) return;
    this.commit(editParts(this.s.doc, ids, patch));
  }

  editIds(ids: string[], patch: PartEdit) {
    if (!this.perms.editParts) return this.toast(tr('msg.noP2'), 'warn');
    this.commit(editParts(this.s.doc, ids, patch));
  }

  resetSelected() {
    const ids = [...this.s.selected].filter((i) => this.s.doc.edits[i]);
    if (!ids.length) return;
    this.commit(resetParts(this.s.doc, ids), tr('msg.restored'));
  }

  /* ---------- F14/F15 birlashtirish ---------- */
  autoMerge() {
    if (!this.perms.merge) return this.toast(tr('msg.noP3'), 'warn');
    const d = this.s.doc;
    const rows = autoRows(this.s.parts, d);
    this.commit({ ...d, rows }, tr('msg.autoMerged', { n: rows.length }));
  }

  setMergeKey(k: Partial<LabDoc['mergeKey']>) {
    const d = { ...this.s.doc, mergeKey: { ...this.s.doc.mergeKey, ...k } };
    this.commit({ ...d, rows: autoRows(this.s.parts, d) });
  }

  selectedRowIds(): string[] {
    const sel = this.s.selected;
    return this.s.doc.rows.filter((r) => r.members.some((m) => sel.has(m))).map((r) => r.id);
  }

  mergeSelected() {
    if (!this.perms.merge) return this.toast(tr('msg.noP3'), 'warn');
    const ids = this.selectedRowIds();
    if (ids.length < 2) return this.toast(tr('msg.need2rows'), 'warn');
    this.commit(mergeRows(this.s.doc, ids), tr('msg.merged', { n: ids.length }));
  }

  splitSelected() {
    if (!this.perms.merge) return this.toast(tr('msg.noP3'), 'warn');
    let d = this.s.doc;
    let n = 0;
    for (const id of this.selectedRowIds()) { const r = d.rows.find((x) => x.id === id); if (r && r.members.length > 1) { d = splitRow(d, id); n++; } }
    if (!n) return this.toast(tr('msg.needMulti'), 'warn');
    this.commit(d, tr('msg.split', { n }));
  }

  setRowQty(rowId: string, qty: number | null) {
    const rows = this.s.doc.rows.map((r) => (r.id === rowId ? { ...r, qty: qty == null || !isFinite(qty) || qty < 0 ? undefined : Math.round(qty) } : r));
    this.commit({ ...this.s.doc, rows });
  }

  /* ---------- F20 kompozitni ajratish ---------- */
  detachPart(partId: string) {
    if (!this.perms.glue) return this.toast(tr('msg.noP4'), 'warn');
    const c = this.s.doc.composites.find((x) => x.members.some((m) => m.partId === partId));
    if (!c) return;
    this.commit(detach(this.s.doc, c.id, partId, this.s.parts), tr('msg.detached'));
  }

  dissolveOf(partId: string) {
    if (!this.perms.glue) return this.toast(tr('msg.noP4'), 'warn');
    const c = this.s.doc.composites.find((x) => x.members.some((m) => m.partId === partId) || x.id === partId);
    if (!c) return;
    this.commit(dissolve(this.s.doc, c.id), tr('msg.dissolved'));
  }

  renameComposite(id: string, name: string) {
    this.commit({ ...this.s.doc, composites: this.s.doc.composites.map((c) => (c.id === id ? { ...c, name } : c)) });
  }

  /* ---------- F17-F19 yelimlash ---------- */
  startGlue() {
    if (!this.perms.glue) { this.toast(tr('msg.noP4'), 'warn'); return; }
    this.set({ mode: 'glue', tool: 'select', glue: { main: null, attached: [] }, selected: new Set() });
    this.syncVisual();
  }

  private setGlue(patch: Partial<GlueState>) {
    if (!this.s.glue) return;
    this.set({ glue: { ...this.s.glue, ...patch } });
    this.syncVisual();
  }

  cancelGlue(keepMode = false) {
    this.set({ glue: null });
    if (!keepMode && this.s.mode === 'glue') this.startGlue();
    else this.syncVisual();
  }

  /** Esc: avval yelimlanadigan detallar, keyin asosiy detal tanlovi bekor qilinadi. Qaytarilgan bo'lsa true. */
  glueBack(): boolean {
    const g = this.s.glue;
    if (!g) return false;
    if (g.attached.length) { this.setGlue({ attached: [] }); return true; }
    if (g.main) { this.setGlue({ main: null }); return true; }
    return false;
  }

  clearMain() { this.setGlue({ main: null, attached: [] }); }

  removeAttached(ent: string) {
    const g = this.s.glue;
    if (g) this.setGlue({ attached: g.attached.filter((x) => x !== ent) });
  }

  /** Detalning yelimlashdagi roli (jadval va sahnani bo'yash uchun). */
  glueRole(partId: string): 'main' | 'attached' | null {
    const g = this.s.glue;
    if (!g) return null;
    const ent = entityOf(this.s.doc, partId);
    return ent === g.main ? 'main' : g.attached.indexOf(ent) >= 0 ? 'attached' : null;
  }

  /** Detal yelimlanishi mumkinmi (geometriyasi bor). */
  private glueable(partId: string): boolean {
    const ok = entityMembers(this.s.doc, entityOf(this.s.doc, partId)).every((id) => hasGeometry(this.byId.get(id)));
    if (!ok) this.toast(tr('msg.noGeom'), 'warn');
    return ok;
  }

  /**
   * Sahnadan yoki jadvaldan tanlash. Asosiy detal tanlanmagan bo'lsa birinchi tanlangan detal asosiy bo'ladi
   * (faqat bitta detal); keyingilari yelimlanadigan ro'yxatiga qo'shiladi (qayta bosilsa olib tashlanadi).
   */
  glueAdd(partIds: string[], toggle = true) {
    const g = this.s.glue;
    if (!g || !partIds.length) return;
    const ents = uniq(partIds.map((id) => entityOf(this.s.doc, id)));
    if (!g.main) {
      if (ents.length !== 1) return this.toast(tr('msg.needOneMain'), 'warn');
      if (partIds.length > 1 && !this.s.doc.composites.some((c) => c.id === ents[0])) return this.toast(tr('msg.needOneMain'), 'warn');
      if (!this.glueable(partIds[0])) return;
      this.setGlue({ main: ents[0] });
      return;
    }
    let attached = g.attached.slice();
    for (const ent of ents) {
      if (ent === g.main) continue; // asosiy detal ro'yxatga kirmaydi
      if (!this.glueable(entityMembers(this.s.doc, ent)[0])) continue;
      const i = attached.indexOf(ent);
      if (i >= 0) { if (toggle) attached.splice(i, 1); } else attached.push(ent);
    }
    this.setGlue({ attached });
  }

  /** "Yelimla": attached detallar asosiyga biriktiriladi. Geometriya o'zgarmaydi. */
  glueConfirm() {
    const g = this.s.glue;
    const why = glueBlocker(g);
    if (!g || why || !g.main) { if (why) this.toast(tr(why), 'warn'); return; }
    if (this.s.readOnly) return this.toast(tr('msg.readOnly'), 'warn');
    const nd = glueDoc(this.s.doc, this.s.parts, g.main, g.attached);
    this.set({ glue: null });
    this.commit(nd, tr('msg.glued'));
    const comp = nd.composites[nd.composites.length - 1];
    this.set({ selected: new Set(comp ? comp.members.map((m) => m.partId) : []) });
    this.startGlue();
  }

  /* ---------- alohida upokovka guruhlari ---------- */
  createGroup(name: string, assignSelected = true): string | null {
    if (!this.perms.editParts) { this.toast(tr('msg.noP2'), 'warn'); return null; }
    const { doc, id } = addGroup(this.s.doc, name);
    let d = doc;
    if (assignSelected && this.s.selected.size) d = assignGroup(d, [...this.s.selected], id);
    this.commit(d, tr('group.created'));
    return id;
  }

  renameGroup(id: string, name: string) {
    if (!this.perms.editParts) return this.toast(tr('msg.noP2'), 'warn');
    this.commit(renameGroup(this.s.doc, id, name));
  }

  deleteGroup(id: string) {
    if (!this.perms.editParts) return this.toast(tr('msg.noP2'), 'warn');
    this.commit(removeGroup(this.s.doc, id), tr('group.deleted'));
  }

  /** Tanlangan detallarni guruhga biriktirish (gid = null: chiqarish). Tanlangan kompozit butun holda o'tadi. */
  assignSelected(gid: string | null) {
    if (!this.perms.editParts) return this.toast(tr('msg.noP2'), 'warn');
    const ids = [...this.s.selected];
    if (!ids.length) return this.toast(tr('group.pickFirst'), 'warn');
    this.commit(assignGroup(this.s.doc, ids, gid), gid ? tr('group.assigned') : tr('group.removed'));
  }

  assignIds(ids: string[], gid: string | null) {
    if (!this.perms.editParts) return this.toast(tr('msg.noP2'), 'warn');
    this.commit(assignGroup(this.s.doc, ids, gid));
  }

  groupOf(partId: string): string { return groupOfPart(this.s.doc, partId); }

  /* ---------- yordamchi ---------- */
  part(id: string) { return this.byId.get(id); }
  compositeOf(partId: string) { return this.s.doc.composites.find((c) => c.members.some((m) => m.partId === partId)) || null; }
  inComposite() { return compositeParts(this.s.doc); }
}

function uniq<T>(a: T[]): T[] { return [...new Set(a)]; }

/** Eski formatdagi bog'lanish (moving/target) yangi formatga o'tkaziladi. */
function legacyLink(l: unknown): GlueLink {
  const x = l as Partial<GlueLink> & { target?: string; moving?: string[] };
  return { main: x.main ?? x.target ?? '', attached: x.attached ?? x.moving ?? [] };
}

/** Saqlangan hujjatni joriy import natijasiga moslash: yo'q detallar olib tashlanadi, yangi detallar qatorga qo'shiladi. */
export function normalizeDoc(parts: Part[], doc: LabDoc): LabDoc {
  const ids = new Set(parts.map((p) => p.id));
  const composites = doc.composites
    .map((c) => ({ ...c, members: c.members.filter((m) => ids.has(m.partId)), links: (c.links || []).map(legacyLink) }))
    .filter((c) => c.members.length >= 2)
    .map((c) => (c.members.some((m) => m.partId === c.mainId) ? c : { ...c, mainId: c.members[0].partId }));
  const inComp = new Set(composites.flatMap((c) => c.members.map((m) => m.partId)));
  const seen = new Set<string>();
  let rows = doc.rows
    .map((r) => ({ ...r, members: r.members.filter((m) => ids.has(m) && !inComp.has(m) && !seen.has(m) && (seen.add(m), true)) }))
    .filter((r) => r.members.length);
  const d0: LabDoc = normalizeGroups({ ...doc, composites, rows }, ids);
  if (!doc.rows.length && !doc.composites.length) return { ...d0, rows: autoRows(parts, d0) };
  const missing = parts.filter((p) => !seen.has(p.id) && !inComp.has(p.id));
  if (missing.length) rows = rows.concat(missing.map((p) => ({ id: 'rn' + p.id, members: [p.id], manual: true })));
  return { ...d0, rows };
}

/* ---------- React ulanishi ---------- */
export function useLab<T>(store: LabStore, sel: (s: LabState) => T): T {
  return useSyncExternalStore(store.subscribe, () => sel(store.get()), () => sel(store.get()));
}
