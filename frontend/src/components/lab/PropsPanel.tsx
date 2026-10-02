'use client';
import { useEffect, useMemo, useState } from 'react';
import { useLab, type LabStore } from '@/lib/lab/store';
import { compositeInfo, eff, materialMap, partWeight } from '@/lib/model/labdoc';
import type { PartEdit, PartKind } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import { fmtN } from './PartsTable';

/** Raqam maydoni: Enter yoki fokus chiqqanda saqlanadi, bo'sh qiymat = asl qiymatga qaytarish. */
function NumField({ label, value, orig, edited, onCommit, disabled, step = 0.1, suffix }: {
  label: string; value: number | null; orig: number | null; edited: boolean; onCommit(v: number | null): void; disabled?: boolean; step?: number; suffix?: string;
}) {
  const [v, setV] = useState(value == null ? '' : String(Math.round(value * 100) / 100));
  useEffect(() => { setV(value == null ? '' : String(Math.round(value * 100) / 100)); }, [value]);
  const commit = () => {
    const s = v.trim().replace(',', '.');
    if (s === '') { if (edited) onCommit(null); return; }
    const n = Number(s);
    if (!isFinite(n) || n < 0) { setV(value == null ? '' : String(value)); return; }
    if (value != null && Math.abs(n - value) < 1e-6) return;
    onCommit(n);
  };
  return (
    <label className="field">
      <span>{label}{suffix ? <span className="faint"> ({suffix})</span> : null}</span>
      <input className={'input sm num' + (edited ? ' edited' : '')} inputMode="decimal" value={v} step={step} disabled={disabled}
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        title={edited && orig != null ? `${orig}` : undefined} placeholder={orig == null ? '?' : String(Math.round(orig * 100) / 100)} />
    </label>
  );
}

