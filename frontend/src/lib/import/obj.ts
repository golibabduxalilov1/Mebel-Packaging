/*
 * OBJ o'qigich. TZ F7: bog'langan jismlar detal deb olinadi, material nomlari .mtl va usemtl dan.
 * OBJ da detal nomi yo'q, shuning uchun detallar "Detal 1, 2, ..." deb nomlanadi.
 */
import { colorFor, rgbHex } from './geom';
import type { MatGroup } from '../types';
import type { RawMeshPart } from './dae';

export interface MtlDef { name: string; kd: number[] | null; ka: number[] | null; map: string; d: number }

export function parseMTL(text: string): Map<string, MtlDef> {
  const mats = new Map<string, MtlDef>();
  let cur: MtlDef | null = null;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const l = raw.trim();
    if (!l || l[0] === '#') continue;
    const sp = l.indexOf(' ');
    const k = (sp < 0 ? l : l.slice(0, sp)).toLowerCase();
    const v = sp < 0 ? '' : l.slice(sp + 1).trim();
    if (k === 'newmtl') { cur = { name: v, kd: null, ka: null, map: '', d: 1 }; mats.set(v, cur); }
    else if (!cur) continue;
    else if (k === 'kd') { const a = v.split(/\s+/).map(Number); if (a.length >= 3 && a.every(isFinite)) cur.kd = a; }
    else if (k === 'ka') { const a = v.split(/\s+/).map(Number); if (a.length >= 3 && a.every(isFinite)) cur.ka = a; }
    else if (k === 'map_kd') cur.map = v.split(/\s+/).pop() || '';
    else if (k === 'd') { const d = parseFloat(v); if (isFinite(d)) cur.d = d; }
  }
  return mats;
}

export interface ObjResult {
  name: string;
  parts: RawMeshPart[];
  mtlName: string;
  stats: { vertices: number; faces: number; materialBlocks: number; parts: number };
}

