/*
 * COLLADA (.dae) o'qigich. Web Worker ichida ishlaydi (DOMParser o'rniga xml.ts).
 * TZ F6: yuqori daraja elementlari detal deb olinadi; materiallar yuza materialidan,
 * o'lchamlar geometriyadan. Geometriyasi yo'q element ham detal bo'lib qoladi, o'lchami "noma'lum".
 * Natijadagi koordinatalar fayl koordinatasida (tugun transformatsiyalari qo'llangan),
 * yuqori o'q va birlik finalize.ts da almashtiriladi.
 */
import { first, kids, nums, parseIntList, parseXML, type XEl } from './xml';
import { colorFor, rgbHex } from './geom';
import type { MatGroup } from '../types';

export interface RawMeshPart {
  name: string;
  group: string;
  positions: Float32Array | null;
  uvs: Float32Array | null;
  matGroups: MatGroup[];
  material: string;
  note: string;
}

export interface DaeResult {
  name: string;
  upAxis: string;
  meter: number;
  parts: RawMeshPart[];
  warnings: string[];
  stats: { topNodes: number; withGeometry: number; withoutGeometry: number; triangles: number };
}

type M4 = number[]; // row-major 4x4
const I4: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(A: M4, B: M4): M4 {
  const R = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += A[i * 4 + k] * B[k * 4 + j];
    R[i * 4 + j] = s;
  }
  return R;
}

function nodeMatrix(node: XEl): M4 {
  let M = I4;
  for (const c of node.kids) {
    if (c.tag === 'matrix') {
      const a = nums(c);
      if (a.length === 16) M = mul(M, Array.from(a));
    } else if (c.tag === 'translate') {
      const t = nums(c);
      M = mul(M, [1, 0, 0, t[0] || 0, 0, 1, 0, t[1] || 0, 0, 0, 1, t[2] || 0, 0, 0, 0, 1]);
    } else if (c.tag === 'scale') {
      const s = nums(c);
      M = mul(M, [s[0] ?? 1, 0, 0, 0, 0, s[1] ?? 1, 0, 0, 0, 0, s[2] ?? 1, 0, 0, 0, 0, 1]);
    } else if (c.tag === 'rotate') {
      const r = nums(c);
      const l = Math.hypot(r[0], r[1], r[2]) || 1;
      const x = r[0] / l, y = r[1] / l, z = r[2] / l;
      const a = ((r[3] || 0) * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a), t = 1 - cs;
      M = mul(M, [
        t * x * x + cs, t * x * y - sn * z, t * x * z + sn * y, 0,
        t * x * y + sn * z, t * y * y + cs, t * y * z - sn * x, 0,
        t * x * z - sn * y, t * y * z + sn * x, t * z * z + cs, 0,
        0, 0, 0, 1,
      ]);
    }
  }
  return M;
}

interface Src { data: Float64Array; stride: number }
interface Prim { mat: string; vIdx: Int32Array; tIdx: Int32Array | null; tSrc: Src | null }
interface Geo { pos: Src; prims: Prim[] }
interface MatInfo { name: string; color: string | null; tex: string }

