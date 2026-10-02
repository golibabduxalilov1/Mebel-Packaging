'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useLab, type LabStore } from '@/lib/lab/store';
import type { RowView } from '@/lib/model/labdoc';
import { useI18n } from '@/lib/i18n';
import { Icon } from '../ui/Icon';

type SortKey = 'name' | 'L' | 'W' | 'T' | 'material' | 'qty' | 'partKind' | 'edgeText' | 'group' | 'totalWeight';

export const fmtN = (n: number | null | undefined, d = 1) => (n == null || !isFinite(n) ? null : (Math.round(n * 10 ** d) / 10 ** d).toLocaleString('ru-RU', { maximumFractionDigits: d }));

export function PartsTable({ store }: { store: LabStore }) {
  const { t } = useI18n();
  const views = useLab(store, (s) => s.views);
  const selected = useLab(store, (s) => s.selected);
  const hidden = useLab(store, (s) => s.hidden);
  const mode = useLab(store, (s) => s.mode);
  const glue = useLab(store, (s) => s.glue);
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [mat, setMat] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 } | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [closedMats, setClosedMats] = useState<Set<string>>(new Set());
  const [infoOpen, setInfoOpen] = useState(false);
  const result = useLab(store, (s) => s.result);
  const body = useRef<HTMLDivElement>(null);
  const unknown = t('common.unknown');

  const materials = useMemo(() => [...new Set(views.map((v) => v.material).filter(Boolean))].sort(), [views]);

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase();
    let list = views.filter((v) =>
      (!qq || v.name.toLowerCase().includes(qq) || v.material.toLowerCase().includes(qq) || v.group.toLowerCase().includes(qq)) &&
      (!kind || (kind === 'composite' ? v.kind === 'composite' : v.partKind === kind && v.kind === 'row')) &&
      (!mat || v.material === mat));
    if (sort) {
      const k = sort.k;
      list = list.slice().sort((a, b) => {
        const x = a[k] as unknown, y = b[k] as unknown;
        if (x == null && y == null) return 0;
        if (x == null) return 1;
        if (y == null) return -1;
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * sort.dir;
        return String(x).localeCompare(String(y), 'ru', { numeric: true }) * sort.dir;
      });
    }
    return list;
  }, [views, q, kind, mat, sort]);

  // materiallar bo'yicha guruhlash (tartib: material nomi, guruh ichida joriy saralash saqlanadi)
  const groups = useMemo(() => {
    const m = new Map<string, RowView[]>();
    for (const v of rows) { const key = v.material || ''; const a = m.get(key); if (a) a.push(v); else m.set(key, [v]); }
    return [...m.entries()].sort((a, b) => (a[0] ? (b[0] ? a[0].localeCompare(b[0], 'ru') : -1) : (b[0] ? 1 : 0)));
  }, [rows]);
  const toggleMat = (key: string) => setClosedMats((c) => { const n = new Set(c); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const allClosed = groups.length > 0 && groups.every(([k]) => closedMats.has(k));

  // 3D dan tanlanganda jadvalda ko'rinadigan joyga aylantirish (W2)
  useEffect(() => {
    if (!selected.size || !body.current) return;
    const el = body.current.querySelector('tr.sel');
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const isSel = (v: RowView) => v.members.some((m) => selected.has(m));
  const gRole = (v: RowView) => (glue ? store.glueRole(v.members[0]) : null);
  const allHidden = (v: RowView) => v.members.every((m) => hidden.has(m));
  const click = (v: RowView, ev: React.MouseEvent) => {
    if (glue) {
      // yelimlash: jadvaldan asosiy / yelimlanadigan detalni tanlash
      if (!glue.main && v.kind === 'row' && v.members.length > 1) { setOpen((o) => new Set(o).add(v.id)); store.toast(t('glue.pickMember'), 'info'); return; }
      store.glueAdd(v.members);
      return;
    }
    const add = ev.ctrlKey || ev.metaKey || mode === 'merge';
    store.select(v.members, add ? 'toggle' : 'set', false);
  };
  const th = (k: SortKey, label: string, cls = '') => (
    <th className={'sortable ' + cls} onClick={() => setSort((s) => (s && s.k === k ? (s.dir === 1 ? { k, dir: -1 } : null) : { k, dir: 1 }))}
      aria-sort={sort?.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {label}{sort?.k === k ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
    </th>
  );
  const num = (n: number | null, d = 1) => { const f = fmtN(n, d); return f == null ? <span className="unknown">{unknown}</span> : f; };

  const totalParts = views.reduce((s, v) => s + v.members.length, 0);
  const totalW = views.reduce<number | null>((s, v) => (s == null || v.totalWeight == null ? null : s + v.totalWeight), 0);

  const renderRow = (v: RowView) => {
            const sel = isSel(v);
            const hid = allHidden(v);
            const multi = v.members.length > 1;
            const isOpen = open.has(v.id);
            return (
              <Fragment key={v.id}>
                <tr className={(glue ? (gRole(v) === 'main' ? 'g-main ' : gRole(v) === 'attached' ? 'g-att ' : '') : sel ? 'sel ' : '') + (hid ? 'dimmed' : '')} onClick={(e) => click(v, e)} onDoubleClick={() => store.focusIds(v.members)} style={{ cursor: 'pointer' }}>
                  <td>
                    <button className={'eye' + (hid ? ' off' : '')} onClick={(e) => { e.stopPropagation(); store.toggleHidden(v.members); }} title={hid ? t('table.show') : t('table.hide')} aria-label={hid ? t('table.show') : t('table.hide')}>
                      <Icon name={hid ? 'eyeOff' : 'eye'} size={15} />
                    </button>
                  </td>
                  <td style={{ maxWidth: 220 }}>
                    <div className="part-name">
                      {multi ? (
                        <button className="eye" onClick={(e) => { e.stopPropagation(); setOpen((o) => { const n = new Set(o); if (n.has(v.id)) n.delete(v.id); else n.add(v.id); return n; }); }} aria-label={t('table.expand')}>
                          <Icon name={isOpen ? 'chevronD' : 'chevronR'} size={14} />
                        </button>
                      ) : <span style={{ width: 18 }} />}
                      <span className="swatch" style={{ background: v.color }} />
                      <span title={v.name}>{v.name || <i className="faint">{t('common.noName')}</i>}</span>
                      {v.kind === 'composite' ? <span className="badge accent" title={t('kind.composite')}><Icon name="link" size={11} /></span> : null}
                      {v.edited ? <span className="badge accent" title={t('table.edited')}>✎</span> : null}
                      {v.manual && v.members.length > 1 ? <span className="badge info" title={t('table.manualMerge')}>M</span> : null}
                    </div>
                  </td>
                  <td className="num">{num(v.L)}</td>
                  <td className="num">{num(v.W)}</td>
                  <td className="num">{num(v.T)}</td>
                  <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.material}>{v.material || <span className="unknown">{unknown}</span>}</td>
                  <td className="num"><b>{v.qty}</b></td>
                  <td className="nowrap">{v.kind === 'composite' ? t('kind.composite') : t('kind.' + v.partKind)}</td>
                  <td className="small" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.edgeText}>{v.edgeText || <span className="unknown">{unknown}</span>}</td>
                  <td className="small nowrap">{v.group || '—'}</td>
                  <td className="num">{num(v.totalWeight, 2)}</td>
                </tr>
                {isOpen ? v.members.map((m) => {
                  const p = store.part(m);
                  if (!p) return null;
                  const s2 = selected.has(m);
                  return (
                    <tr key={m} className={glue ? (store.glueRole(m) === 'main' ? 'g-main' : store.glueRole(m) === 'attached' ? 'g-att' : '') : s2 ? 'sel' : ''} onClick={(e) => { e.stopPropagation(); if (glue) store.glueAdd([m]); else store.select([m], e.ctrlKey || e.metaKey ? 'toggle' : 'set', false); }} style={{ cursor: 'pointer' }}>
                      <td />
                      <td colSpan={10} className="small muted" style={{ paddingLeft: 44 }}>
                        {p.id} · {p.name} · {fmtN(p.dims.L) ?? '?'}×{fmtN(p.dims.W) ?? '?'}×{fmtN(p.dims.T) ?? '?'}
                      </td>
                    </tr>
                  );
                }) : null}
              </Fragment>
            );
  };

  return (
    <div className="col" style={{ height: '100%', gap: 0, minHeight: 0 }}>
      <div className="side-sec col" style={{ gap: 8 }}>
        <div className="row">
          <div style={{ position: 'relative', flex: 1 }}>
            <span style={{ position: 'absolute', left: 9, top: 7, color: 'var(--faint)' }}><Icon name="search" size={16} /></span>
            <input className="input sm" style={{ paddingLeft: 30 }} placeholder={t('table.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('table.search')} />
          </div>
        </div>
        <div className="row">
          <select className="select sm" value={kind} onChange={(e) => setKind(e.target.value)} aria-label={t('table.type')}>
            <option value="">{t('table.allTypes')}</option>
            {['panel', 'profile', 'hardware', 'ignore'].map((k) => <option key={k} value={k}>{t('kind.' + k)}</option>)}
            <option value="composite">{t('kind.composite')}</option>
          </select>
          <select className="select sm" value={mat} onChange={(e) => setMat(e.target.value)} aria-label={t('table.material')}>
            <option value="">{t('table.allMaterials')}</option>
            {materials.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="btn sm" onClick={() => setClosedMats(allClosed ? new Set() : new Set(groups.map(([k]) => k)))} title={allClosed ? t('table.expandAll') : t('table.collapseAll')} aria-label={allClosed ? t('table.expandAll') : t('table.collapseAll')}>
            <Icon name={allClosed ? 'chevronR' : 'chevronD'} size={14} />
          </button>
        </div>
      </div>
      <div className="tbl-wrap side-scroll" ref={body}>
        <table className="tbl compact">
          <thead>
            <tr>
              <th style={{ width: 26 }} aria-label={t('table.visible')} />
              {th('name', t('table.name'))}
              {th('L', 'L', 'num')}
              {th('W', 'W', 'num')}
              {th('T', 'T', 'num')}
              {th('material', t('table.material'))}
              {th('qty', t('table.qty'), 'num')}
              {th('partKind', t('table.type'))}
              {th('edgeText', t('table.kromka'))}
              {th('group', t('table.group'))}
              {th('totalWeight', t('table.weight'), 'num')}
            </tr>
          </thead>
          <tbody>
            {groups.map(([gkey, grows]) => {
              const closed = closedMats.has(gkey);
              return (
                <Fragment key={'g:' + gkey}>
                  <tr className="grp-row" onClick={() => toggleMat(gkey)} style={{ cursor: 'pointer' }} aria-expanded={!closed}>
                    <td colSpan={11} style={{ fontWeight: 600, background: 'var(--surface-container, #eef3fb)' }}>
                      <span className="row" style={{ gap: 6 }}>
                        <Icon name={closed ? 'chevronR' : 'chevronD'} size={14} />
                        <span>{gkey || unknown}</span>
                        <span className="badge">{grows.length}</span>
                      </span>
                    </td>
                  </tr>
                  {closed ? null : grows.map(renderRow)}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {!rows.length ? <div className="empty">{views.length ? t('table.noMatch') : t('table.empty')}</div> : null}
      </div>
      {result ? (
        <div className="side-sec small col" style={{ borderTop: '1px solid var(--line)', borderBottom: 0, gap: 6 }}>
          <button className="row" style={{ gap: 6, background: 'none', border: 0, padding: 0, cursor: 'pointer', fontWeight: 600, color: 'inherit' }} onClick={() => setInfoOpen((o) => !o)} aria-expanded={infoOpen}>
            <Icon name={infoOpen ? 'chevronD' : 'chevronR'} size={14} />
            <span>{t('table.fileInfo')} · {result.format.toUpperCase()}</span>
          </button>
          {infoOpen ? (
            <div className="col" style={{ gap: 6, maxHeight: 220, overflow: 'auto' }}>
              <table className="tbl compact" style={{ fontSize: 12.5 }}>
                <tbody>
                  <tr><td className="muted">{t('data.file')}</td><td style={{ wordBreak: 'break-all' }}>{result.name}</td></tr>
                  <tr><td className="muted">{t('data.format')}</td><td>{result.format.toUpperCase()}</td></tr>
                  <tr><td className="muted">{t('data.gabarit')}</td><td className="mono">{result.gabarit ? `${fmtN(result.gabarit[0])} × ${fmtN(result.gabarit[1])} × ${fmtN(result.gabarit[2])}` : unknown}</td></tr>
                  {Object.entries(result.stats).map(([k, v]) => <tr key={k}><td className="muted">{t('stat.' + k)}</td><td className="mono">{String(v)}</td></tr>)}
                </tbody>
              </table>
              {result.notes.map((n, i) => <div key={i} className="muted">{n}</div>)}
              {result.warnings.map((n, i) => <div key={i} className="alert warn"><Icon name="warn" size={15} />{n}</div>)}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="side-sec small muted row between" style={{ borderTop: '1px solid var(--line)', borderBottom: 0 }}>
        <span>{t('table.footer', { rows: rows.length, parts: totalParts })}</span>
        <span>{t('table.totalWeight')}: <b className="mono">{totalW == null ? unknown : fmtN(totalW, 2) + ' kg'}</b></span>
      </div>
    </div>
  );
}
