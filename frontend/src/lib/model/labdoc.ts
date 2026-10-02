/*
 * Laboratoriya hujjati ustidagi sof funksiyalar (React va three.js'siz, test qilinadi).
 * F13 tahrirlash, F14/F15 birlashtirish, F16 og'irlik, F18-F20 yelimlash va kompozit.
 */
import type { Composite, CompositeMember, GlueLink, LabDoc, Material, Part, PartEdit, PartKind, Row, Vec3 } from '../types';
import { dot, ident, isIdent, point, dir, normalize, type M4 } from './mat4';

export const newDoc = (): LabDoc => ({ version: 1, edits: {}, rows: [], composites: [], mergeKey: { kromka: false, cuts: false } });

export interface Eff {
  name: string;
  L: number | null;
  W: number | null;
  T: number | null;
  material: string;
  kind: PartKind;
  weightManual: number | null;
  edited: (keyof PartEdit)[];
}

export function eff(p: Part, e?: PartEdit): Eff {
  const edited = e ? (Object.keys(e) as (keyof PartEdit)[]).filter((k) => e[k] !== undefined) : [];
  return {
    name: e?.name ?? p.name,
    L: e?.L ?? p.dims.L,
    W: e?.W ?? p.dims.W,
    T: e?.T ?? p.dims.T,
    material: e?.material ?? p.material,
    kind: e?.kind ?? p.kind,
    weightManual: e?.weight ?? null,
    edited,
  };
}

const r1 = (v: number | null) => (v == null ? '?' : (Math.round(v * 10) / 10).toFixed(1));

export function fnv(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

/** Standart mezon: nomi + eni + bo'yi + qalinlik + material (10.2). Kromka va o'yiq ixtiyoriy. */
export function mergeKeyOf(p: Part, e: Eff, opt: LabDoc['mergeKey']): string {
  const k = [e.name.trim().toLowerCase(), r1(e.L), r1(e.W), r1(e.T), e.material.trim().toLowerCase()];
  if (opt.kromka) k.push(p.edgeText || '');
  if (opt.cuts) k.push(String((p.cuts || []).length));
  return k.join('|');
}

export function compositeParts(doc: LabDoc): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of doc.composites) for (const mem of c.members) m.set(mem.partId, c.id);
  return m;
}

/** F14: avto birlashtirish (kompozit ichidagilardan tashqari). Qo'lda qilingan birlashtirishlar tozalanadi. */
export function autoRows(parts: Part[], doc: LabDoc): Row[] {
  const inComp = compositeParts(doc);
  const groups = new Map<string, string[]>();
  for (const p of parts) {
    if (inComp.has(p.id)) continue;
    const key = mergeKeyOf(p, eff(p, doc.edits[p.id]), doc.mergeKey);
    const g = groups.get(key);
    if (g) g.push(p.id); else groups.set(key, [p.id]);
  }
  const rows: Row[] = [];
  const used = new Set<string>();
  groups.forEach((members, key) => {
    let id = 'r' + fnv(key);
    while (used.has(id)) id += 'x';
    used.add(id);
    rows.push({ id, members, manual: false });
  });
  return rows;
}

export function rowOf(doc: LabDoc, partId: string): Row | undefined {
  return doc.rows.find((r) => r.members.indexOf(partId) >= 0);
}

/** F15: tanlangan qatorlarni bitta qatorga birlashtirish. */
export function mergeRows(doc: LabDoc, rowIds: string[]): LabDoc {
  const sel = doc.rows.filter((r) => rowIds.indexOf(r.id) >= 0);
  if (sel.length < 2) return doc;
  const members = sel.flatMap((r) => r.members);
  const merged: Row = { id: 'rm' + fnv(members.join(',')), members, manual: true };
  const firstIdx = doc.rows.findIndex((r) => r.id === sel[0].id);
  const rows = doc.rows.filter((r) => rowIds.indexOf(r.id) < 0);
  rows.splice(Math.min(firstIdx, rows.length), 0, merged);
  return { ...doc, rows };
}

/** F15: birlashgan qatorni alohida detallarga ajratish. */
export function splitRow(doc: LabDoc, rowId: string): LabDoc {
  const idx = doc.rows.findIndex((r) => r.id === rowId);
  if (idx < 0 || doc.rows[idx].members.length < 2) return doc;
  const r = doc.rows[idx];
  const singles: Row[] = r.members.map((m) => ({ id: 'rs' + fnv(m), members: [m], manual: true }));
  const rows = doc.rows.slice();
  rows.splice(idx, 1, ...singles);
  return { ...doc, rows };
}