export function parseDAE(text: string, fileName: string, level: 'top' | 'mesh'): DaeResult {
  const root = parseXML(text);
  if (root.tag !== 'COLLADA') throw new Error('bu COLLADA (.dae) fayl emas');
  const asset = first(root, 'asset');
  const up = (first(asset, 'up_axis')?.text || 'Y_UP').trim();
  const unitEl = first(asset, 'unit');
  const meter = unitEl ? parseFloat(unitEl.attrs.meter || '1') || 1 : 1;
  const warnings: string[] = [];

  /* id indeksi (url="#id" larni tez topish uchun) */
  const byId = new Map<string, XEl>();
  const index = (e: XEl) => {
    const id = e.attrs.id;
    if (id) byId.set(id, e);
    for (const k of e.kids) index(k);
  };
  index(root);
  const ref = (u: string | undefined) => (u ? byId.get(u.replace(/^#/, '')) || null : null);

  /* rasmlar, effektlar, materiallar */
  const imageFile = (id: string): string => {
    const im = byId.get(id);
    if (!im) return '';
    const f = first(im, 'init_from');
    return f ? (first(f, 'ref')?.text || f.text || '').trim() : '';
  };
  const effects = new Map<string, { color: string | null; tex: string }>();
  for (const ef of kids(first(root, 'library_effects'), 'effect')) {
    const info = { color: null as string | null, tex: '' };
    const prof = first(ef, 'profile_COMMON');
    const tech = first(prof, 'technique');
    const shade = tech?.kids.find((c) => /phong|lambert|blinn|constant/.test(c.tag)) || null;
    const dif = first(shade, 'diffuse');
    /* rang <color> ichida yoki <param ref="..."/> orqali newparam/<float4> da bo'lishi mumkin */
    const colorOf = (el: typeof dif): string | null => {
      if (!el) return null;
      const col = first(el, 'color');
      let a = col ? nums(col) : [];
      if (a.length < 3) {
        const ref = first(el, 'param')?.attrs.ref;
        if (ref) {
          for (const np of [...kids(prof, 'newparam'), ...kids(tech, 'newparam')]) {
            if (np.attrs.sid !== ref) continue;
            const f4 = first(np, 'float4') || first(np, 'float3');
            if (f4) a = nums(f4);
          }
        }
      }
      return a.length >= 3 ? rgbHex(a) : null;
    };
    info.color = colorOf(dif);
    if (dif) {
      const tx = first(dif, 'texture');
      if (tx && prof) {
        const sampler = tx.attrs.texture;
        let imgId = '';
        for (const np of kids(prof, 'newparam')) {
          if (np.attrs.sid !== sampler) continue;
          const s2 = first(np, 'sampler2D');
          const src = (first(s2, 'source')?.text || '').trim();
          const inst = first(s2, 'instance_image');
          if (inst) imgId = (inst.attrs.url || '').replace(/^#/, '');
          for (const n2 of kids(prof, 'newparam')) {
            const su = first(n2, 'surface');
            if (su && n2.attrs.sid === src) imgId = (first(su, 'init_from')?.text || '').trim();
          }
        }
        if (!imgId) imgId = sampler || '';
        info.tex = imageFile(imgId);
      }
    }
    /* diffuse rangsiz bo'lsa (masalan faqat tekstura) ambient/emission/constant dan olamiz, oq bo'lmasa */
    if (!info.color && !info.tex) {
      for (const tag of ['ambient', 'emission']) {
        const c = colorOf(first(shade, tag));
        if (c && c !== '#ffffff' && c !== '#000000') { info.color = c; break; }
      }
    }
    if (ef.attrs.id) effects.set(ef.attrs.id, info);
  }
  const materials = new Map<string, MatInfo>();
  for (const m of kids(first(root, 'library_materials'), 'material')) {
    const ie = first(m, 'instance_effect');
    const ef = ie ? effects.get((ie.attrs.url || '').replace(/^#/, '')) : undefined;
    materials.set(m.attrs.id || '', { name: m.attrs.name || m.attrs.id || 'Materialsiz', color: ef?.color ?? null, tex: ef?.tex || '' });
  }

  /* geometriyalar (kerak bo'lganda o'qiladi) */
  const geoCache = new Map<string, Geo | null>();
  const source = (mesh: XEl, id: string | undefined): Src | null => {
    if (!id) return null;
    const key = id.replace(/^#/, '');
    for (const s of kids(mesh, 'source')) {
      if (s.attrs.id !== key) continue;
      const fa = first(s, 'float_array');
      if (!fa) return null;
      const acc = first(first(s, 'technique_common'), 'accessor');
      return { data: nums(fa), stride: acc ? parseInt(acc.attrs.stride || '3', 10) || 3 : 3 };
    }
    return null;
  };
  const getGeo = (id: string): Geo | null => {
    if (geoCache.has(id)) return geoCache.get(id)!;
    const g = byId.get(id);
    const mesh = first(g, 'mesh');
    let out: Geo | null = null;
    if (mesh) {
      const vtx = first(mesh, 'vertices');
      const vin = kids(vtx, 'input').find((i) => i.attrs.semantic === 'POSITION');
      const pos = vin ? source(mesh, vin.attrs.source) : null;
      if (pos) {
        const prims: Prim[] = [];
        for (const tag of ['triangles', 'polylist', 'polygons']) {
          for (const pr of kids(mesh, tag)) {
            const inputs = kids(pr, 'input');
            let maxOff = 0, vOff = 0, tOff = -1;
            let tSrc: Src | null = null;
            for (const inp of inputs) {
              const off = parseInt(inp.attrs.offset || '0', 10) || 0;
              if (off > maxOff) maxOff = off;
              if (inp.attrs.semantic === 'VERTEX') vOff = off;
              if (inp.attrs.semantic === 'TEXCOORD' && tOff < 0) { tOff = off; tSrc = source(mesh, inp.attrs.source); }
            }
            const st = maxOff + 1;
            const v: number[] = [], t: number[] = [];
            const pushV = (a: Int32Array, o: number) => { v.push(a[o + vOff]); if (tSrc) t.push(a[o + tOff]); };
            if (tag === 'triangles') {
              const a = parseIntList(first(pr, 'p')?.text || '');
              for (let o = 0; o + st * 3 <= a.length; o += st) pushV(a, o);
            } else if (tag === 'polylist') {
              const vc = parseIntList(first(pr, 'vcount')?.text || '');
              const a = parseIntList(first(pr, 'p')?.text || '');
              let o = 0;
              for (let k = 0; k < vc.length; k++) {
                const n = vc[k];
                for (let j = 1; j < n - 1; j++) { pushV(a, o); pushV(a, o + j * st); pushV(a, o + (j + 1) * st); }
                o += n * st;
              }
            } else {
              for (const p of kids(pr, 'p')) {
                const a = parseIntList(p.text);
                const n = Math.floor(a.length / st);
                for (let j = 1; j < n - 1; j++) { pushV(a, 0); pushV(a, j * st); pushV(a, (j + 1) * st); }
              }
            }
            if (v.length) prims.push({ mat: pr.attrs.material || '', vIdx: Int32Array.from(v), tIdx: tSrc ? Int32Array.from(t) : null, tSrc });
          }
        }
        out = { pos, prims };
      }
    }
    geoCache.set(id, out);
    return out;
  };

  /* bitta detal uchun to'plangan mesh bo'laklari */
  interface Acc { ig: XEl; M: M4 }
  const collect = (node: XEl, M: M4, acc: Acc[], depth: number) => {
    if (depth > 48) return;
    const Mn = mul(M, nodeMatrix(node));
    for (const ig of kids(node, 'instance_geometry')) acc.push({ ig, M: Mn });
    for (const inode of kids(node, 'instance_node')) {
      const target = ref(inode.attrs.url);
      if (target) collect(target, Mn, acc, depth + 1);
    }
    for (const k of kids(node, 'node')) collect(k, Mn, acc, depth + 1);
  };
  const hasGeomDeep = (node: XEl, depth = 0): boolean => {
    if (depth > 48) return false;
    if (kids(node, 'instance_geometry').length) return true;
    for (const i of kids(node, 'instance_node')) { const t = ref(i.attrs.url); if (t && hasGeomDeep(t, depth + 1)) return true; }
    return kids(node, 'node').some((k) => hasGeomDeep(k, depth + 1));
  };

  let triTotal = 0;
  const build = (acc: Acc[], name: string, group: string): RawMeshPart => {
    const per = new Map<string, { info: MatInfo | null; pos: number[]; uv: number[]; area: number }>();
    for (const { ig, M } of acc) {
      const g = getGeo((ig.attrs.url || '').replace(/^#/, ''));
      if (!g) continue;
      const bind: Record<string, string> = {};
      const tc = first(first(ig, 'bind_material'), 'technique_common');
      for (const im of kids(tc, 'instance_material')) bind[im.attrs.symbol || ''] = (im.attrs.target || '').replace(/^#/, '');
      for (const pr of g.prims) {
        const mi = materials.get(bind[pr.mat] ?? pr.mat) || null;
        const key = mi ? mi.name : 'Materialsiz';
        let bucket = per.get(key);
        if (!bucket) { bucket = { info: mi, pos: [], uv: [], area: 0 }; per.set(key, bucket); }
        const d = g.pos.data, s = g.pos.stride;
        const vi = pr.vIdx;
        for (let k = 0; k + 2 < vi.length; k += 3) {
          const base = bucket.pos.length;
          for (let j = 0; j < 3; j++) {
            const ii = vi[k + j] * s;
            const x = d[ii], y = d[ii + 1], z = d[ii + 2];
            bucket.pos.push(
              M[0] * x + M[1] * y + M[2] * z + M[3],
              M[4] * x + M[5] * y + M[6] * z + M[7],
              M[8] * x + M[9] * y + M[10] * z + M[11],
            );
            if (pr.tIdx && pr.tSrc) {
              const ti = pr.tIdx[k + j] * pr.tSrc.stride;
              bucket.uv.push(pr.tSrc.data[ti] || 0, pr.tSrc.data[ti + 1] || 0);
            } else bucket.uv.push(0, 0);
          }
          const p = bucket.pos;
          const ux = p[base + 3] - p[base], uy = p[base + 4] - p[base + 1], uz = p[base + 5] - p[base + 2];
          const vx = p[base + 6] - p[base], vy = p[base + 7] - p[base + 1], vz = p[base + 8] - p[base + 2];
          bucket.area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        }
      }
    }
    let total = 0;
    per.forEach((b) => { total += b.pos.length; });
    if (!total) return { name, group, positions: null, uvs: null, matGroups: [], material: 'Materialsiz', note: '' };
    const positions = new Float32Array(total);
    const uvs = new Float32Array((total / 3) * 2);
    const groups: MatGroup[] = [];
    let o = 0, best = '', bestA = -1, ci = 0;
    per.forEach((b, mname) => {
      positions.set(b.pos, o);
      uvs.set(b.uv, (o / 3) * 2);
      groups.push({ material: mname, color: b.info?.color || colorFor(mname, ci++), texName: b.info?.tex || '', start: o / 3, count: b.pos.length / 3 });
      o += b.pos.length;
      if (b.area > bestA) { bestA = b.area; best = mname; }
    });
    triTotal += total / 9;
    const note = groups.length > 1
      ? 'Detal ' + groups.length + ' ta materialdan iborat (' + groups.map((g) => g.material).slice(0, 4).join(', ') + "); jadvalda eng katta yuzali material ko'rsatiladi."
      : '';
    return { name, group, positions, uvs, matGroups: groups, material: best, note };
  };

  const vsInst = first(first(root, 'scene'), 'instance_visual_scene');
  const vs = ref(vsInst?.attrs.url) || first(first(root, 'library_visual_scenes'), 'visual_scene');
  if (!vs) throw new Error('DAE faylda sahna (visual_scene) topilmadi');

  const parts: RawMeshPart[] = [];
  let topCount = 0;
  if (level === 'top') {
    // Bitta "o'rovchi" tugun bo'lsa (masalan, butun model), ichiga tushamiz.
    let levelNodes = kids(vs, 'node');
    let M = I4;
    const path: string[] = [];
    while (
      levelNodes.length === 1 &&
      !kids(levelNodes[0], 'instance_geometry').length &&
      !kids(levelNodes[0], 'instance_node').length &&
      kids(levelNodes[0], 'node').length > 0
    ) {
      M = mul(M, nodeMatrix(levelNodes[0]));
      path.push(levelNodes[0].attrs.name || levelNodes[0].attrs.id || '');
      levelNodes = kids(levelNodes[0], 'node');
    }
    topCount = levelNodes.length;
    levelNodes.forEach((n, i) => {
      const nm = n.attrs.name || n.attrs.id || 'Detal ' + (i + 1);
      const acc: Acc[] = [];
      if (hasGeomDeep(n)) collect(n, M, acc, 0);
      parts.push(build(acc, nm, path.filter(Boolean).join(' / ')));
    });
  } else {
    // Har bir mesh tugunli tugun alohida detal (namuna ko'rgich usuli)
    const walk = (node: XEl, M: M4, path: string[], depth: number) => {
      if (depth > 48) return;
      const Mn = mul(M, nodeMatrix(node));
      const ks = kids(node, 'node');
      const anon = (k: XEl) => !k.attrs.name || /^(mesh|geom|geometry|group|node|object|id)?[\s_-]?\d*$/i.test(k.attrs.name) || k.attrs.name === node.attrs.name;
      const leaf = ks.filter((k) => kids(k, 'instance_geometry').length && !kids(k, 'node').length && anon(k));
      const own = kids(node, 'instance_geometry').length > 0 || kids(node, 'instance_node').length > 0;
      const nm = node.attrs.name || node.attrs.id || '';
      if (leaf.length || own) {
        const acc: Acc[] = [];
        for (const ig of kids(node, 'instance_geometry')) acc.push({ ig, M: Mn });
        for (const inode of kids(node, 'instance_node')) { const t = ref(inode.attrs.url); if (t) collect(t, Mn, acc, depth + 1); }
        for (const k of leaf) collect(k, Mn, acc, depth + 1);
        const p = build(acc, nm || path[path.length - 1] || 'Detal', path.filter(Boolean).join(' / '));
        if (p.positions) parts.push(p);
      }
      for (const k of ks) if (leaf.indexOf(k) < 0) walk(k, Mn, path.concat([nm]), depth + 1);
    };
    for (const n of kids(vs, 'node')) walk(n, I4, [], 0);
    topCount = parts.length;
  }
  if (!parts.length) throw new Error("DAE faylda detal (tugun) topilmadi");
  const withGeo = parts.filter((p) => p.positions).length;
  if (!withGeo) throw new Error("DAE faylda ko'rsatiladigan geometriya topilmadi");
  return {
    name: fileName.replace(/\.dae$/i, ''),
    upAxis: up,
    meter,
    parts,
    warnings,
    stats: { topNodes: topCount, withGeometry: withGeo, withoutGeometry: parts.length - withGeo, triangles: Math.round(triTotal) },
  };
}
