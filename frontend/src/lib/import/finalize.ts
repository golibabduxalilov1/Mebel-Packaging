import type { ImportOptions, ImportResult, OBB, Part, Vec3 } from '../types';
import { classify, colorFor, computeOBB, fmt, meshBounds, meshVolume, polyArea, sortedDims } from './geom';
import { rotV } from './b3d';
import type { DaeResult, RawMeshPart } from './dae';
import type { ObjResult } from './obj';
import type { B3dResult } from './b3d';

const SCALE = { mm: 1, cm: 10, m: 1000 } as const;

function unionBox(parts: Part[]): { min: Vec3; max: Vec3 } | null {
  const mn: Vec3 = [Infinity, Infinity, Infinity], mx: Vec3 = [-Infinity, -Infinity, -Infinity];
  let any = false;
  for (const p of parts) {
    if (!p.bbox || p.kind === 'ignore') continue;
    any = true;
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.bbox.min[k]); mx[k] = Math.max(mx[k], p.bbox.max[k]); }
  }
  return any ? { min: mn, max: mx } : null;
}

function rawMaxDim(parts: RawMeshPart[]): number {
  let mx = 0;
  for (const p of parts) {
    if (!p.positions) continue;
    const b = meshBounds(p.positions)!;
    for (let k = 0; k < 3; k++) mx = Math.max(mx, Math.abs(b.max[k]), Math.abs(b.min[k]));
  }
  return mx;
}

/** Mesh formatlari (DAE, OBJ) uchun umumiy yakunlash. */
export function finalizeMesh(
  raw: RawMeshPart[],
  meta: { format: 'dae' | 'obj'; name: string; source: string; fileUp: 'Y' | 'Z'; fileMeter: number | null; stats: Record<string, number | string>; warnings: string[] },
  opts: ImportOptions,
): ImportResult {
  const notes: string[] = [];
  // birlik
  let scale = 1;
  if (opts.unit !== 'auto') {
    scale = SCALE[opts.unit];
    notes.push('Birlik import sozlamasida tanlandi: 1 birlik = ' + opts.unit + '.');
  } else if (meta.format === 'dae') {
    const toMm = (meta.fileMeter || 1) * 1000;
    const md = rawMaxDim(raw);
    if (Math.abs(toMm - 1) < 1e-9) scale = 1;
    else if (md * toMm > 30000 && md <= 30000) {
      scale = 1;
      notes.push('Faylda birlik "' + meta.fileMeter + ' m" deb yozilgan, lekin koordinatalar shunga mos kelmadi; ular mm deb olindi. Kerak bo\'lsa import oynasida birlikni o\'zgartiring.');
    } else {
      scale = toMm;
      notes.push('Birlik fayldan olindi (1 birlik = ' + meta.fileMeter + ' m); o\'lchamlar mm ga o\'tkazildi.');
    }
  } else {
    const md = rawMaxDim(raw);
    if (md > 0 && md < 30) { scale = 1000; notes.push("OBJ faylda birlik yozilmaydi. Koordinatalar juda kichik (30 dan kam), metr deb olinib mm ga o'tkazildi."); }
    else notes.push("OBJ faylda birlik yozilmaydi; koordinatalar mm deb olindi.");
  }
  // yuqori o'q
  const up = opts.upAxis === 'auto' ? meta.fileUp : opts.upAxis;
  if (up === 'Z') notes.push("Model Z yuqoriga yo'nalgan; ko'rgichda Y yuqoriga qilib burildi.");

  const parts: Part[] = raw.map((r, i) => {
    const pos = r.positions;
    if (pos) {
      for (let k = 0; k + 2 < pos.length; k += 3) {
        let x = pos[k] * scale, y = pos[k + 1] * scale, z = pos[k + 2] * scale;
        if (up === 'Z') { const t = y; y = z; z = -t; }
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      }
    }
    const bbox = pos ? meshBounds(pos) : null;
    const obb: OBB | null = pos ? computeOBB(pos) : null;
    const dims = obb ? sortedDims(obb.size) : { L: null, W: null, T: null };
    const vol = pos ? meshVolume(pos) : 0;
    const obbVol = dims.L != null ? dims.L * dims.W! * dims.T! : 0;
    const volume = pos && obbVol > 0 ? (vol > obbVol * 0.02 && vol <= obbVol * 1.02 ? vol : obbVol) : null;
    const kind = classify(r.name, r.material, dims);
    const color = r.matGroups.find((g) => g.material === r.material)?.color || colorFor(r.material, i);
    return {
      id: 'm' + (i + 1),
      name: r.name,
      baseName: r.name,
      material: pos ? r.material : "noma'lum",
      kind,
      geom: pos ? 'mesh' : 'none',
      group: r.group,
      color,
      note: r.note + (pos ? '' : (r.note ? ' ' : '') + "Geometriyasi yo'q element: o'lchami noma'lum, yelimlanmaydi."),
      positions: pos || undefined,
      uvs: r.uvs,
      matGroups: r.matGroups,
      tris: pos ? pos.length / 9 : 0,
      bbox,
      obb,
      dims,
      area: dims.L != null && dims.W != null ? dims.L * dims.W : null,
      volume,
      edgeText: '',
    };
  });
  const box = unionBox(parts);
  const gabarit: Vec3 | null = box ? [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]] : null;
  if (gabarit) notes.push('Gabarit: ' + fmt(gabarit[0]) + ' × ' + fmt(gabarit[1]) + ' × ' + fmt(gabarit[2]) + ' mm (eni × balandligi × chuqurligi).');
  return { name: meta.name, format: meta.format, source: meta.source, unit: 'mm', parts, warnings: meta.warnings, notes, gabarit, stats: meta.stats };
}

