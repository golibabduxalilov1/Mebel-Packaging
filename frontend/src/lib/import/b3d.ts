/*
 * Bazis .b3d (BZ85) o'qigich. Namuna ko'rgichdagi tekshirilgan kod TypeScript'ga ko'chirildi.
 * TZ F5: faqat BZ85 bilan boshlanadigan shifrlanmagan fayl. Shifrlangan bo'lsa ProtectedFileError.
 */
import { ProtectedFileError, type CutInfo, type EdgeBand, type Part, type Quat, type Vec2, type Vec3 } from '../types';
import { fmt } from './geom';

interface BNode { name: string; t: number; v: unknown; ch: BNode[] | null }
interface Tr { p: Vec3; q: Quat }

const hx = (n: number) => '0x' + n.toString(16).padStart(6, '0');

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const CAP = 64 * 1024 * 1024;
  const ds = new DecompressionStream('deflate');
  const w = ds.writable.getWriter();
  const r = ds.readable.getReader();
  w.write(bytes as unknown as BufferSource).then(() => w.close()).catch(() => undefined);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const x = await r.read();
      if (x.done) break;
      chunks.push(x.value);
      total += x.value.length;
      if (total > CAP) { try { await r.cancel(); } catch { /* */ } break; }
    }
  } catch { /* qisman o'qilgan ma'lumot bilan davom etamiz */ }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

const normQ = (q: Quat): Quat => { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
const mulQ = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
export function rotV(q: Quat, v: Vec3): Vec3 {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + (y * tz - z * ty), v[1] + w * ty + (z * tx - x * tz), v[2] + w * tz + (x * ty - y * tx)];
}
const compose = (par: Tr, own: Tr): Tr => {
  const r = rotV(par.q, own.p);
  return { p: [par.p[0] + r[0], par.p[1] + r[1], par.p[2] + r[2]], q: normQ(mulQ(par.q, own.q)) };
};

function readDict(dv: DataView, u8: Uint8Array, o: number) {
  const cnt = dv.getUint32(o, true); o += 4;
  if (cnt > 100000) throw new Error("nomlar jadvali noto'g'ri");
  const names: string[] = [];
  const dec = new TextDecoder('utf-8');
  for (let i = 0; i < cnt; i++) {
    const l = dv.getUint32(o, true); o += 4;
    if (o + l > u8.length) throw new Error('nomlar jadvali fayldan chiqib ketdi');
    names.push(dec.decode(u8.subarray(o, o + l))); o += l;
  }
  return { names, pos: o };
}

function readField(dv: DataView, u8: Uint8Array, names: string[], pos: number, depth: number): { node: BNode; pos: number } {
  if (depth > 64 || pos + 9 > u8.length) throw new Error('yozuv tuzilmasi buzilgan (' + hx(pos) + ')');
  const key = dv.getUint32(pos, true), x = dv.getUint32(pos + 4, true), t = u8[pos + 8];
  pos += 9;
  const node: BNode = { name: key < names.length ? names[key] : '#' + key, t, v: null, ch: null };
  if (t === 0) {
    node.ch = [];
    for (let i = 0; i < x; i++) { const r = readField(dv, u8, names, pos, depth + 1); node.ch.push(r.node); pos = r.pos; }
  } else if (t === 1 || t === 2) node.v = t === 2;
  else if (t === 3) { node.v = u8[pos]; pos += 1; }
  else if (t === 4) { node.v = dv.getInt32(pos, true); pos += 4; }
  else if (t === 5 || t === 9) { node.v = dv.getFloat64(pos, true); pos += 8; }
  else if (t === 6) {
    const l = dv.getUint32(pos, true);
    node.v = new TextDecoder('utf-16le').decode(u8.subarray(pos + 4, pos + 4 + 2 * l)); pos += 4 + 2 * l;
  } else if (t === 7) {
    const l = dv.getUint32(pos, true);
    node.v = u8.subarray(pos + 4, pos + 4 + l); pos += 4 + l;
  } else throw new Error("noma'lum qiymat turi " + t + ' (' + hx(pos - 1) + ')');
  if (pos > u8.length) throw new Error('fayl kutilganidan oldin tugadi');
  return { node, pos };
}

async function block(u8: Uint8Array, pos: number) {
  if (pos + 5 > u8.length) throw new Error('blok sarlavhasi topilmadi');
  const flag = u8[pos + 4];
  let data: Uint8Array;
  if (flag === 1) {
    if (typeof DecompressionStream === 'undefined') throw new Error("brauzer siqilgan blokni ochishni qo'llamaydi (Chrome, Edge yoki Firefox yangi versiyasi kerak)");
    data = await inflate(u8.subarray(pos + 5));
    if (!data.length) throw new Error("siqilgan blokni ochib bo'lmadi");
  } else data = u8.subarray(pos + 5);
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const d = readDict(dv, data, 0);
  const f = readField(dv, data, d.names, d.pos, 0);
  return { root: f.node, next: flag === 1 ? u8.length : pos + 5 + f.pos };
}