export function editParts(doc: LabDoc, ids: string[], patch: PartEdit): LabDoc {
  const edits = { ...doc.edits };
  for (const id of ids) {
    const cur = { ...(edits[id] || {}) };
    (Object.keys(patch) as (keyof PartEdit)[]).forEach((k) => {
      const v = patch[k];
      if (v === undefined || v === null || (typeof v === 'number' && !isFinite(v))) delete cur[k];
      else (cur as Record<string, unknown>)[k] = v;
    });
    if (Object.keys(cur).length) edits[id] = cur; else delete edits[id];
  }
  return { ...doc, edits };
}

export function resetParts(doc: LabDoc, ids: string[]): LabDoc {
  const edits = { ...doc.edits };
  for (const id of ids) delete edits[id];
  return { ...doc, edits };
}

/* ---------- og'irlik (F16, 3.4) ---------- */
export function materialMap(list: Material[]): Map<string, Material> {
  const m = new Map<string, Material>();
  for (const x of list) m.set(x.name.trim().toLowerCase(), x);
  return m;
}

/** Bitta detal og'irligi, kg. null = noma'lum. */
export function partWeight(p: Part, e: Eff, mats: Map<string, Material>): number | null {
  if (e.weightManual != null) return e.weightManual;
  const mat = mats.get(e.material.trim().toLowerCase());
  if (!mat) return null;
  const dimsEdited = e.edited.some((k) => k === 'L' || k === 'W' || k === 'T');
  if (mat.method === 'sheet') {
    if (!mat.sheetL || !mat.sheetW || mat.sheetWeight == null || e.L == null || e.W == null) return null;
    const area = dimsEdited || p.area == null ? e.L * e.W : p.area;
    return (area / (mat.sheetL * mat.sheetW)) * mat.sheetWeight;
  }
  if (mat.method === 'manual' || mat.density == null) return null;
  let vol: number | null;
  if (dimsEdited || p.volume == null) vol = e.L != null && e.W != null && e.T != null ? e.L * e.W * e.T : null;
  else vol = p.volume;
  return vol == null ? null : vol * 1e-9 * mat.density;
}

/* ---------- qatorlar ko'rinishi ---------- */
export interface RowView {
  id: string;
  kind: 'row' | 'composite';
  rep: Part;
  members: string[];
  name: string;
  L: number | null;
  W: number | null;
  T: number | null;
  material: string;
  partKind: PartKind;
  qty: number;
  edgeText: string;
  group: string;
  unitWeight: number | null;
  totalWeight: number | null;
  edited: boolean;
  manual: boolean;
  color: string;
}

export function rowViews(parts: Part[], doc: LabDoc, mats: Map<string, Material>): RowView[] {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const out: RowView[] = [];
  for (const r of doc.rows) {
    const rep = byId.get(r.members[0]);
    if (!rep) continue;
    const e = eff(rep, doc.edits[rep.id]);
    const qty = r.qty ?? r.members.length;
    // birlashgan qatorda har bir detal og'irligi alohida hisoblanadi (o'lchamlari farq qilishi mumkin)
    let total: number | null = 0;
    for (const m of r.members) {
      const p = byId.get(m);
      if (!p) continue;
      const w = partWeight(p, eff(p, doc.edits[m]), mats);
      if (w == null) { total = null; break; }
      total += w;
    }
    const unit = total == null ? null : total / Math.max(1, r.members.length);
    out.push({
      id: r.id, kind: 'row', rep, members: r.members, name: e.name, L: e.L, W: e.W, T: e.T, material: e.material, partKind: e.kind,
      qty, edgeText: rep.edgeText || '', group: rep.group || rep.product || '', unitWeight: unit, totalWeight: unit == null ? null : unit * qty,
      edited: r.members.some((m) => !!doc.edits[m]), manual: r.manual, color: rep.color,
    });
  }
  for (const c of doc.composites) {
    const main = byId.get(c.mainId);
    if (!main) continue;
    const info = compositeInfo(c, byId, doc, mats);
    out.push({
      id: c.id, kind: 'composite', rep: main, members: c.members.map((m) => m.partId), name: c.name,
      L: info.dims ? info.dims[0] : null, W: info.dims ? info.dims[1] : null, T: info.dims ? info.dims[2] : null,
      material: eff(main, doc.edits[main.id]).material, partKind: 'panel', qty: 1, edgeText: '', group: main.group || '',
      unitWeight: info.weight, totalWeight: info.weight, edited: false, manual: false, color: main.color,
    });
  }
  return out;
}