export function finalizeDae(d: DaeResult, opts: ImportOptions): ImportResult {
  return finalizeMesh(d.parts, {
    format: 'dae', name: d.name,
    source: 'COLLADA' + (d.meter !== 1 ? ' (1 birlik = ' + d.meter + ' m)' : '') + ', ' + d.upAxis,
    fileUp: d.upAxis === 'Z_UP' ? 'Z' : 'Y', fileMeter: d.meter,
    stats: { ...d.stats }, warnings: d.warnings,
  }, opts);
}

export function finalizeObj(o: ObjResult, opts: ImportOptions, hadMtl: boolean): ImportResult {
  const res = finalizeMesh(o.parts, {
    format: 'obj', name: o.name, source: 'OBJ', fileUp: 'Y', fileMeter: null,
    stats: { ...o.stats }, warnings: [],
  }, opts);
  res.notes.push("OBJ da detal nomlari saqlanmaydi: detallar bog'langan jismlar bo'yicha ajratildi va \"Detal 1, 2, ...\" deb nomlandi.");
  if (!hadMtl) res.notes.push(o.mtlName ? 'Fayl "' + o.mtlName + '" materiallar faylini talab qiladi, u tanlanmadi. Ranglar material nomiga qarab berildi.' : 'Ranglar material nomiga qarab berildi.');
  return res;
}

function quatAxes(q: [number, number, number, number]): [Vec3, Vec3, Vec3] {
  return [rotV(q, [1, 0, 0]), rotV(q, [0, 1, 0]), rotV(q, [0, 0, 1])];
}