const get = (n: BNode | undefined | null, name: string) => (n && n.ch ? n.ch.find((c) => c.name === name) : undefined);
const num = (n: BNode | undefined | null, name: string, def: number | null): number | null => {
  const c = get(n, name);
  return c && typeof c.v === 'number' ? c.v : def;
};
const str = (n: BNode | undefined | null, name: string, def: string): string => {
  const c = get(n, name);
  return c && typeof c.v === 'string' ? c.v.replace(/[\r\n\t]+/g, ' ').trim() : def;
};
const trans = (o: BNode): Tr => {
  const t = get(o, 'Trans');
  if (!t || !t.ch) return { p: [0, 0, 0], q: [0, 0, 0, 1] };
  return {
    p: [num(t, 'X', 0)!, num(t, 'Y', 0)!, num(t, 'Z', 0)!],
    q: normQ([num(t, 'Rx', 0)!, num(t, 'Ry', 0)!, num(t, 'Rz', 0)!, num(t, 'Rw', 1)!]),
  };
};
const color = (c: number) => {
  const h = (v: number) => v.toString(16).padStart(2, '0');
  return '#' + h(c & 255) + h((c >> 8) & 255) + h((c >> 16) & 255);
};

function arcPts(a: Vec2, e: Vec2, c: Vec2, ccw: boolean): { pts: Vec2[]; len: number } {
  const a0 = Math.atan2(a[1] - c[1], a[0] - c[0]);
  let d = Math.atan2(e[1] - c[1], e[0] - c[0]) - a0;
  const TAU = 2 * Math.PI;
  if (ccw) { while (d <= 1e-9) d += TAU; } else { while (d >= -1e-9) d -= TAU; }
  const r = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const steps = Math.max(2, Math.ceil(Math.abs(d) / (Math.PI / 18)));
  const pts: Vec2[] = [];
  for (let i = 1; i < steps; i++) { const t = a0 + (d * i) / steps; pts.push([c[0] + r * Math.cos(t), c[1] + r * Math.sin(t)]); }
  return { pts, len: Math.abs(d) * r };
}

interface ContourOk { loops: Vec2[][]; arcs: number; circles: { c: Vec2; r: number }[]; lineLoops: number }

function contour(b: Uint8Array | null): ContourOk | { error: string } {
  if (!b || b.length < 4) return { error: "bo'sh kontur" };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const n = dv.getUint32(0, true);
  if (n === 0 || n > 5000) return { error: "kesmalar soni noto'g'ri (" + n + ')' };
  const segs: { a: Vec2; b: Vec2; mid: Vec2[]; used: boolean }[] = [];
  const circles: { c: Vec2; r: number }[] = [];
  let pos = 4, arcs = 0;
  const f = (o: number) => dv.getFloat64(o, true);
  for (let i = 0; i < n; i++) {
    if (pos >= b.length) return { error: 'kontur fayldan oldin tugadi' };
    const k = b[pos];
    if (k === 0x10) {
      if (pos + 33 > b.length) return { error: 'kontur tugadi' };
      segs.push({ a: [f(pos + 1), f(pos + 9)], b: [f(pos + 17), f(pos + 25)], mid: [], used: false });
      pos += 33;
    } else if (k === 0x12) {
      if (pos + 50 > b.length) return { error: 'kontur tugadi' };
      const c: Vec2 = [f(pos + 1), f(pos + 9)], a: Vec2 = [f(pos + 17), f(pos + 25)], e: Vec2 = [f(pos + 33), f(pos + 41)];
      segs.push({ a, b: e, mid: arcPts(a, e, c, b[pos + 49] !== 0).pts, used: false });
      pos += 50; arcs++;
    } else if (k === 0x11 || k === 0x14) {
      if (pos + 25 > b.length) return { error: 'kontur tugadi' };
      circles.push({ c: [f(pos + 1), f(pos + 9)], r: f(pos + 17) });
      pos += 25;
    } else return { error: "noma'lum kontur elementi 0x" + k.toString(16) + ' (' + hx(pos) + ')' };
  }
  const eq = (p: Vec2, q: Vec2) => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01;
  const loops: Vec2[][] = [];
  for (const s0 of segs) {
    if (s0.used) continue;
    s0.used = true;
    const pts: Vec2[] = [s0.a, ...s0.mid];
    let cur = s0.b, guard = 0;
    while (!eq(cur, s0.a) && guard++ <= segs.length) {
      pts.push(cur);
      let next: Vec2[] | null = null;
      for (const s of segs) {
        if (s.used) continue;
        if (eq(s.a, cur)) { s.used = true; next = s.mid.slice(); cur = s.b; break; }
        if (eq(s.b, cur)) { s.used = true; next = s.mid.slice().reverse(); cur = s.a; break; }
      }
      if (!next) break;
      pts.push(...next);
    }
    if (pts.length >= 3) loops.push(pts);
  }
  const area = (lp: Vec2[]) => { let a = 0; for (let i = 0; i < lp.length; i++) { const p = lp[i], q = lp[(i + 1) % lp.length]; a += p[0] * q[1] - q[0] * p[1]; } return Math.abs(a / 2); };
  loops.sort((x, y) => area(y) - area(x));
  if (!loops.length) return { error: 'yopiq kontur topilmadi' };
  const lineLoops = loops.length;
  const good = circles.filter((c) => c.r > 0);
  for (const ci of good) {
    const lp: Vec2[] = [], steps = ci.r < 6 ? 16 : 32;
    for (let i = 0; i < steps; i++) { const t = (i / steps) * 2 * Math.PI; lp.push([ci.c[0] + ci.r * Math.cos(t), ci.c[1] + ci.r * Math.sin(t)]); }
    loops.push(lp);
  }
  return { loops, arcs, circles: good, lineLoops };
}

