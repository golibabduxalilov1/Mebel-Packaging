'use client';
import { api, openPdf, type Order } from '@/lib/api';
import type { PackBox, PackItemPlaced, PackResult } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import { useToast } from '../ui/Modal';

type T = (k: string, p?: Record<string, string | number>) => string;

export const doneCount = (b: PackBox) => b.items.filter((i) => i.done).length;

/** Detalni qanday qo'yish: yotqizib / tik / boshqa detal ichiga. */
export function poseText(t: T, it: PackItemPlaced): string {
  const base = it.pose === 'upright' ? t('pose.upright', { h: Math.round(it.h) }) : t('pose.flat');
  return it.host ? `${base} · ${t('pose.inside')}` : base;
}

const byStep = (b: PackBox) => [...b.items].sort((a, c) => a.step - c.step);

export function OperatorLeft({ boxes, box, onBox, sel, onSel }: { boxes: PackBox[]; box: PackBox | null; onBox(no: number): void; sel: string | null; onSel(uid: string): void }) {
  const { t } = useI18n();
  const items = box ? byStep(box) : [];
  const now = items.find((i) => !i.done)?.uid;
  return (
    <aside className="side left op-side">
      <div className="side-scroll">
        <div className="side-sec">
          <h4>{t('op.boxes')}</h4>
          <div className="op-boxes">
            {boxes.map((b) => (
              <button key={b.no} className={'op-box' + (box?.no === b.no ? ' on' : '') + (b.ready ? ' ready' : '')} onClick={() => onBox(b.no)}>
                <b>№{b.no}</b>
                <span>{doneCount(b)}/{b.items.length}{b.ready ? ' ✓' : ''}</span>
                {b.groupName ? <span className="op-grp">{b.groupName}</span> : null}
              </button>
            ))}
          </div>
        </div>
        {box ? (
          <div className="side-sec">
            <h4>{t('op.steps')}</h4>
            <ul className="op-steps">
              {items.map((i) => (
                <li key={i.uid} className={(i.done ? 'done ' : '') + (i.uid === now ? 'now ' : '') + (i.uid === sel ? 'sel' : '')} onClick={() => onSel(i.uid)}>
                  <span className="n">{i.step}</span>
                  <span className="nm" title={i.name}>{i.name}</span>
                  <span className="ck">{i.done ? '✓' : ''}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : <div className="side-sec muted">{t('op.pick')}</div>}
      </div>
    </aside>
  );
}

export function OperatorRight({ order, box, sel, onSel, onResult, canMark, canPrint, showAll, onShowAll }: {
  order: Order; box: PackBox | null; sel: string | null; onSel(uid: string): void; onResult(r: PackResult): void;
  canMark: boolean; canPrint: boolean; showAll: boolean; onShowAll(v: boolean): void;
}) {
  const { t, lang } = useI18n();
  const push = useToast();
  if (!box) return <aside className="side right op-side"><div className="side-scroll"><div className="side-sec muted">{t('op.pick')}</div></div></aside>;
  const items = byStep(box);
  const idx = items.findIndex((i) => i.uid === sel);
  const cur = idx >= 0 ? items[idx] : null;
  const dn = doneCount(box);
  const all = dn === items.length && items.length > 0;
  const fail = (e: unknown) => push(e instanceof Error ? e.message : String(e), 'error');
  const mark = async (it: PackItemPlaced, done: boolean) => {
    try {
      onResult(await api.markItem(order.id, it.uid, done));
      if (done) { const nx = items.slice(idx + 1).find((x) => !x.done) || items.find((x) => !x.done && x.uid !== it.uid); if (nx) onSel(nx.uid); }
    } catch (e) { fail(e); }
  };
  const ready = async (v: boolean) => {
    if (v && !all) { push(t('op.notAllDone'), 'warn'); return; }
    try { onResult(await api.markReady(order.id, box.no, v)); push(t(v ? 'op.readyDone' : 'op.readyUndone'), 'ok'); } catch (e) { fail(e); }
  };
  const print = async () => { try { await openPdf(api.instructionUrl(order.id, box.no, lang)); } catch (e) { fail(e); } };
  const host = cur?.host ? box.items.find((i) => i.uid === cur.host) : null;
  return (
    <aside className="side right op-side">
      <div className="side-scroll">
        <div className="side-sec op-progress">
          <div className="op-big"><b>№{box.no}</b> · {t('op.progress', { done: dn, total: items.length })}</div>
          <div className="bar"><i style={{ width: (items.length ? (dn / items.length) * 100 : 0) + '%' }} /></div>
        </div>
        {cur ? (
          <div className="side-sec op-cur">
            <div className="op-step">{t('op.stepOf', { n: cur.step, total: items.length })}</div>
            <div className="op-name">{cur.name}</div>
            <div className="op-line"><span>{t('op.pose')}</span><b>{poseText(t, cur)}</b></div>
            {host ? <div className="op-line"><span>{t('op.insideOf')}</span><b>{host.name}</b></div> : null}
            <div className="op-line"><span>{t('op.layer')}</span><b>{cur.layer + 1}</b></div>
            <div className="op-line"><span>{t('op.position')}</span><b className="mono">{Math.round(cur.x)}, {Math.round(cur.y)}, {Math.round(cur.z)}</b></div>
            <div className="op-dims">
              <div>{t('op.size')}<b className="mono">{Math.round(cur.unitL)}×{Math.round(cur.unitW)}×{Math.round(cur.unitT)}</b></div>
              <div>kg<b className="mono">{cur.weight.toFixed(2)}</b></div>
            </div>
            {canMark ? (
              <div className="col" style={{ gap: 8, marginTop: 14 }}>
                {cur.done
                  ? <button className="btn op-main" onClick={() => void mark(cur, false)}><Icon name="undo" size={20} />{t('op.undo')}</button>
                  : <button className="btn primary op-main" onClick={() => void mark(cur, true)}><Icon name="check" size={20} />{t('op.placed')}</button>}
              </div>
            ) : null}
            <div className="row" style={{ gap: 8, marginTop: 8 }}>
              <button className="btn op-nav grow" disabled={idx <= 0} onClick={() => onSel(items[idx - 1].uid)}><Icon name="chevronL" size={18} />{t('op.prev')}</button>
              <button className="btn op-nav grow" disabled={idx >= items.length - 1} onClick={() => onSel(items[idx + 1].uid)}>{t('op.next')}<Icon name="chevronR" size={18} /></button>
            </div>
          </div>
        ) : null}
        <div className="side-sec col" style={{ gap: 8 }}>
          <label className="check"><input type="checkbox" checked={showAll} onChange={(e) => onShowAll(e.target.checked)} />{t('op.showAll')}</label>
          {canMark ? (box.ready
            ? <button className="btn op-nav" onClick={() => void ready(false)}>{t('op.unready')}</button>
            : <button className="btn primary op-nav" disabled={!all} title={all ? '' : t('op.notAllDone')} onClick={() => void ready(true)}><Icon name="check" size={18} />{t('op.markReady')}</button>) : null}
          {canPrint ? <button className="btn op-nav" onClick={() => void print()}><Icon name="print" size={18} />{t('op.print')}</button> : null}
        </div>
      </div>
    </aside>
  );
}