export function parseOBJ(text: string, fileName: string, mtl: Map<string, MtlDef> | null): ObjResult {
  const V: number[] = [], VT: number[] = [];
  const fv: number[] = []; // yuzalar: [n, v0,t0, v1,t1, ...] ketma-ket
  const fMeta: { off: number; n: number; m: number }[] = [];
  const matNames: string[] = [];
  const matIdx = new Map<string, number>();
  let curMat = -1, mtlName = '', usemtlCount = 0;
  const lines = text.split('\n');
  for (let li = 0; li < lines.length; li++) {
    let raw = lines[li];
    if (!raw) continue;
    if (raw.charCodeAt(raw.length - 1) === 13) raw = raw.slice(0, -1);
    const c0 = raw.charCodeAt(0), c1 = raw.charCodeAt(1);
    if (c0 === 118 /* v */) {
      if (c1 === 32 || c1 === 9) {
        const a = raw.slice(2).trim().split(/\s+/);
        V.push(+a[0], +a[1], +a[2]);
      } else if (c1 === 116 /* t */) {
        const a = raw.slice(3).trim().split(/\s+/);
        VT.push(+a[0], +a[1] || 0);
      }
    } else if (c0 === 102 /* f */ && (c1 === 32 || c1 === 9)) {
      const tk = raw.slice(2).trim().split(/\s+/);
      const off = fv.length;
      let n = 0;
      for (const t of tk) {
        const p = t.split('/');
        let a = parseInt(p[0], 10);
        if (!isFinite(a)) continue;
        if (a < 0) a = V.length / 3 + a + 1;
        let b = p.length > 1 && p[1] !== '' ? parseInt(p[1], 10) : 0;
        if (b < 0) b = VT.length / 2 + b + 1;
        fv.push(a - 1, b - 1);
        n++;
      }
      if (n >= 3) fMeta.push({ off, n, m: curMat });
      else fv.length = off;
    } else if (raw.startsWith('usemtl')) {
      const name = raw.slice(6).trim();
      usemtlCount++;
      let id = matIdx.get(name);
      if (id === undefined) { id = matNames.length; matNames.push(name); matIdx.set(name, id); }
      curMat = id;
    } else if (raw.startsWith('mtllib')) mtlName = raw.slice(6).trim();
  }
  const nV = V.length / 3;
  if (!fMeta.length || !nV) throw new Error('OBJ faylda yuza (f) yoki uchlar (v) topilmadi');

  // bog'langan jismlar: umumiy uchga ega yuzalar bitta detal
  const parent = new Int32Array(nV);
  for (let i = 0; i < nV; i++) parent[i] = i;
  const find = (x: number) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  for (const f of fMeta) {
    const a0 = fv[f.off];
    for (let i = 1; i < f.n; i++) {
      const ra = find(a0), rb = find(fv[f.off + i * 2]);
      if (ra !== rb) parent[rb] = ra;
    }
  }
  const comps = new Map<number, { faces: number[]; first: number }>();
  fMeta.forEach((f, idx) => {
    const r = find(fv[f.off]);
    let c = comps.get(r);
    if (!c) { c = { faces: [], first: fv[f.off] }; comps.set(r, c); }
    c.faces.push(idx);
  });
  const list = Array.from(comps.values()).sort((a, b) => a.first - b.first);
  const parts: RawMeshPart[] = [];
  list.forEach((c, k) => {
    const per = new Map<number, { pos: number[]; uv: number[]; area: number }>();
    for (const fi of c.faces) {
      const f = fMeta[fi];
      let b = per.get(f.m);
      if (!b) { b = { pos: [], uv: [], area: 0 }; per.set(f.m, b); }
      for (let i = 1; i < f.n - 1; i++) {
        const base = b.pos.length;
        for (const j of [0, i, i + 1]) {
          const vi = fv[f.off + j * 2] * 3, ti = fv[f.off + j * 2 + 1];
          b.pos.push(V[vi], V[vi + 1], V[vi + 2]);
          if (ti >= 0 && ti * 2 + 1 < VT.length) b.uv.push(VT[ti * 2], VT[ti * 2 + 1]); else b.uv.push(0, 0);
        }
        const p = b.pos;
        const ux = p[base + 3] - p[base], uy = p[base + 4] - p[base + 1], uz = p[base + 5] - p[base + 2];
        const vx = p[base + 6] - p[base], vy = p[base + 7] - p[base + 1], vz = p[base + 8] - p[base + 2];
        b.area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
      }
    }
    let total = 0;
    per.forEach((b) => { total += b.pos.length; });
    const positions = new Float32Array(total);
    const uvs = new Float32Array((total / 3) * 2);
    const groups: MatGroup[] = [];
    let o = 0, best = 'Materialsiz', bestA = -1;
    per.forEach((b, m) => {
      const mname = m >= 0 ? matNames[m] : 'Materialsiz';
      const def = mtl?.get(mname) ?? (mtl ? [...mtl.values()].find((d) => d.name.toLowerCase() === mname.toLowerCase()) : undefined);
      const rgb = def?.kd ?? (def?.ka && !def.ka.every((x) => x >= 0.99 || x <= 0.01) ? def.ka : null);
      positions.set(b.pos, o);
      uvs.set(b.uv, (o / 3) * 2);
      groups.push({ material: mname, color: rgb ? rgbHex(rgb) : colorFor(mname, m + 1), texName: def?.map || '', start: o / 3, count: b.pos.length / 3 });
      o += b.pos.length;
      if (b.area > bestA) { bestA = b.area; best = mname; }
    });
    parts.push({
      name: 'Detal ' + (k + 1),
      group: '',
      positions,
      uvs,
      matGroups: groups,
      material: best,
      note: groups.length > 1 ? 'Detal ' + groups.length + ' ta materialdan iborat; eng katta yuzali material olindi.' : '',
    });
  });
  return {
    name: fileName.replace(/\.obj$/i, ''),
    parts,
    mtlName,
    stats: { vertices: nV, faces: fMeta.length, materialBlocks: usemtlCount, parts: parts.length },
  };
}