type RawPart = Omit<Part, 'bbox' | 'obb' | 'dims' | 'area' | 'volume' | 'color'> & { color?: string };

interface Ctx { warnings: string[] }

function walk(o: BNode, parent: Tr, out: RawPart[], furn: Map<number, { name: string; min: Vec3; max: Vec3 }>, depth: number, ctx: Ctx, group: string) {
  if (depth > 16) return;
  const tr = compose(parent, trans(o));
  const name = str(o, 'Name', '');
  const id = num(o, 'ID', out.length + 1)!;
  const cn = get(o, 'Contour');
  const fast = num(o, 'FastID', null);
  const type = num(o, 'Type', 0)!;
  if (cn && cn.t === 7) {
    const c = contour(cn.v as Uint8Array);
    if ('error' in c) ctx.warnings.push((name || 'Panel') + ' (' + id + '): ' + c.error);
    else {
      const thkRaw = num(o, 'Thick', null);
      const thk = thkRaw != null ? thkRaw : num(o, 'Thickness', 0)!;
      const thick = Math.abs(thk);
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (const q of c.loops[0]) { mnx = Math.min(mnx, q[0]); mxx = Math.max(mxx, q[0]); mny = Math.min(mny, q[1]); mxy = Math.max(mxy, q[1]); }
      const notes: string[] = [];
      if (c.arcs) notes.push('Kontur ' + c.arcs + " ta yoy elementiga ega (ko'pburchak bilan yaqinlashtirilgan).");
      if (c.circles.length) notes.push('Kontur ichida ' + c.circles.length + ' ta aylana (teshik) bor.');
      const cuts: CutInfo[] = [];
      const cn2 = get(o, 'Cuts');
      if (cn2 && cn2.ch) for (const cu of cn2.ch) {
        const cc = get(cu, 'Contour');
        if (!cc || cc.t !== 7) continue;
        const r = contour(cc.v as Uint8Array);
        if ('error' in r || !r.loops.length) { ctx.warnings.push((name || 'Panel') + ' (' + id + ") o'yig'i: " + ('error' in r ? r.error : "kontur yo'q")); continue; }
        const th = num(cu, 'Thickness', 0)!;
        const fr = get(cu, 'Front');
        if (Math.abs(th) < 1e-6) continue;
        cuts.push({ loop: r.loops[0], depth: Math.abs(th), top: fr && typeof fr.v === 'boolean' ? fr.v : th < 0 });
      }
      if (cuts.length) notes.push(cuts.length + " ta o'yiq (paz), chuqurligi " + Array.from(new Set(cuts.map((x) => fmt(x.depth)))).join(', ') + ' mm.');
      const edges: EdgeBand[] = [];
      const bt = get(o, 'Butts');
      if (bt && bt.ch) for (const b of bt.ch) {
        if (b.name !== 'Butt') continue;
        edges.push({ elem: num(b, 'Elem', -1)!, mat: str(b, 'Mat', ''), sign: str(b, 'Sign', ''), thick: num(b, 'Thick', 0)!, width: num(b, 'Width', 0)! });
      }
      out.push({
        id: String(id), name: name || 'Panel', baseName: name || 'Panel', material: str(o, 'Mat', 'Materialsiz'),
        kind: type === 2004 ? 'profile' : 'panel', geom: 'contour', group, note: notes.join(' '),
        loops: c.loops, lineLoops: c.lineLoops, circles: c.circles, cuts, thick, zShift: thk < 0 ? thk : 0,
        bb2: [mnx, mny], edges, arcCount: c.arcs, pos: tr.p, quat: tr.q,
        artPos: str(o, 'ArtPos', ''), des: str(o, 'Des', ''),
        edgeText: edges.length ? summarizeEdges(edges) : '',
      });
    }
  } else if (fast != null && furn.has(fast)) {
    const f = furn.get(fast)!;
    const col = num(o, 'Color', null);
    out.push({
      id: String(id), name: name || f.name || 'Furnitura', baseName: name || f.name || 'Furnitura', material: 'Furnitura',
      kind: 'hardware', geom: 'box', group, note: '', boxMin: f.min, boxMax: f.max, pos: tr.p, quat: tr.q,
      color: col != null ? color(col) : undefined,
    });
  }
  const ks = get(o, 'Objs');
  if (ks && ks.ch) {
    const g = type === 1005 && name ? (group ? group + ' / ' + name : name) : group;
    for (const k of ks.ch) if (k.name === 'Obj') walk(k, tr, out, furn, depth + 1, ctx, g);
  }
}

