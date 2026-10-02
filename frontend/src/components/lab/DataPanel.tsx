'use client';
import { useMemo } from 'react';
import { useLab, type LabStore } from '@/lib/lab/store';
import { useI18n } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import { fmtN } from './PartsTable';

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function DataPanel({ store, fileName }: { store: LabStore; fileName: string }) {
  const { t } = useI18n();
  const views = useLab(store, (s) => s.views);
  const result = useLab(store, (s) => s.result);
  const parts = useLab(store, (s) => s.parts);
  const unknown = t('common.unknown');

  const stat = useMemo(() => {
    const byKind: Record<string, number> = {};
    let unknownW = 0, unknownSize = 0, total = 0, totalKnown = true;
    const mat = new Map<string, { n: number; area: number; w: number | null }>();
    for (const v of views) {
      const n = v.members.length;
      const k = v.kind === 'composite' ? 'composite' : v.partKind;
      byKind[k] = (byKind[k] || 0) + n;
      if (v.unitWeight == null) unknownW += v.qty; else total += v.totalWeight || 0;
      if (v.unitWeight == null) totalKnown = false;
      if (v.L == null || v.W == null || v.T == null) unknownSize += v.qty;
      const key = v.material || unknown;
      const m = mat.get(key) || { n: 0, area: 0, w: 0 };
      m.n += v.qty;
      if (v.L != null && v.W != null) m.area += (v.L * v.W * v.qty) / 1e6;
      m.w = m.w == null || v.totalWeight == null ? null : m.w + v.totalWeight;
      mat.set(key, m);
    }
    return { byKind, unknownW, unknownSize, total, totalKnown, mat: [...mat.entries()].sort((a, b) => b[1].n - a[1].n) };
  }, [views, unknown]);

  const exportCsv = () => {
    const head = [t('table.name'), 'L', 'W', 'T', t('table.material'), t('table.qty'), t('table.type'), t('table.kromka'), t('table.group'), t('table.unitWeight'), t('table.weight')];
    const lines = [head.map(csvCell).join(';')];
    for (const v of views) {
      lines.push([v.name, fmtN(v.L), fmtN(v.W), fmtN(v.T), v.material, v.qty, v.kind === 'composite' ? t('kind.composite') : t('kind.' + v.partKind), v.edgeText || unknown, v.group, fmtN(v.unitWeight, 3) ?? unknown, fmtN(v.totalWeight, 3) ?? unknown].map(csvCell).join(';'));
    }
    const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName.replace(/\.[^.]+$/, '') + '_detallar.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  if (!result) return null;
  const g = result.gabarit;
  return (
    <div className="side-scroll">
      <div className="side-sec">
        <h4>{t('data.model')}</h4>
        <table className="tbl compact" style={{ fontSize: 12.5 }}>
          <tbody>
            <tr><td className="muted">{t('data.file')}</td><td style={{ wordBreak: 'break-all' }}>{result.name}</td></tr>
            <tr><td className="muted">{t('data.format')}</td><td>{result.format.toUpperCase()}</td></tr>
            <tr><td className="muted">{t('data.gabarit')}</td><td className="mono">{g ? `${fmtN(g[0])} × ${fmtN(g[1])} × ${fmtN(g[2])}` : unknown}</td></tr>
            <tr><td className="muted">{t('data.parts')}</td><td className="mono">{parts.length}</td></tr>
            <tr><td className="muted">{t('data.rows')}</td><td className="mono">{views.length}</td></tr>
            {Object.entries(stat.byKind).map(([k, n]) => <tr key={k}><td className="muted">· {t('kind.' + k)}</td><td className="mono">{n}</td></tr>)}
            <tr><td className="muted">{t('data.totalWeight')}</td><td className="mono"><b>{fmtN(stat.total, 2)} kg</b>{!stat.totalKnown ? <span className="badge warn" style={{ marginLeft: 6 }}>{t('data.partial')}</span> : null}</td></tr>
            {stat.unknownW ? <tr><td className="muted">{t('data.unknownW')}</td><td className="mono" style={{ color: 'var(--warning)' }}>{stat.unknownW}</td></tr> : null}
            {stat.unknownSize ? <tr><td className="muted">{t('data.unknownSize')}</td><td className="mono" style={{ color: 'var(--warning)' }}>{stat.unknownSize}</td></tr> : null}
          </tbody>
        </table>
      </div>
      <div className="side-sec">
        <h4>{t('data.import')}</h4>
        <table className="tbl compact" style={{ fontSize: 12.5 }}>
          <tbody>
            {Object.entries(result.stats).map(([k, v]) => <tr key={k}><td className="muted">{t('stat.' + k)}</td><td className="mono">{String(v)}</td></tr>)}
          </tbody>
        </table>
        {result.notes.map((n, i) => <div key={i} className="small muted" style={{ marginTop: 6 }}>{n}</div>)}
        {result.warnings.map((n, i) => <div key={i} className="alert warn small" style={{ marginTop: 6 }}><Icon name="warn" size={15} />{n}</div>)}
      </div>
      <div className="side-sec">
        <h4>{t('data.byMaterial')}</h4>
        <table className="tbl compact" style={{ fontSize: 12.5 }}>
          <thead><tr><th>{t('table.material')}</th><th className="num">{t('table.qty')}</th><th className="num">m²</th><th className="num">kg</th></tr></thead>
          <tbody>
            {stat.mat.map(([name, m]) => <tr key={name}><td>{name}</td><td className="num">{m.n}</td><td className="num">{fmtN(m.area, 2)}</td><td className="num">{m.w == null ? <span className="unknown">?</span> : fmtN(m.w, 2)}</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="side-sec">
        <button className="btn sm block" onClick={exportCsv}><Icon name="download" size={15} />{t('data.csv')}</button>
      </div>
    </div>
  );
}