export function finalizeB3d(b: B3dResult): ImportResult {
  const matIdx = new Map<string, number>();
  const seen = new Set<string>();
  const parts: Part[] = b.parts.map((r, i) => {
    let id = r.id;
    if (seen.has(id)) id = id + '_' + (i + 1);
    seen.add(id);
    if (!matIdx.has(r.material)) matIdx.set(r.material, matIdx.size);
    const color = r.color || colorFor(r.material, matIdx.get(r.material)!);
    const q = r.quat || [0, 0, 0, 1];
    const p = r.pos || [0, 0, 0];
    const corners: Vec3[] = [];
    let size: Vec3, localCenter: Vec3;
    if (r.geom === 'contour' && r.loops) {
      const z0 = r.zShift || 0, z1 = z0 + (r.thick || 0);
      for (const pt of r.loops[0]) { corners.push([pt[0], pt[1], z0]); corners.push([pt[0], pt[1], z1]); }
      let mnx = Infinity, mny = Infinity, mxx = -Infinity, mxy = -Infinity;
      for (const pt of r.loops[0]) { mnx = Math.min(mnx, pt[0]); mxx = Math.max(mxx, pt[0]); mny = Math.min(mny, pt[1]); mxy = Math.max(mxy, pt[1]); }
      size = [mxx - mnx, mxy - mny, r.thick || 0];
      localCenter = [(mnx + mxx) / 2, (mny + mxy) / 2, z0 + (r.thick || 0) / 2];
    } else {
      const a = r.boxMin || [0, 0, 0], c = r.boxMax || [0, 0, 0];
      for (const x of [a[0], c[0]]) for (const y of [a[1], c[1]]) for (const z of [a[2], c[2]]) corners.push([x, y, z]);
      size = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      localCenter = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2];
    }
    const mn: Vec3 = [Infinity, Infinity, Infinity], mx: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const c of corners) {
      const w = rotV(q, c);
      for (let k = 0; k < 3; k++) { const v = w[k] + p[k]; mn[k] = Math.min(mn[k], v); mx[k] = Math.max(mx[k], v); }
    }
    const wc = rotV(q, localCenter);
    const obb: OBB = { center: [wc[0] + p[0], wc[1] + p[1], wc[2] + p[2]], axes: quatAxes(q), size };
    let dims: Part['dims'];
    let area: number | null = null;
    if (r.geom === 'contour' && r.kind === 'panel') {
      dims = { L: Math.max(size[0], size[1]), W: Math.min(size[0], size[1]), T: size[2] };
    } else dims = sortedDims(size);
    if (r.geom === 'contour' && r.loops) {
      const n = r.lineLoops || r.loops.length;
      let a = polyArea(r.loops[0]);
      for (let k = 1; k < n; k++) a -= polyArea(r.loops[k]);
      for (const c of r.circles || []) a -= Math.PI * c.r * c.r;
      area = Math.max(a, 0);
    }
    const volume = area != null ? area * (r.thick || 0) : dims.L! * dims.W! * dims.T!;
    return { ...r, id, color, bbox: { min: mn, max: mx }, obb, dims, area, volume } as Part;
  });
  const box = unionBox(parts);
  const gabarit: Vec3 | null = box ? [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]] : null;
  const notes: string[] = [];
  if (!parts.some((x) => x.edges && x.edges.length)) notes.push("Faylda kromka ma'lumoti topilmadi: kromka \"noma'lum\" ko'rsatiladi.");
  return {
    name: b.name, format: 'b3d', source: b.source, unit: 'mm', parts, warnings: b.warnings, notes, gabarit,
    thumb: b.thumb, stats: { ...b.stats, total: parts.length },
  };
}

export function finalizeJson(j: ReturnType<typeof import('./bazisJson').parseBazisJson>): ImportResult {
  const matIdx = new Map<string, number>();
  const parts: Part[] = j.parts.map((r) => {
    if (!matIdx.has(r.material)) matIdx.set(r.material, matIdx.size);
    const color = r.color || colorFor(r.material, matIdx.get(r.material)!);
    const bbox = r.boxMin && r.boxMax ? { min: r.boxMin, max: r.boxMax } : null;
    const obb: OBB | null = bbox
      ? { center: [(bbox.min[0] + bbox.max[0]) / 2, (bbox.min[1] + bbox.max[1]) / 2, (bbox.min[2] + bbox.max[2]) / 2], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], size: [bbox.max[0] - bbox.min[0], bbox.max[1] - bbox.min[1], bbox.max[2] - bbox.min[2]] }
      : null;
    const dims = r.jsonDims;
    const sorted = dims.L != null && dims.W != null ? { L: Math.max(dims.L, dims.W), W: Math.min(dims.L, dims.W), T: dims.T } : dims;
    const volume = sorted.L != null && sorted.W != null && sorted.T != null ? sorted.L * sorted.W * sorted.T : null;
    const { jsonDims: _j, ...rest } = r;
    void _j;
    return { ...rest, color, bbox, obb, dims: sorted, area: sorted.L != null && sorted.W != null ? sorted.L * sorted.W : null, volume } as Part;
  });
  const box = unionBox(parts);
  const gabarit: Vec3 | null = box ? [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]] : null;
  return { name: j.name, format: 'json', source: j.source, unit: 'mm', parts, warnings: j.warnings, notes: [], gabarit, stats: j.stats };
}