export function PropsPanel({ store }: { store: LabStore }) {
  const { t } = useI18n();
  const selected = useLab(store, (s) => s.selected);
  const doc = useLab(store, (s) => s.doc);
  const materials = useLab(store, (s) => s.materials);
  const parts = useLab(store, (s) => s.parts);
  const readOnly = useLab(store, (s) => s.readOnly);
  const mats = useMemo(() => materialMap(materials), [materials]);
  const ids = [...selected];
  const canEdit = store.perms.editParts && !readOnly;
  const unknown = t('common.unknown');

  if (!ids.length) {
    return <div className="empty"><Icon name="cursor" size={26} /><div style={{ marginTop: 8 }}>{t('props.none')}</div><div className="small faint" style={{ marginTop: 6 }}>{t('props.noneHint')}</div></div>;
  }

  // butun kompozit tanlangan bo'lsa kompozit ko'rinishi
  const comp = store.compositeOf(ids[0]);
  const isWholeComp = !!comp && comp.members.length === ids.length && comp.members.every((m) => selected.has(m.partId));
  const byId = new Map(parts.map((p) => [p.id, p]));

  const datalist = <datalist id="mat-list">{materials.map((m) => <option key={m.name} value={m.name} />)}</datalist>;

  if (isWholeComp && comp) {
    const info = compositeInfo(comp, byId, doc, mats);
    return (
      <div className="side-scroll">
        <div className="side-sec">
          <div className="row" style={{ marginBottom: 10 }}><span className="badge accent"><Icon name="link" size={12} />{t('kind.composite')}</span></div>
          <label className="field"><span>{t('props.name')}</span>
            <input className="input sm" defaultValue={comp.name} key={comp.id + comp.name} disabled={!canEdit}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== comp.name) store.renameComposite(comp.id, v); }} />
          </label>
          <div className="grid3" style={{ marginTop: 10 }}>
            {['L', 'W', 'T'].map((k, i) => <div key={k} className="field"><span>{k}</span><b className="mono">{info.dims ? fmtN(info.dims[i]) : unknown}</b></div>)}
          </div>
          <div className="row between" style={{ marginTop: 10 }}><span className="muted">{t('props.weight')}</span><b className="mono">{info.weight == null ? unknown : fmtN(info.weight, 2) + ' kg'}</b></div>
          <div className="small muted" style={{ marginTop: 6 }}>{t('props.compNote')}</div>
        </div>
        <div className="side-sec">
          <h4>{t('props.members', { n: comp.members.length })}</h4>
          <div className="col" style={{ gap: 4 }}>
            {comp.members.map((m) => {
              const p = byId.get(m.partId);
              if (!p) return null;
              return (
                <div key={m.partId} className="row" style={{ fontSize: 13 }}>
                  <span className="swatch" style={{ background: p.color }} />
                  <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eff(p, doc.edits[p.id]).name}</span>
                  {m.partId === comp.mainId ? <span className="badge ok">{t('props.main')}</span> : null}
                  <button className="btn xs" disabled={!canEdit || !store.perms.glue} onClick={() => store.detachPart(m.partId)} title={t('props.detach')}><Icon name="unlink" size={13} /></button>
                </div>
              );
            })}
          </div>
          <button className="btn sm danger block" style={{ marginTop: 12 }} disabled={!canEdit || !store.perms.glue} onClick={() => store.dissolveOf(comp.id)}><Icon name="unlink" size={15} />{t('props.dissolve')}</button>
        </div>
      </div>
    );
  }

  const ps = ids.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);
  const effs = ps.map((p) => eff(p, doc.edits[p.id]));
  const same = <K extends 'name' | 'L' | 'W' | 'T' | 'material' | 'kind' | 'weightManual'>(k: K) => effs.every((e) => e[k] === effs[0][k]) ? effs[0][k] : null;
  const anyEdited = ps.some((p) => doc.edits[p.id]);
  const weights = ps.map((p, i) => partWeight(p, effs[i], mats));
  const totalW = weights.some((w) => w == null) ? null : weights.reduce<number>((s, w) => s + (w || 0), 0);
  const single = ps.length === 1 ? ps[0] : null;
  const e0 = effs[0];
  const edited = (k: keyof PartEdit) => ps.some((p) => doc.edits[p.id] && doc.edits[p.id][k] !== undefined);
  const commit = (patch: PartEdit) => store.editSelected(patch);
  const matKnown = (name: string) => mats.has(name.trim().toLowerCase());

  return (
    <div className="side-scroll">
      {datalist}
      <div className="side-sec">
        <div className="row between" style={{ marginBottom: 10 }}>
          <b>{single ? t('props.part') : t('props.multi', { n: ps.length })}</b>
          {comp ? <span className="badge accent" title={comp.name}><Icon name="link" size={12} />{t('props.inComp')}</span> : null}
        </div>
        <label className="field"><span>{t('props.name')}</span>
          <input className={'input sm' + (edited('name') ? ' edited' : '')} key={'n' + ids.join() + (same('name') ?? '')} defaultValue={(same('name') as string) ?? ''}
            placeholder={same('name') == null ? t('props.various') : ''} disabled={!canEdit}
            onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== same('name')) commit({ name: v }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </label>
        <div className="grid3" style={{ marginTop: 10 }}>
          {(['L', 'W', 'T'] as const).map((k) => (
            <NumField key={k} label={k} suffix="mm" value={same(k) as number | null} orig={single ? single.dims[k] : null} edited={edited(k)} disabled={!canEdit}
              onCommit={(v) => commit({ [k]: v === null ? undefined : v } as PartEdit)} />
          ))}
        </div>
        <div className="grid2" style={{ marginTop: 10 }}>
          <label className="field"><span>{t('props.material')}</span>
            <input className={'input sm' + (edited('material') ? ' edited' : '')} list="mat-list" key={'m' + ids.join() + (same('material') ?? '')} defaultValue={(same('material') as string) ?? ''}
              placeholder={same('material') == null ? t('props.various') : ''} disabled={!canEdit}
              onBlur={(e) => { const v = e.target.value.trim(); if (v !== (same('material') ?? '') && (v || same('material') != null)) commit({ material: v }); }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          </label>
          <label className="field"><span>{t('props.kind')}</span>
            <select className={'select sm' + (edited('kind') ? ' edited' : '')} value={(same('kind') as string) ?? ''} disabled={!canEdit}
              onChange={(e) => e.target.value && commit({ kind: e.target.value as PartKind })}>
              {same('kind') == null ? <option value="">{t('props.various')}</option> : null}
              {['panel', 'profile', 'hardware', 'ignore'].map((k) => <option key={k} value={k}>{t('kind.' + k)}</option>)}
            </select>
          </label>
        </div>
        {e0 && e0.material && !matKnown(e0.material) && same('material') != null ? (
          <div className="alert warn small" style={{ marginTop: 10 }}><Icon name="warn" size={16} />{t('props.matUnknown')}</div>
        ) : null}
        <div className="grid2" style={{ marginTop: 10, alignItems: 'end' }}>
          <NumField label={t('props.weightManual')} suffix="kg" value={same('weightManual') as number | null} orig={null} edited={edited('weight')} disabled={!canEdit} step={0.01}
            onCommit={(v) => commit({ weight: v === null ? undefined : v })} />
          <div className="field"><span>{single ? t('props.weight') : t('props.weightSum')}</span>
            <b className={'mono' + (totalW == null ? ' unknown' : '')} style={{ height: 30, display: 'flex', alignItems: 'center' }}>{totalW == null ? unknown : fmtN(totalW, 3) + ' kg'}</b>
          </div>
        </div>
        <button className="btn sm block" style={{ marginTop: 12 }} disabled={!anyEdited || !canEdit} onClick={() => store.resetSelected()}><Icon name="refresh" size={15} />{t('props.restore')}</button>
      </div>
      {single ? (
        <div className="side-sec">
          <h4>{t('props.source')}</h4>
          <table className="tbl compact" style={{ fontSize: 12.5 }}>
            <tbody>
              <tr><td className="muted">ID</td><td className="mono">{single.id}</td></tr>
              <tr><td className="muted">{t('props.origName')}</td><td>{single.name}</td></tr>
              <tr><td className="muted">{t('props.origDims')}</td><td className="mono">{fmtN(single.dims.L) ?? '?'} × {fmtN(single.dims.W) ?? '?'} × {fmtN(single.dims.T) ?? '?'}</td></tr>
              <tr><td className="muted">{t('props.origMat')}</td><td>{single.material || <span className="unknown">{unknown}</span>}</td></tr>
              <tr><td className="muted">{t('props.geom')}</td><td>{t('geom.' + single.geom)}{single.tris ? ` · ${single.tris} ▲` : ''}</td></tr>
              <tr><td className="muted">{t('props.area')}</td><td className="mono">{single.area == null ? unknown : fmtN(single.area / 1e6, 4) + ' m²'}</td></tr>
              <tr><td className="muted">{t('props.volume')}</td><td className="mono">{single.volume == null ? unknown : fmtN(single.volume / 1e9, 5) + ' m³'}</td></tr>
              <tr><td className="muted">{t('table.kromka')}</td><td>{single.edgeText || <span className="unknown">{unknown}</span>}</td></tr>
              {single.artPos ? <tr><td className="muted">{t('props.artPos')}</td><td>{single.artPos}</td></tr> : null}
              {single.des ? <tr><td className="muted">{t('props.des')}</td><td>{single.des}</td></tr> : null}
              {single.group || single.product ? <tr><td className="muted">{t('table.group')}</td><td>{single.group || single.product}</td></tr> : null}
              {single.cuts && single.cuts.length ? <tr><td className="muted">{t('props.cuts')}</td><td>{single.cuts.length}</td></tr> : null}
              {single.bent ? <tr><td className="muted">{t('props.bent')}</td><td>{t('common.yes')}</td></tr> : null}
              {single.note ? <tr><td className="muted">{t('props.note')}</td><td className="small">{single.note}</td></tr> : null}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
