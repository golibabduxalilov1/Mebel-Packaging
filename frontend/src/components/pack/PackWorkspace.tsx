'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, download, openPdf, ApiError, type Order } from '@/lib/api';
import { PackEngine } from '@/lib/pack/PackEngine';
import type { GroupSetting, PackBox, PackGroup, PackResult, PackSettings } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import { Modal, useToast } from '../ui/Modal';
import { fmtN } from '../lab/PartsTable';
import { GroupsModal } from './GroupsModal';
import { OperatorLeft, OperatorRight, poseText, doneCount } from './OperatorView';

function Num({ label, value, onChange, disabled, suffix, min = 0 }: { label: string; value: number; onChange(v: number): void; disabled?: boolean; suffix?: string; min?: number }) {
  return (
    <label className="field"><span>{label}{suffix ? <span className="faint"> ({suffix})</span> : null}</span>
      <input className="input sm num" type="number" min={min} step="any" value={Number.isFinite(value) ? value : ''} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function SettingsForm({ s, set, disabled, groups = [] }: { s: PackSettings; set(p: Partial<PackSettings>): void; disabled?: boolean; groups?: PackGroup[] }) {
  const { t } = useI18n();
  return (
    <div className="col" style={{ gap: 10 }}>
      <Num label={t('pack.maxWeight')} suffix="kg" value={s.maxWeight} onChange={(v) => set({ maxWeight: v })} disabled={disabled} />
      <div className="field"><span>{t('pack.sizeMode')}</span>
        <div className="modes" role="radiogroup">
          {(['auto', 'manual'] as const).map((m) => <button key={m} role="radio" aria-checked={s.sizeMode === m} className={s.sizeMode === m ? 'on' : ''} disabled={disabled} onClick={() => set({ sizeMode: m })}>{t('pack.size.' + m)}</button>)}
        </div>
      </div>
      {s.sizeMode === 'auto' ? (
        <>
          <div className="small muted">{t('pack.autoNote')}</div>
          <div className="grid3">
            <Num label={t('pack.maxL')} value={s.maxL} onChange={(v) => set({ maxL: v })} disabled={disabled} />
            <Num label={t('pack.maxW')} value={s.maxW} onChange={(v) => set({ maxW: v })} disabled={disabled} />
            <Num label={t('pack.maxH')} value={s.maxH} onChange={(v) => set({ maxH: v })} disabled={disabled} />
          </div>
        </>
      ) : (
        <div className="grid3">
          <Num label={t('pack.boxL')} value={s.boxL} onChange={(v) => set({ boxL: v })} disabled={disabled} />
          <Num label={t('pack.boxW')} value={s.boxW} onChange={(v) => set({ boxW: v })} disabled={disabled} />
          <Num label={t('pack.boxH')} value={s.boxH} onChange={(v) => set({ boxH: v })} disabled={disabled} />
        </div>
      )}
      <div className="grid2">
        <Num label={t('pack.padding')} suffix="mm" value={s.padding} onChange={(v) => set({ padding: v })} disabled={disabled} />
        <Num label={t('pack.wall')} suffix="mm" value={s.wall} onChange={(v) => set({ wall: v })} disabled={disabled} />
      </div>
      <label className="check"><input type="checkbox" checked={s.includeHardware} disabled={disabled} onChange={(e) => set({ includeHardware: e.target.checked })} />{t('pack.includeHw')}</label>
      {groups.length ? <GroupSettings s={s} set={set} disabled={disabled} groups={groups} /> : null}
    </div>
  );
}

/** Alohida upokovka guruhlari uchun karton sozlamalari: bo'sh maydon umumiy sozlamadan olinadi. */
function GroupSettings({ s, set, disabled, groups }: { s: PackSettings; set(p: Partial<PackSettings>): void; disabled?: boolean; groups: PackGroup[] }) {
  const { t } = useI18n();
  const patch = (id: string, k: keyof GroupSetting, raw: string) => {
    const cur: GroupSetting = { ...(s.groups?.[id] || {}) };
    const v = Number(raw);
    if (raw.trim() === '' || !isFinite(v) || v < 0 || (k !== 'padding' && v === 0)) delete cur[k]; else cur[k] = v;
    const next = { ...(s.groups || {}) };
    if (Object.keys(cur).length) next[id] = cur; else delete next[id];
    set({ groups: next });
  };
  const manual = s.sizeMode === 'manual';
  const global: Record<keyof GroupSetting, number> = { maxWeight: s.maxWeight, maxL: manual ? s.boxL : s.maxL, maxW: manual ? s.boxW : s.maxW, maxH: manual ? s.boxH : s.maxH, padding: s.padding };
  const fields: { k: keyof GroupSetting; label: string }[] = [
    { k: 'maxWeight', label: t('pack.maxWeight') + ' (kg)' }, { k: 'maxL', label: manual ? t('pack.boxL') : t('pack.maxL') }, { k: 'maxW', label: manual ? t('pack.boxW') : t('pack.maxW') },
    { k: 'maxH', label: manual ? t('pack.boxH') : t('pack.maxH') }, { k: 'padding', label: t('pack.padding') + ' (mm)' },
  ];
  return (
    <div className="col" style={{ gap: 8 }}>
      <div className="label">{t('pack.groupSettings')}</div>
      <div className="small muted">{t('pack.groupSettingsNote')}</div>
      {groups.map((g) => (
        <details key={g.id} className="card card-pad" style={{ padding: 8 }} open={!!s.groups?.[g.id]}>
          <summary style={{ cursor: 'pointer' }}><span className="swatch" style={{ background: g.color, marginRight: 6 }} />{g.name}{s.groups?.[g.id] ? <span className="badge accent" style={{ marginLeft: 6 }}>{t('pack.custom')}</span> : null}</summary>
          <div className="grid2" style={{ marginTop: 8 }}>
            {fields.map((f) => (
              <label key={f.k} className="field"><span>{f.label}</span>
                <input className="input sm num" type="number" min={0} step="any" disabled={disabled} placeholder={String(global[f.k])} value={s.groups?.[g.id]?.[f.k] ?? ''} onChange={(e) => patch(g.id, f.k, e.target.value)} />
              </label>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function fillCls(f: number, w: number, max: number) {
  if (max > 0 && w > max + 1e-6) return 'err';
  return f < 0.35 ? 'warn' : '';
}

export function PackWorkspace({ order }: { order: Order }) {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const push = useToast();
  const host = useRef<HTMLDivElement>(null);
  const engine = useRef<PackEngine | null>(null);
  const [settings, setSettings] = useState<PackSettings | null>(null);
  const [result, setResult] = useState<PackResult | null>(null);
  const [itemsCount, setItemsCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [boxNo, setBoxNo] = useState<number | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [lid, setLid] = useState(false);
  const [top, setTop] = useState(false);
  const [layer, setLayer] = useState<number | null>(null);
  const [explode, setExplode] = useState(0);
  const [dirtySettings, setDirtySettings] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [groups, setGroups] = useState<PackGroup[]>([]);
  const canRun = can('P5'), canSettings = can('P6'), canEdit = can('P7'), canExport = can('P8'), canMark = can('P11') || can('P7');
  const pureOperator = !canRun && !canSettings && !canEdit;
  const [operator, setOperator] = useState<boolean>(false);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    let v = pureOperator;
    try { const x = localStorage.getItem('pack.operator'); if (x != null && !pureOperator) v = x === '1'; } catch { /* ignore */ }
    setOperator(v);
  }, [pureOperator]);
  const toggleOperator = (v: boolean) => { setOperator(v); try { localStorage.setItem('pack.operator', v ? '1' : '0'); } catch { /* ignore */ } };
  const loadGroups = useCallback(() => { api.lab(order.id).then((l) => setGroups(l.doc?.packGroups || [])).catch(() => undefined); }, [order.id]);
  useEffect(() => { loadGroups(); }, [loadGroups]);

  const load = useCallback(async () => {
    const r = await api.pack(order.id);
    setSettings(r.settings);
    setResult(r.result);
    setItemsCount(r.itemsCount);
  }, [order.id]);

  useEffect(() => { load().catch((e) => push(e instanceof Error ? e.message : String(e), 'error')); }, [load, push]);

  const doMove = useCallback(async (uid: string, to: number) => {
    if (!canEdit) { push(t('perm.need', { p: 'P7' }), 'warn'); return; }
    try {
      const r = await api.moveItem(order.id, { itemUid: uid, toBox: to });
      setResult(r);
      push(t('pack.moved', { n: to }), 'ok');
    } catch (e) {
      push(e instanceof ApiError && e.code === 'over_limit' ? t('pack.overLimit') : e instanceof ApiError && e.code === 'no_fit' ? t('pack.noFit') : e instanceof ApiError && e.code === 'group_mix' ? t('pack.groupMix') : e instanceof ApiError && e.code === 'composite_split' ? t('pack.compositeSplit') : e instanceof Error ? e.message : String(e), 'error');
    }
  }, [order.id, canEdit, push, t]);

  const moveRef = useRef(doMove);
  moveRef.current = doMove;

  useEffect(() => {
    if (!host.current) return;
    const e = new PackEngine(host.current, {
      onSelect: (uid) => setSel(uid),
      onMoveRequest: (uid, to) => { void moveRef.current(uid, to); },
      onBoxClick: (no) => setBoxNo(no),
    });
    engine.current = e;
    return () => { e.dispose(); engine.current = null; };
  }, []);

  const boxes = useMemo(() => result?.boxes || [], [result]);
  useEffect(() => {
    const e = engine.current;
    if (!e) return;
    e.setBoxes(boxes, false);
  }, [boxes]);
  useEffect(() => {
    engine.current?.setLabelText((b) => `<b>№${b.no}</b>${b.groupName ? ' · ' + b.groupName : ''} · ${fmtN(b.weight, 1)} kg · ${Math.round(b.l)}×${Math.round(b.w)}×${Math.round(b.h)}`);
  }, [boxes, lang]);
  const opBox = operator ? boxes.find((b) => b.no === boxNo) || boxes.find((b) => !b.ready) || boxes[0] || null : null;
  // operator ko'rinishida bitta karton ochiq, joriy qadamgacha bo'lgan detallar ko'rinadi
  useEffect(() => {
    if (!operator || !opBox) return;
    if (boxNo !== opBox.no) setBoxNo(opBox.no);
    if (!sel || !opBox.items.some((i) => i.uid === sel)) setSel((opBox.items.find((i) => !i.done) || opBox.items[0] || { uid: null }).uid);
  }, [operator, opBox, boxNo, sel]);
  const opCur = operator && opBox && sel ? opBox.items.find((i) => i.uid === sel) : null;
  const doneSet = useMemo(() => new Set(boxes.flatMap((b) => b.items.filter((i) => i.done).map((i) => i.uid))), [boxes]);
  useEffect(() => {
    engine.current?.setView({ boxNo, lid, top, layer, explode, selected: sel, stepMax: opCur && !showAll ? opCur.step : null, done: doneSet });
  }, [boxNo, lid, top, layer, explode, sel, boxes, opCur, showAll, doneSet]);
  useEffect(() => { if (boxNo != null && !boxes.some((b) => b.no === boxNo)) setBoxNo(null); }, [boxes, boxNo]);

  const run = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      if (dirtySettings && canSettings) { await api.savePackSettings(order.id, settings); setDirtySettings(false); }
      const r = await api.runPack(order.id);
      setResult(r);
      setBoxNo(null); setSel(null); setLayer(null);
      push(t('pack.done', { n: r.boxes.length }), r.warnings.length || r.unplaced.length ? 'warn' : 'ok');
    } catch (e) {
      push(e instanceof Error ? e.message : String(e), 'error');
    } finally { setBusy(false); }
  };

  const setLimit = async (no: number, v: number | null) => {
    try { setResult(await api.setBoxLimit(order.id, no, v)); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); }
  };

  const cur = boxNo != null ? boxes.find((b) => b.no === boxNo) || null : null;
  const maxLayer = cur ? Math.max(0, ...cur.items.map((i) => i.layer)) : Math.max(0, ...boxes.flatMap((b) => b.items.map((i) => i.layer)));
  const selItem = sel ? boxes.flatMap((b) => b.items.map((i) => ({ ...i, box: b.no }))).find((i) => i.uid === sel) : null;
  const totalW = boxes.reduce((s, b) => s + b.weight, 0);
  const avgFill = boxes.length ? boxes.reduce((s, b) => s + b.fill, 0) / boxes.length : 0;

  return (
    <div className="pack">
      <div className="pack-bar">
        {pureOperator ? <Link href="/orders" className="btn sm"><Icon name="chevronL" size={15} />{t('nav.orders')}</Link> : <Link href={`/lab?id=${order.id}`} className="btn sm"><Icon name="chevronL" size={15} />{t('pack.toLab')}</Link>}
        <div className="title" style={{ display: 'flex', flexDirection: 'column' }}>
          <b>{order.number} · {order.name}</b>
          <span className="small muted">{t('pack.env')} · {t('pack.itemsCount', { n: itemsCount })}</span>
        </div>
        <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
          {!pureOperator ? <button className={'btn sm' + (operator ? ' on' : '')} aria-pressed={operator} onClick={() => toggleOperator(!operator)} title={t('op.toggleHint')}><Icon name="hand" size={15} />{t('op.view')}</button> : null}
          {operator || !can('P2') ? null : <button className="btn sm" onClick={() => setGroupsOpen(true)}><Icon name="box" size={15} />{t('mode.group')}</button>}
          {operator ? null : <button className="btn sm" disabled={!result || !canExport} onClick={() => setExportOpen(true)} title={!canExport ? t('perm.need', { p: 'P8' }) : ''}><Icon name="print" size={15} />{t('pack.export')}</button>}
          {operator ? null : <button className="btn sm accent" disabled={!canRun || busy || !settings} onClick={run} title={!canRun ? t('perm.need', { p: 'P5' }) : ''}>
            <Icon name="play" size={15} />{busy ? t('pack.running') : result ? t('pack.rerun') : t('pack.run')}
          </button>}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0 }}>
        {result?.stale ? <div className="stale"><Icon name="warn" size={16} />{t('pack.stale')}<button className="btn xs" disabled={!canRun || busy} onClick={run}>{t('pack.rerun')}</button></div> : <div />}
        <div className={'pack-body' + (operator ? ' operator' : '')}>
          {operator ? <OperatorLeft boxes={boxes} box={opBox} onBox={(no) => { setBoxNo(no); setSel(null); }} sel={sel} onSel={setSel} /> : null}
          {operator ? null : <aside className="side left">
            <div className="side-scroll">
              <div className="side-sec">
                <h4>{t('pack.settings')}</h4>
                {settings ? <SettingsForm s={settings} groups={groups} disabled={!canSettings} set={(p) => { setSettings({ ...settings, ...p }); setDirtySettings(true); }} /> : <div className="muted">{t('common.loading')}</div>}
                {dirtySettings ? <div className="small" style={{ color: 'var(--accent-600)', marginTop: 10 }}>{t('pack.settingsDirty')}</div> : null}
                {!canSettings ? <div className="small muted" style={{ marginTop: 10 }}>{t('perm.need', { p: 'P6' })}</div> : null}
              </div>
              <div className="side-sec small muted">
                <h4>{t('pack.rules')}</h4>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'].map((r) => <li key={r}>{t('pack.rule.' + r)}</li>)}
                </ul>
              </div>
            </div>
          </aside>}
          <div className="pack-vp">
            <div ref={host} style={{ position: 'absolute', inset: 0 }} />
            {!boxes.length ? <div className="vp-empty"><div style={{ textAlign: 'center' }}><Icon name="box" size={40} /><div style={{ marginTop: 8 }}>{t('pack.empty')}</div></div></div> : null}
            <div className="vp-tools">
              <div className="grp">
                {operator ? null : <button className={lid ? 'on' : ''} onClick={() => setLid(!lid)} title={t('pack.lid')} aria-pressed={lid}><Icon name="lid" size={17} /></button>}
                <button className={top ? 'on' : ''} onClick={() => setTop(!top)} title={t('pack.top2d')} aria-pressed={top}><Icon name="top" size={17} /></button>
                <button onClick={() => engine.current?.fit()} title={t('vp.focus')}><Icon name="focus" size={17} /></button>
              </div>
            </div>
            {boxes.length ? (
              <div className="vp-explode" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                <label className="row"><Icon name="layers" size={15} /><span style={{ width: 82 }}>{t('pack.layer')}</span>
                  <input type="range" min={0} max={maxLayer + 1} step={1} value={layer == null ? maxLayer + 1 : layer} onChange={(e) => { const v = Number(e.target.value); setLayer(v > maxLayer ? null : v); }} />
                  <span className="mono" style={{ width: 28 }}>{layer == null ? t('pack.all') : layer + 1}</span>
                </label>
                <label className="row"><Icon name="explode" size={15} /><span style={{ width: 82 }}>{t('pack.explodeLayers')}</span>
                  <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} /><span style={{ width: 28 }} />
                </label>
              </div>
            ) : null}
            {boxes.length && !operator ? (
              <div className="box-nav" role="tablist" aria-label={t('pack.boxes')}>
                <button className="btn xs icon-btn" disabled={boxNo == null || boxNo <= 1} onClick={() => setBoxNo(boxNo == null ? 1 : Math.max(1, boxNo - 1))} aria-label={t('common.back')}><Icon name="chevronL" size={14} /></button>
                <button className={'boxbtn' + (boxNo == null ? ' on' : '')} onClick={() => setBoxNo(null)}>{t('pack.allBoxes')}</button>
                {boxes.map((b) => <button key={b.no} role="tab" aria-selected={boxNo === b.no} className={'boxbtn' + (boxNo === b.no ? ' on' : '')} onClick={() => setBoxNo(b.no)}>№{b.no}</button>)}
                <button className="btn xs icon-btn" disabled={boxNo != null && boxNo >= boxes.length} onClick={() => setBoxNo(boxNo == null ? 1 : Math.min(boxes.length, boxNo + 1))} aria-label={t('common.next')}><Icon name="chevronR" size={14} /></button>
              </div>
            ) : null}
            {!operator && boxNo == null && boxes.length > 1 && canEdit ? <div className="vp-hint" style={{ background: 'rgba(16,29,38,.78)' }}>{t('pack.dragHint')}</div> : null}
          </div>
          {operator && result ? <OperatorRight order={order} box={opBox} sel={sel} onSel={setSel} onResult={setResult} canMark={canMark} canPrint={canExport} showAll={showAll} onShowAll={setShowAll} /> : null}
          {operator ? null : <aside className="side right">
            <div className="side-scroll">
              {result ? (
                <div className="side-sec">
                  <div className="grid3">
                    <div className="field"><span>{t('pack.boxes')}</span><b style={{ fontSize: 20 }}>{boxes.length}</b></div>
                    <div className="field"><span>{t('pack.totalWeight')}</span><b className="mono" style={{ fontSize: 15 }}>{fmtN(totalW, 1)} kg</b></div>
                    <div className="field"><span>{t('pack.avgFill')}</span><b className="mono" style={{ fontSize: 15 }}>{Math.round(avgFill * 100)}%</b></div>
                  </div>
                </div>
              ) : null}
              {result && result.summary.length ? (
                <div className="side-sec">
                  <h4>{t('pack.summary')}</h4>
                  <table className="tbl compact" style={{ fontSize: 12.5 }}>
                    <thead><tr><th>{t('pack.outer')}</th><th className="num">{t('pack.count')}</th><th>№</th></tr></thead>
                    <tbody>{result.summary.map((m) => <tr key={`${m.l}x${m.w}x${m.h}`}><td className="mono">{m.l}×{m.w}×{m.h}</td><td className="num"><b>{m.count}</b></td><td className="small muted">{m.nos.join(', ')}</td></tr>)}</tbody>
                  </table>
                </div>
              ) : null}
              {result && (result.warnings.length || result.unplaced.length) ? (
                <div className="side-sec">
                  <h4 style={{ color: 'var(--warning)' }}>{t('pack.warnings', { n: result.warnings.length + result.unplaced.length })}</h4>
                  <div className="col" style={{ gap: 6 }}>
                    {result.unplaced.map((u, i) => <div key={'u' + i} className="alert err small"><Icon name="warn" size={15} /><div><b>{u.name}</b> × {u.qty}<div>{u.reason}</div></div></div>)}
                    {result.warnings.map((w, i) => <div key={'w' + i} className="alert warn small"><Icon name="warn" size={15} /><div><b>{w.name}</b>{w.size ? <span className="mono"> · {w.size}</span> : null}<div>{t('warn.' + w.code)}{w.reason ? ': ' + w.reason : ''}</div></div></div>)}
                  </div>
                </div>
              ) : null}
              {selItem ? (
                <div className="side-sec">
                  <h4>{t('pack.selItem')}</h4>
                  <div><b>{selItem.name}</b></div>
                  <div className="small muted mono">{Math.round(selItem.unitL)}×{Math.round(selItem.unitW)}×{Math.round(selItem.unitT)} mm · {fmtN(selItem.weight, 2)} kg · {t('pack.layerN', { n: selItem.layer + 1 })} · {t('op.step')} {selItem.step}</div>
                  <div className="small">{poseText(t, selItem)}{selItem.artPos ? ` · ArtPos ${selItem.artPos}` : ''}{selItem.geom === 'none' ? ` · ${t('warn.bbox_only')}` : ''}</div>
                  {canEdit && boxes.length > 1 ? (
                    <label className="field" style={{ marginTop: 8 }}><span>{t('pack.moveTo')}</span>
                      <select className="select sm" value={selItem.box} onChange={(e) => void doMove(selItem.uid, Number(e.target.value))}>
                        {boxes.map((b) => <option key={b.no} value={b.no}>№{b.no} · {fmtN(b.weight, 1)}/{fmtN(b.maxWeight, 0)} kg</option>)}
                      </select>
                    </label>
                  ) : null}
                </div>
              ) : null}
              <div className="side-sec col" style={{ gap: 8 }}>
                {boxes.map((b) => <BoxCard key={b.no} b={b} on={boxNo === b.no} onClick={() => setBoxNo(boxNo === b.no ? null : b.no)} />)}
              </div>
              {cur ? <BoxContents box={cur} boxes={boxes} canEdit={canEdit} sel={sel} onSel={setSel} onMove={doMove} onLimit={(v) => void setLimit(cur.no, v)} /> : null}
            </div>
          </aside>}
        </div>
      </div>
      {groupsOpen ? <GroupsModal orderId={order.id} onClose={() => setGroupsOpen(false)} onSaved={() => { loadGroups(); load().catch((e) => push(e instanceof Error ? e.message : String(e), 'error')); }} /> : null}
      {exportOpen && result ? <ExportModal order={order} result={result} onClose={() => setExportOpen(false)} /> : null}
    </div>
  );
}

function BoxCard({ b, on, onClick }: { b: PackBox; on: boolean; onClick(): void }) {
  const { t } = useI18n();
  const wPct = b.maxWeight > 0 ? Math.min(1, b.weight / b.maxWeight) : 0;
  const dn = doneCount(b);
  return (
    <div className={'box-card' + (on ? ' on' : '')} onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}>
      <div className="row">
        <span className="no">{b.no}</span>
        <div className="grow">
          <div className="mono small"><span className="muted">{t('pack.inner')}:</span> <b>{Math.round(b.innerL)}×{Math.round(b.innerW)}×{Math.round(b.innerH)}</b></div>
          <div className="mono small"><span className="muted">{t('pack.outer')}:</span> <b>{Math.round(b.l)}×{Math.round(b.w)}×{Math.round(b.h)}</b> mm</div>
          <div className="small muted">{t('pack.itemsN', { n: b.items.length })} · {t('pack.fill')} {Math.round(b.fill * 100)}%{dn ? ` · ✓ ${dn}/${b.items.length}` : ''}{b.ready ? ` · ${t('op.ready')}` : ''}</div>
          {b.groupName ? <span className="badge accent" style={{ marginTop: 4 }}>{b.groupName}</span> : null}
        </div>
        <div className="mono small" style={{ textAlign: 'right' }}><b>{fmtN(b.weight, 1)}</b><span className="muted">/{fmtN(b.maxWeight, 0)} kg</span></div>
      </div>
      <div className={'bar ' + fillCls(b.fill, b.weight, b.maxWeight)} style={{ marginTop: 8 }}><i style={{ width: wPct * 100 + '%' }} /></div>
      {b.issues.map((i) => <div key={i} className="alert err small" style={{ marginTop: 6 }}><Icon name="warn" size={14} />{t('issue.' + i)}</div>)}
    </div>
  );
}

function BoxContents({ box, boxes, canEdit, sel, onSel, onMove, onLimit }: { box: PackBox; boxes: PackBox[]; canEdit: boolean; sel: string | null; onSel(u: string): void; onMove(uid: string, to: number): void; onLimit(v: number | null): void }) {
  const { t } = useI18n();
  const [lim, setLim] = useState(String(box.maxWeight));
  useEffect(() => setLim(String(box.maxWeight)), [box.maxWeight, box.no]);
  return (
    <div className="side-sec">
      <h4>{t('pack.contents', { n: box.no })}</h4>
      {canEdit ? (
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="small muted grow">{t('pack.boxLimit')}</span>
          <input className="input sm num" style={{ width: 80 }} value={lim} onChange={(e) => setLim(e.target.value)}
            onBlur={() => { const n = Number(lim); if (isFinite(n) && n > 0 && n !== box.maxWeight) onLimit(n); }} aria-label={t('pack.boxLimit')} />
          <span className="small">kg</span>
          <button className="btn xs" onClick={() => onLimit(null)} title={t('pack.limitReset')}><Icon name="refresh" size={13} /></button>
        </div>
      ) : null}
      <table className="tbl compact" style={{ fontSize: 12.5 }}>
        <thead><tr><th>{t('table.name')}</th><th className="num">mm</th><th className="num">kg</th>{canEdit ? <th>{t('pack.moveTo')}</th> : null}</tr></thead>
        <tbody>
          {box.items.map((it) => (
            <tr key={it.uid} className={sel === it.uid ? 'sel' : ''} onClick={() => onSel(it.uid)} style={{ cursor: 'pointer' }}>
              <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={it.name}>{it.name}</td>
              <td className="num mono">{Math.round(it.l)}×{Math.round(it.w)}×{Math.round(it.h)}</td>
              <td className="num">{fmtN(it.weight, 2)}</td>
              {canEdit ? (
                <td onClick={(e) => e.stopPropagation()}>
                  <select className="select sm" style={{ width: 64 }} value={box.no} onChange={(e) => onMove(it.uid, Number(e.target.value))} aria-label={t('pack.moveTo')}>
                    {boxes.map((b) => <option key={b.no} value={b.no}>№{b.no}</option>)}
                  </select>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportModal({ order, result, onClose }: { order: Order; result: PackResult; onClose(): void }) {
  const { t, lang } = useI18n();
  const push = useToast();
  const [busy, setBusy] = useState('');
  const [instrNo, setInstrNo] = useState(result.boxes[0]?.no ?? 1);
  const instr = async () => {
    setBusy('instr');
    try { await openPdf(api.instructionUrl(order.id, instrNo, lang)); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); } finally { setBusy(''); }
  };
  const get = async (kind: 'report.xlsx' | 'report.pdf' | 'labels.pdf') => {
    setBusy(kind);
    const names = { 'report.xlsx': t('exp.fileReport') + '.xlsx', 'report.pdf': t('exp.fileReport') + '.pdf', 'labels.pdf': t('exp.fileLabels') + '.pdf' };
    try { await download(api.exportUrl(order.id, kind, lang), `${order.number}_${names[kind]}`); }
    catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); }
    finally { setBusy(''); }
  };
  const b = result.boxes[0];
  return (
    <Modal title={t('exp.title')} onClose={onClose} wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="col" style={{ gap: 10 }}>
          <div className="card card-pad">
            <div className="row"><Icon name="sheet" size={20} /><b>{t('exp.report')}</b></div>
            <p className="small muted">{t('exp.reportNote')}</p>
            <div className="row">
              <button className="btn sm primary" disabled={!!busy} onClick={() => get('report.xlsx')}><Icon name="download" size={15} />Excel</button>
              <button className="btn sm" disabled={!!busy} onClick={() => get('report.pdf')}><Icon name="download" size={15} />PDF</button>
            </div>
          </div>
          <div className="card card-pad">
            <div className="row"><Icon name="tag" size={20} /><b>{t('exp.labels')}</b></div>
            <p className="small muted">{t('exp.labelsNote', { n: result.boxes.length })}</p>
            <button className="btn sm primary" disabled={!!busy} onClick={() => get('labels.pdf')}><Icon name="print" size={15} />{t('exp.labelsPdf')}</button>
          </div>
          <div className="card card-pad">
            <div className="row"><Icon name="file" size={20} /><b>{t('exp.instr')}</b></div>
            <p className="small muted">{t('exp.instrNote')}</p>
            <div className="row">
              <select className="select sm" value={instrNo} onChange={(e) => setInstrNo(Number(e.target.value))} aria-label={t('exp.instr')}>
                {result.boxes.map((x) => <option key={x.no} value={x.no}>№{x.no}{x.groupName ? ' · ' + x.groupName : ''}</option>)}
              </select>
              <button className="btn sm primary" disabled={!!busy} onClick={instr}><Icon name="print" size={15} />{t('exp.instrPdf')}</button>
            </div>
          </div>
          {busy ? <div className="small muted">{t('exp.busy')}</div> : null}
        </div>
        {b ? (
          <div>
            <div className="label" style={{ marginBottom: 6 }}>{t('exp.preview')}</div>
            <div className="label-prev">
              <div className="row between"><b>{order.client || '—'}</b><span className="mono">{order.number}</span></div>
              <div style={{ margin: '10px 0' }}>{order.name}</div>
              <div className="row between" style={{ alignItems: 'flex-end' }}>
                <div className="big">№ {b.no} / {result.boxes.length}</div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono">{Math.round(b.l)}×{Math.round(b.w)}×{Math.round(b.h)} mm</div>
                  <div className="mono small">{t('pack.inner')}: {Math.round(b.innerL)}×{Math.round(b.innerW)}×{Math.round(b.innerH)}</div>
                  {b.groupName ? <div className="small">{b.groupName}</div> : null}
                  <div className="mono"><b>{fmtN(b.weight, 1)} kg</b></div>
                </div>
              </div>
              <hr style={{ border: 0, borderTop: '1px dashed #d9c8ae' }} />
              <div className="small">{b.items.slice(0, 6).map((i) => i.name).join(', ')}{b.items.length > 6 ? ` … (+${b.items.length - 6})` : ''}</div>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