export function summarizeEdges(edges: EdgeBand[]): string {
  const m = new Map<string, number>();
  for (const e of edges) {
    const k = e.sign || e.mat || fmt(e.thick) + '×' + fmt(e.width);
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m).map((x) => x[0] + ' ×' + x[1]).join('; ');
}

export interface B3dResult {
  name: string;
  source: string;
  parts: RawPart[];
  warnings: string[];
  thumb: Uint8Array | null;
  stats: { panels: number; hardware: number; profiles: number; version: string };
}

export async function parseB3D(u8: Uint8Array, fileName: string): Promise<B3dResult> {
  if (u8.length < 16 || u8[0] !== 0x42 || u8[1] !== 0x5a || u8[2] !== 0x38 || u8[3] !== 0x35) {
    throw new Error("bu Bazis .b3d (BZ85) fayl emas yoki boshqa versiyadagi format");
  }
  const b1 = await block(u8, 4);
  if (get(b1.root, 'Encrypt')) throw new ProtectedFileError(str(get(b1.root, 'Article'), 'Name', ''));
  const b2 = await block(u8, b1.next);
  const doc = b2.root;
  if (doc.name !== 'Document') throw new Error('asosiy blok "Document" emas: ' + doc.name);
  const model = get(doc, 'Model');
  if (!model || !model.ch) throw new Error('"Model" bo\'limi topilmadi');
  const furn = new Map<number, { name: string; min: Vec3; max: Vec3 }>();
  const fl = get(doc, 'FurnList');
  if (fl && fl.ch) for (const f of fl.ch) {
    const id = num(f, 'FastID', null);
    if (id == null) continue;
    furn.set(id, {
      name: str(f, 'Name', ''),
      min: [num(f, 'MinX', 0)!, num(f, 'MinY', 0)!, num(f, 'MinZ', 0)!],
      max: [num(f, 'MaxX', 0)!, num(f, 'MaxY', 0)!, num(f, 'MaxZ', 0)!],
    });
  }
  const parts: RawPart[] = [];
  const ctx: Ctx = { warnings: [] };
  for (const o of model.ch) if (o.name === 'Obj') walk(o, { p: [0, 0, 0], q: [0, 0, 0, 1] }, parts, furn, 0, ctx, '');
  if (!parts.length) throw new Error("modelda ko'rsatiladigan detal topilmadi" + (ctx.warnings.length ? ': ' + ctx.warnings[0] : ''));
  const art = get(b1.root, 'Article');
  const thumb = get(b1.root, 'Thumbnail');
  const vmaj = num(doc, 'VersionMajor', null), vmin = num(doc, 'VersionMinor', null);
  const version = vmaj != null ? vmaj + '.' + (vmin ?? 0) : "noma'lum";
  return {
    name: str(art, 'Name', '') || fileName.replace(/\.b3d$/i, ''),
    source: 'Bazis ' + version,
    parts,
    warnings: ctx.warnings,
    thumb: thumb && thumb.v instanceof Uint8Array && thumb.v.length ? thumb.v.slice() : null,
    stats: {
      panels: parts.filter((p) => p.kind === 'panel').length,
      hardware: parts.filter((p) => p.kind === 'hardware').length,
      profiles: parts.filter((p) => p.kind === 'profile').length,
      version,
    },
  };
}