/* ---------- kompozit (F19, 3.3) ---------- */
function obbCorners(p: Part): Vec3[] {
  if (!p.obb) return [];
  const { center: c, axes: a, size: s } = p.obb;
  const out: Vec3[] = [];
  for (const i of [-0.5, 0.5]) for (const j of [-0.5, 0.5]) for (const k of [-0.5, 0.5]) {
    out.push([
      c[0] + a[0][0] * s[0] * i + a[1][0] * s[1] * j + a[2][0] * s[2] * k,
      c[1] + a[0][1] * s[0] * i + a[1][1] * s[1] * j + a[2][1] * s[2] * k,
      c[2] + a[0][2] * s[0] * i + a[1][2] * s[1] * j + a[2][2] * s[2] * k,
    ]);
  }
  return out;
}

/** Kompozit gabariti (barcha a'zolarning haqiqiy joylashuvi bo'yicha, asosiy detal o'qlarida) va og'irligi (detallar yig'indisi). */
export function compositeInfo(c: Composite, byId: Map<string, Part>, doc: LabDoc, mats: Map<string, Material>) {
  const main = byId.get(c.mainId);
  const mainMem = c.members.find((m) => m.partId === c.mainId);
  let dims: [number, number, number] | null = null;
  let bbox: { min: Vec3; max: Vec3 } | null = null;
  if (main && main.obb && mainMem) {
    const axes = main.obb.axes.map((a) => normalize(dir(mainMem.matrix, a)));
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    const wmn: Vec3 = [Infinity, Infinity, Infinity], wmx: Vec3 = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (const m of c.members) {
      const p = byId.get(m.partId);
      if (!p) continue;
      for (const q of obbCorners(p)) {
        const w = point(m.matrix, q);
        any = true;
        for (let k = 0; k < 3; k++) {
          const d = dot(w, axes[k]);
          mn[k] = Math.min(mn[k], d); mx[k] = Math.max(mx[k], d);
          wmn[k] = Math.min(wmn[k], w[k]); wmx[k] = Math.max(wmx[k], w[k]);
        }
      }
    }
    if (any) {
      dims = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]].sort((a, b) => b - a) as [number, number, number];
      bbox = { min: wmn, max: wmx };
    }
  }
  let weight: number | null = 0;
  for (const m of c.members) {
    const p = byId.get(m.partId);
    if (!p) continue;
    const w = partWeight(p, eff(p, doc.edits[p.id]), mats);
    if (w == null) { weight = null; break; }
    weight += w;
  }
  return { dims, bbox, weight };
}

/** Sahnadagi "birlik": kompozit ichidagi detal uchun kompozit id, aks holda detal id. */
export function entityOf(doc: LabDoc, partId: string): string {
  for (const c of doc.composites) if (c.members.some((m) => m.partId === partId)) return c.id;
  return partId;
}

export function entityMembers(doc: LabDoc, entity: string): string[] {
  const c = doc.composites.find((x) => x.id === entity);
  return c ? c.members.map((m) => m.partId) : [entity];
}

/** Har bir detalning joriy siljish matritsasi (kompozitda bo'lmasa birlik matritsa). */
export function partMatrices(doc: LabDoc): Record<string, M4> {
  const out: Record<string, M4> = {};
  for (const c of doc.composites) for (const m of c.members) if (!isIdent(m.matrix)) out[m.partId] = m.matrix;
  return out;
}

let compSeq = 0;

/** Geometriyasi yo'q element (o'lchami noma'lum) yelimlanmaydi. */
export function hasGeometry(p: Part | undefined): boolean { return !!p && p.geom !== 'none' && !!p.obb; }

/**
 * Yelimlash (F18): faqat bog'lanish. Asosiy birlik va unga yelimlanadigan birliklar bitta kompozitga
 * guruhlanadi; hech bir detal matritsasi o'zgarmaydi (siljitish, burish, yaqinlashtirish yo'q).
 * main/attached: birliklar (detal yoki kompozit id). Kompozit nomi asosiy detal nomi bilan saqlanadi.
 */
