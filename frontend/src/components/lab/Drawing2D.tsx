'use client';
/* F11: tanlangan detalning 2D chizmasi. Bazis kontur paneli: asl kontur, teshik va o'yiqlar.
 * Mesh detal: OBB o'qlari bo'yicha uchta proyeksiya (asosiy qirralar). */
import { useMemo } from 'react';
import { useLab, type LabStore } from '@/lib/lab/store';
import type { Part, Vec2, Vec3 } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { fmtN } from './PartsTable';

type Seg = [number, number, number, number];
interface View2 { segs: Seg[]; minX: number; minY: number; maxX: number; maxY: number; dashed?: Seg[]; circles?: { c: Vec2; r: number }[]; labelX: string; labelY: string }

const MAX_TRIS = 80000;

function featureEdges(p: Part): { a: Vec3; b: Vec3 }[] | null {
  const pos = p.positions;
  if (!pos || !p.obb) return null;
  const nt = pos.length / 9;
  if (nt > MAX_TRIS) return null;
  const q = (i: number) => `${Math.round(pos[i] * 20)},${Math.round(pos[i + 1] * 20)},${Math.round(pos[i + 2] * 20)}`;
  const map = new Map<string, { a: number; b: number; n: Vec3[] }>();
  for (let t = 0; t < nt; t++) {
    const o = t * 9;
    const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2];
    const vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-9) continue;
    nx /= l; ny /= l; nz /= l;
    const k = [q(o), q(o + 3), q(o + 6)];
    for (let e = 0; e < 3; e++) {
      const i0 = o + e * 3, i1 = o + ((e + 1) % 3) * 3;
      const k0 = k[e], k1 = k[(e + 1) % 3];
      const key = k0 < k1 ? k0 + '|' + k1 : k1 + '|' + k0;
      const rec = map.get(key);
      if (rec) rec.n.push([nx, ny, nz]);
      else map.set(key, { a: i0, b: i1, n: [[nx, ny, nz]] });
    }
  }
  const out: { a: Vec3; b: Vec3 }[] = [];
  map.forEach((r) => {
    let feat = r.n.length === 1;
    if (!feat) for (let i = 1; i < r.n.length && !feat; i++) {
      const d = r.n[0][0] * r.n[i][0] + r.n[0][1] * r.n[i][1] + r.n[0][2] * r.n[i][2];
      if (Math.abs(d) < 0.94) feat = true; // ~20 daraja
    }
    if (feat) out.push({ a: [pos[r.a], pos[r.a + 1], pos[r.a + 2]], b: [pos[r.b], pos[r.b + 1], pos[r.b + 2]] });
  });
  return out;
}

function bounds(segs: Seg[]): [number, number, number, number] {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const s of segs) { a = Math.min(a, s[0], s[2]); b = Math.min(b, s[1], s[3]); c = Math.max(c, s[0], s[2]); d = Math.max(d, s[1], s[3]); }
  return [a, b, c, d];
}

function rectSegs(w: number, h: number): Seg[] { return [[0, 0, w, 0], [w, 0, w, h], [w, h, 0, h], [0, h, 0, 0]]; }

function buildViews(p: Part): View2[] {
  // Bazis konturi
  if (p.geom === 'contour' && p.loops && p.loops.length) {
    const segs: Seg[] = [];
    for (const lp of p.loops) for (let i = 0; i < lp.length; i++) { const a = lp[i], b = lp[(i + 1) % lp.length]; segs.push([a[0], a[1], b[0], b[1]]); }
    const dashed: Seg[] = [];
    for (const c of p.cuts || []) for (let i = 0; i < c.loop.length; i++) { const a = c.loop[i], b = c.loop[(i + 1) % c.loop.length]; dashed.push([a[0], a[1], b[0], b[1]]); }
    const [x0, y0, x1, y1] = bounds(segs);
    const th = p.thick || 0;
    const side: View2 = { segs: rectSegs(x1 - x0, th).map((s) => [s[0] + x0, s[1], s[2] + x0, s[3]] as Seg), minX: x0, minY: 0, maxX: x1, maxY: th, labelX: '', labelY: 'T' };
    return [{ segs, dashed, circles: p.circles, minX: x0, minY: y0, maxX: x1, maxY: y1, labelX: 'X', labelY: 'Y' }, side];
  }
  const o = p.obb;
  if (!o) return [];
  // o'qlarni o'lcham bo'yicha tartiblash: L, W, T
  const idx = [0, 1, 2].sort((i, j) => o.size[j] - o.size[i]);
  const ax = idx.map((i) => o.axes[i]);
  const sz = idx.map((i) => o.size[i]);
  const proj = (v: Vec3) => {
    const d: Vec3 = [v[0] - o.center[0], v[1] - o.center[1], v[2] - o.center[2]];
    return [d[0] * ax[0][0] + d[1] * ax[0][1] + d[2] * ax[0][2] + sz[0] / 2, d[0] * ax[1][0] + d[1] * ax[1][1] + d[2] * ax[1][2] + sz[1] / 2, d[0] * ax[2][0] + d[1] * ax[2][1] + d[2] * ax[2][2] + sz[2] / 2];
  };
  const fe = p.geom === 'mesh' ? featureEdges(p) : null;
  const mk = (i: number, j: number, lx: string, ly: string): View2 => {
    if (!fe) return { segs: rectSegs(sz[i], sz[j]), minX: 0, minY: 0, maxX: sz[i], maxY: sz[j], labelX: lx, labelY: ly };
    const segs: Seg[] = fe.map((e) => { const a = proj(e.a), b = proj(e.b); return [a[i], a[j], b[i], b[j]]; });
    return { segs, minX: 0, minY: 0, maxX: sz[i], maxY: sz[j], labelX: lx, labelY: ly };
  };
  return [mk(0, 1, 'L', 'W'), mk(0, 2, 'L', 'T'), mk(2, 1, 'T', 'W')];
}

