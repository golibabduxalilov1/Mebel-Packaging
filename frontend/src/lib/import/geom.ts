import type { OBB, PartKind, Vec2, Vec3 } from '../types';

export function meshBounds(pos: ArrayLike<number>): { min: Vec3; max: Vec3 } | null {
  if (!pos.length) return null;
  let a = Infinity, b = Infinity, c = Infinity, d = -Infinity, e = -Infinity, f = -Infinity;
  for (let i = 0; i + 2 < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], z = pos[i + 2];
    if (x < a) a = x; if (x > d) d = x;
    if (y < b) b = y; if (y > e) e = y;
    if (z < c) c = z; if (z > f) f = z;
  }
  return { min: [a, b, c], max: [d, e, f] };
}

export function triArea9(p: ArrayLike<number>, o: number): number {
  const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
  const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
  const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
  return 0.5 * Math.hypot(cx, cy, cz);
}

export function meshArea(p: ArrayLike<number>): number {
  let a = 0;
  for (let o = 0; o + 8 < p.length; o += 9) a += triArea9(p, o);
  return a;
}

/** Yopiq mesh hajmi (divergensiya teoremasi). Ochiq meshda noto'g'ri bo'ladi, shuning uchun tekshirib ishlatiladi. */
export function meshVolume(p: ArrayLike<number>): number {
  let v = 0;
  for (let o = 0; o + 8 < p.length; o += 9) {
    const ax = p[o], ay = p[o + 1], az = p[o + 2];
    const bx = p[o + 3], by = p[o + 4], bz = p[o + 5];
    const cx = p[o + 6], cy = p[o + 7], cz = p[o + 8];
    v += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return Math.abs(v / 6);
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function hull2(pts: Vec2[]): Vec2[] {
  if (pts.length < 3) return pts.slice();
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Vec2[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: Vec2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  up.pop();
  lo.pop();
  return lo.concat(up);
}

/** Tekislikdagi nuqtalar uchun eng kichik maydonli to'rtburchak yo'nalishi (radianda). */
function minRectAngle(h: Vec2[]): number {
  if (h.length < 3) {
    if (h.length === 2) return Math.atan2(h[1][1] - h[0][1], h[1][0] - h[0][0]);
    return 0;
  }
  let best = Infinity, ang = 0;
  for (let i = 0; i < h.length; i++) {
    const a = h[i], b = h[(i + 1) % h.length];
    const t = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const c = Math.cos(t), s = Math.sin(t);
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const q of h) {
      const x = q[0] * c + q[1] * s, y = -q[0] * s + q[1] * c;
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
    }
    const area = (mxx - mnx) * (mxy - mny);
    if (area < best - 1e-6) { best = area; ang = t; }
  }
  return ang;
}

/**
 * Mesh uchun yo'naltirilgan gabarit qutisi. Asosiy o'q: eng katta umumiy yuzaga ega normal
 * yo'nalishi (panelda bu qalinlik o'qi). Qolgan ikki o'q shu tekislikdagi proyeksiyaning
 * eng kichik maydonli to'rtburchagidan olinadi. Burilgan panellarda ham to'g'ri L x W x T beradi.
 */
export function computeOBB(pos: ArrayLike<number>): OBB | null {
  const nTri = Math.floor(pos.length / 9);
  if (!nTri) return null;
  const clusters: { d: Vec3; a: number }[] = [];
  const COS = Math.cos((3 * Math.PI) / 180);
  for (let t = 0; t < nTri; t++) {
    const o = t * 9;
    const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2];
    const vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const l = Math.hypot(cx, cy, cz);
    if (l < 1e-9) continue;
    const n: Vec3 = [cx / l, cy / l, cz / l];
    const a = l / 2;
    let hit = false;
    for (const c of clusters) {
      const d = dot(c.d, n);
      if (Math.abs(d) >= COS) { c.a += a; hit = true; break; }
    }
    if (!hit && clusters.length < 96) clusters.push({ d: n, a });
  }
  if (!clusters.length) return null;
  clusters.sort((x, y) => y.a - x.a);
  const n1 = norm(clusters[0].d);
  // tekislik bazisi
  const helper: Vec3 = Math.abs(n1[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const e1 = norm(cross(n1, helper));
  const e2 = norm(cross(n1, e1));
  const seen = new Set<string>();
  const pts: Vec2[] = [];
  const step = Math.max(1, Math.floor(pos.length / 3 / 60000)); // juda katta meshlarda siyraklashtiramiz
  for (let i = 0; i + 2 < pos.length; i += 3 * step) {
    const p: Vec3 = [pos[i], pos[i + 1], pos[i + 2]];
    const x = dot(p, e1), y = dot(p, e2);
    const key = Math.round(x * 10) + ',' + Math.round(y * 10);
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push([x, y]);
  }
  const ang = minRectAngle(hull2(pts));
  const c = Math.cos(ang), s = Math.sin(ang);
  const u = norm([e1[0] * c + e2[0] * s, e1[1] * c + e2[1] * s, e1[2] * c + e2[2] * s]);
  const v = norm(cross(n1, u));
  const axes: [Vec3, Vec3, Vec3] = [u, v, n1];
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i + 2 < pos.length; i += 3) {
    const p: Vec3 = [pos[i], pos[i + 1], pos[i + 2]];
    for (let k = 0; k < 3; k++) {
      const d = dot(p, axes[k]);
      if (d < mn[k]) mn[k] = d;
      if (d > mx[k]) mx[k] = d;
    }
  }
  const size: Vec3 = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
  const mid = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  const center: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) for (let j = 0; j < 3; j++) center[j] += axes[k][j] * mid[k];
  // AABB dan katta chiqsa (masalan egri detal), AABB ni olamiz
  const bb = meshBounds(pos)!;
  const aab: Vec3 = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  if (aab[0] * aab[1] * aab[2] <= size[0] * size[1] * size[2] * 0.999) {
    return {
      center: [(bb.min[0] + bb.max[0]) / 2, (bb.min[1] + bb.max[1]) / 2, (bb.min[2] + bb.max[2]) / 2],
      axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
      size: aab,
    };
  }
  return { center, axes, size };
}

export function sortedDims(s: Vec3): { L: number; W: number; T: number } {
  const a = [s[0], s[1], s[2]].sort((x, y) => y - x);
  return { L: a[0], W: a[1], T: a[2] };
}

/* ---------- tur aniqlash ---------- */
const HW_RE = /саморез|шуруп|подков|скоб|эксцентр|евровинт|конфирмат|шкант|петл|ручк|опор|полкодерж|ножк|направляющ|завертк|уголок|стяжк|дюбел|винт|болт|гайк|минификс|кронштейн|заглушк|габарит|фурнитур|магнит|замок|ролик|крючок|штанг|screw|hinge|handle|dowel|bolt|nut|bracket|vint|fastener|hardware/i;
const PROF_RE = /профил|profile|труба|tube|штанг|алюмин/i;

export function classify(name: string, material: string, d: { L: number | null; W: number | null; T: number | null }): PartKind {
  const s = name + ' ' + material;
  if (PROF_RE.test(s) && !/ручк/i.test(s)) return 'profile';
  if (HW_RE.test(s)) return 'hardware';
  if (d.L == null || d.W == null || d.T == null) return 'hardware';
  const { L, W, T } = d;
  if (T <= 60 && W >= 3 * T && L >= 60) return 'panel';
  if (L >= 6 * W && W <= 120) return 'profile';
  if (L < 150) return 'hardware';
  return 'panel';
}

/* ---------- ranglar ---------- */
const HINTS: [RegExp, string][] = [
  [/зеркал|mirror/i, '#BFD6E2'], [/цинк|zinc/i, '#A7AEB5'], [/хром|chrom/i, '#C9CED3'], [/метал|steel|iron|труба|профил/i, '#9CA3AA'],
  [/пластик|plastic/i, '#ECECEC'], [/хдф|hdf|двп|dvp/i, '#E8E2D6'], [/кашемир|cashmere/i, '#B9AC9C'],
  [/дуб|oak|eman/i, '#C9A46A'], [/орех|walnut/i, '#7A5233'], [/вишн|cherry/i, '#8B3A34'], [/бук|beech/i, '#D9B98A'], [/венге|wenge/i, '#3B2A22'],
  [/бел|white|oq/i, '#EEEBE3'], [/сер|gr[ae]y|kulrang/i, '#9AA7B2'], [/черн|black/i, '#2B2B2B'], [/стекл|glass/i, '#CFE3EA'],
  [/ручк|handle/i, '#2F3237'], [/шуруп|саморез|screw/i, '#8C9299'],
];
const PALETTE = ['#D8B98A', '#9AA7B2', '#B07A52', '#8FB3A1', '#C98F8F', '#8FA6D1', '#D6C36A', '#A9B78A'];

export function colorFor(name: string, idx: number): string {
  for (const [re, c] of HINTS) if (re.test(name || '')) return c;
  return PALETTE[Math.abs(idx) % PALETTE.length];
}

export function rgbHex(a: ArrayLike<number>): string {
  const h = (x: number) => Math.round(Math.max(0, Math.min(1, x)) * 255).toString(16).padStart(2, '0');
  return '#' + h(a[0]) + h(a[1]) + h(a[2]);
}

export function polyArea(lp: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < lp.length; i++) {
    const p = lp[i], q = lp[(i + 1) % lp.length];
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a / 2);
}

export const fmt = (n: number | null | undefined): string => (n == null || !isFinite(n) ? '—' : String(Math.round(n * 10) / 10));