export function glue(doc: LabDoc, parts: Part[], main: string, attached: string[]): LabDoc {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const comps = new Map(doc.composites.map((c) => [c.id, c]));
  const ents = [main, ...attached.filter((e, i) => e !== main && attached.indexOf(e) === i)];
  const members: CompositeMember[] = [];
  const links: GlueLink[] = [];
  const consumed = new Set<string>();
  for (const ent of ents) {
    const c = comps.get(ent);
    if (c) {
      consumed.add(c.id);
      links.push(...c.links);
      members.push(...c.members); // matritsalar o'zgarishsiz
    } else {
      const row = rowOf(doc, ent);
      members.push({ partId: ent, matrix: ident(), fromRow: row ? row.id : null });
    }
  }
  const mc = comps.get(main);
  const mainId = mc ? mc.mainId : main;
  const mainPart = byId.get(mainId);
  const name = mc ? mc.name : mainPart ? eff(mainPart, doc.edits[mainId]).name : mainId;
  links.push({ main: mainId, attached: ents.slice(1).flatMap((e) => entityMembers(doc, e)) });
  const memberIds = new Set(members.map((m) => m.partId));
  const rows = doc.rows.map((r) => ({ ...r, members: r.members.filter((x) => !memberIds.has(x)) })).filter((r) => r.members.length);
  const id = 'c' + Date.now().toString(36) + (compSeq++).toString(36);
  const composites = doc.composites.filter((c) => !consumed.has(c.id)).concat([{ id, name, mainId, members, links }]);
  return { ...doc, rows, composites };
}

function returnToRows(rows: Row[], back: CompositeMember[]): Row[] {
  const out = rows.map((r) => ({ ...r, members: r.members.slice() }));
  for (const m of back) {
    const r = m.fromRow ? out.find((x) => x.id === m.fromRow) : undefined;
    if (r) r.members.push(m.partId);
    else out.push({ id: 'rs' + fnv(m.partId), members: [m.partId], manual: true });
  }
  return out;
}

/** F20: kompozitni to'liq ajratish; detallar asl joyiga qaytadi. */
export function dissolve(doc: LabDoc, compId: string): LabDoc {
  const c = doc.composites.find((x) => x.id === compId);
  if (!c) return doc;
  return { ...doc, rows: returnToRows(doc.rows, c.members), composites: doc.composites.filter((x) => x.id !== compId) };
}

/** F20: kompozitdan bitta detalni ajratish. */
export function detach(doc: LabDoc, compId: string, partId: string, parts: Part[]): LabDoc {
  const c = doc.composites.find((x) => x.id === compId);
  if (!c) return doc;
  const mem = c.members.find((m) => m.partId === partId);
  if (!mem) return doc;
  const rest = c.members.filter((m) => m.partId !== partId);
  if (rest.length < 2) return dissolve(doc, compId);
  let mainId = c.mainId;
  if (mainId === partId) mainId = rest[0].partId;
  const main = parts.find((p) => p.id === mainId);
  const nc: Composite = {
    ...c, members: rest, mainId,
    name: main ? eff(main, doc.edits[mainId]).name : c.name,
    links: c.links.filter((l) => l.main !== partId).map((l) => ({ ...l, attached: l.attached.filter((x) => x !== partId) })),
  };
  return { ...doc, rows: returnToRows(doc.rows, [mem]), composites: doc.composites.map((x) => (x.id === compId ? nc : x)) };
}

/* ---------- upokovka uchun elementlar ---------- */
export interface PackItemIn {
  refKind: 'row' | 'composite';
  refUid: string;
  name: string;
  material: string;
  kind: PartKind;
  color: string;
  L: number | null;
  W: number | null;
  T: number | null;
  unitWeight: number | null;
  qty: number;
}

export function packItems(views: RowView[]): PackItemIn[] {
  return views
    .filter((v) => v.partKind !== 'ignore')
    .map((v) => ({
      refKind: v.kind, refUid: v.id, name: v.name, material: v.material, kind: v.kind === 'composite' ? 'panel' : v.partKind, color: v.color,
      L: v.L, W: v.W, T: v.T, unitWeight: v.unitWeight, qty: v.qty,
    }));
}

/** Upokovka natijasi eskirganini aniqlash uchun imzo (A38). */
export function packSignature(items: PackItemIn[]): string {
  return fnv(JSON.stringify(items.map((i) => [i.refUid, i.name, i.L, i.W, i.T, i.unitWeight, i.qty, i.kind])));
}