function ViewSvg({ v, title }: { v: View2; title: string }) {
  const w = Math.max(v.maxX - v.minX, 1), h = Math.max(v.maxY - v.minY, 1);
  const pad = Math.max(w, h) * 0.12 + 12;
  const vb = `${v.minX - pad} ${-(v.maxY + pad)} ${w + pad * 2} ${h + pad * 2}`;
  const sw = Math.max(w, h) / 320;
  const fs = Math.max(w, h) / 18;
  return (
    <figure style={{ margin: 0 }}>
      <figcaption className="small muted" style={{ marginBottom: 4 }}>{title}</figcaption>
      <div className="drawing">
        <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" style={{ maxHeight: 260 }}>
          <g transform="scale(1,-1)">
            {v.segs.map((s, i) => <line key={i} x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} stroke="#004ac6" strokeWidth={sw} strokeLinecap="round" />)}
            {(v.dashed || []).map((s, i) => <line key={'d' + i} x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} stroke="#b3602a" strokeWidth={sw} strokeDasharray={`${sw * 5} ${sw * 3}`} />)}
            {(v.circles || []).map((c, i) => <circle key={'c' + i} cx={c.c[0]} cy={c.c[1]} r={c.r} fill="none" stroke="#004ac6" strokeWidth={sw} />)}
            <line x1={v.minX} y1={v.minY - pad * 0.45} x2={v.maxX} y2={v.minY - pad * 0.45} stroke="#8597a6" strokeWidth={sw * 0.8} />
            <line x1={v.minX - pad * 0.45} y1={v.minY} x2={v.minX - pad * 0.45} y2={v.maxY} stroke="#8597a6" strokeWidth={sw * 0.8} />
          </g>
          <text x={(v.minX + v.maxX) / 2} y={-(v.minY - pad * 0.45) + fs * 1.1} fontSize={fs} textAnchor="middle" fill="#0b1c30" fontFamily="JetBrains Mono, monospace">{fmtN(w)}</text>
          <text x={v.minX - pad * 0.45 - fs * 0.4} y={-(v.minY + v.maxY) / 2} fontSize={fs} textAnchor="end" dominantBaseline="middle" fill="#0b1c30" fontFamily="JetBrains Mono, monospace">{fmtN(h)}</text>
        </svg>
      </div>
    </figure>
  );
}

export function Drawing2D({ store }: { store: LabStore }) {
  const { t } = useI18n();
  const selected = useLab(store, (s) => s.selected);
  const first = selected.size === 1 ? [...selected][0] : null;
  const part = first ? store.part(first) : undefined;
  const views = useMemo(() => (part ? buildViews(part) : []), [part]);
  if (!part) return <div className="empty">{t('draw.pick')}</div>;
  if (!views.length) return <div className="empty">{t('draw.noGeom')}</div>;
  const titles = part.geom === 'contour' ? [t('draw.contour'), t('draw.edgeView')] : [t('draw.face'), t('draw.top'), t('draw.side')];
  return (
    <div className="side-scroll">
      <div className="side-sec col" style={{ gap: 12 }}>
        <div><b>{part.name}</b><div className="small muted mono">{fmtN(part.dims.L) ?? '?'} × {fmtN(part.dims.W) ?? '?'} × {fmtN(part.dims.T) ?? '?'} mm</div></div>
        {views.map((v, i) => <ViewSvg key={i} v={v} title={titles[i] || ''} />)}
        {part.geom === 'mesh' && part.positions && part.positions.length / 9 > MAX_TRIS ? <div className="small muted">{t('draw.tooBig')}</div> : null}
        {part.cuts && part.cuts.length ? <div className="small muted"><span style={{ color: 'var(--accent)' }}>- - -</span> {t('draw.cutsLegend')}</div> : null}
      </div>
    </div>
  );
}
