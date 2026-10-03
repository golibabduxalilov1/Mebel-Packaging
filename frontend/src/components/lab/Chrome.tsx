'use client';
/* Laboratoriya "qobig'i": rejim paneli (W1, W6), kontekst menyu (W5), holat qatori (W7). */
import { useEffect, useRef, type ReactNode } from 'react';
import { glueStepOf, useLab, type LabStore } from '@/lib/lab/store';
import { eff } from '@/lib/model/labdoc';
import type { LabMode } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { Icon } from '../ui/Icon';
import { fmtN } from './PartsTable';

export function ModeBar({ store, title, subtitle, right, left }: { store: LabStore; title: string; subtitle?: string; right?: ReactNode; left?: ReactNode }) {
  const { t } = useI18n();
  const mode = useLab(store, (s) => s.mode);
  const canUndo = useLab(store, (s) => s.canUndo);
  const canRedo = useLab(store, (s) => s.canRedo);
  const save = useLab(store, (s) => s.save);
  const saveError = useLab(store, (s) => s.saveError);
  const modes: { m: LabMode; icon: string; key: string }[] = [
    { m: 'view', icon: 'eye', key: '1' },
    { m: 'merge', icon: 'merge', key: '2' },
    { m: 'glue', icon: 'glue', key: '3' },
  ];
  return (
    <div className="modebar">
      {left}
      <div className="title"><b title={title}>{title}</b>{subtitle ? <span title={subtitle}>{subtitle}</span> : null}</div>
      <span className="save-state" style={{ textTransform: 'uppercase' }}>{t('status.mode')}:</span>
      <div className="modes" role="tablist" aria-label={t('lab.modes')}>
        {modes.map((x) => (
          <button key={x.m} role="tab" aria-selected={mode === x.m} className={mode === x.m ? 'on' : ''} onClick={() => store.setMode(x.m)} title={`${t('mode.' + x.m)} (${x.key})`}>
            <Icon name={x.icon} size={15} />{t('mode.' + x.m)}
          </button>
        ))}
      </div>
      <div className="row" style={{ gap: 4 }}>
        <button className="btn sm icon-btn" disabled={!canUndo} onClick={() => store.undo()} title={t('lab.undo') + ' (Ctrl+Z)'} aria-label={t('lab.undo')}><Icon name="undo" size={16} /></button>
        <button className="btn sm icon-btn" disabled={!canRedo} onClick={() => store.redo()} title={t('lab.redo') + ' (Ctrl+Y)'} aria-label={t('lab.redo')}><Icon name="redo" size={16} /></button>
      </div>
      <span className={'save-state' + (save === 'error' ? ' err' : '')} title={saveError}>
        {save === 'saving' ? t('save.saving') : save === 'saved' ? <><Icon name="check" size={14} />{t('save.saved')}</> : save === 'dirty' ? t('save.dirty') : save === 'error' ? <><Icon name="warn" size={14} />{t('save.error')}</> : null}
      </span>
      {store.canSave ? <button className="btn sm" disabled={save === 'saving' || save === 'saved' || save === 'idle'} onClick={() => void store.saveNow()} title="Ctrl+S"><Icon name="check" size={15} />{t('save.btn')}</button> : null}
      <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>{right}</div>
    </div>
  );
}

/** Yelimlash qadam ko'rsatkichi (W5): 1 asosiy detalni tanla, 2 yelimlanadigan detallarni tanla, 3 "Yelimla". */
export function GlueWizard({ store }: { store: LabStore }) {
  const { t } = useI18n();
  const g = useLab(store, (s) => s.glue);
  const doc = useLab(store, (s) => s.doc);
  if (!g) return <div />;
  const step = glueStepOf(g);
  const name = (id: string) => { const c = doc.composites.find((x) => x.id === id); if (c) return c.name; const p = store.part(id); return p ? eff(p, doc.edits[id]).name : id; };
  const detail: Record<number, string> = {
    1: g.main ? name(g.main) : '',
    2: g.attached.length ? String(g.attached.length) : '',
    3: '',
  };
  return (
    <div className="wizard" role="list" aria-label={t('glue.steps')}>
      <div className="wz-steps">
        {[1, 2, 3].map((n) => (
          <span key={n} style={{ display: 'contents' }}>
            {n > 1 ? <span className="wz-arrow"><Icon name="arrowR" size={14} /></span> : null}
            <div role="listitem" className={'wz-step' + (n < step ? ' done' : n === step ? ' now' : '')} aria-current={n === step ? 'step' : undefined}>
              <span className="n">{n}</span>
              <span>{t('glue.s' + n)}{detail[n] && n < step ? ':' : ''}</span>
              {detail[n] && n < step ? <b>{detail[n]}</b> : null}
              {n < step ? <Icon name="check" size={13} /> : null}
            </div>
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatusBar({ store, extra }: { store: LabStore; extra?: ReactNode }) {
  const { t } = useI18n();
  const parts = useLab(store, (s) => s.parts);
  const hidden = useLab(store, (s) => s.hidden);
  const selected = useLab(store, (s) => s.selected);
  const mode = useLab(store, (s) => s.mode);
  const tool = useLab(store, (s) => s.tool);
  const measure = useLab(store, (s) => s.measure);
  const hover = useLab(store, (s) => s.hover);
  const doc = useLab(store, (s) => s.doc);
  const glue = useLab(store, (s) => s.glue);
  const hp = hover ? store.part(hover) : null;
  return (
    <div className="statusbar" role="status">
      <span>{t('status.mode')}: <b>{t('mode.' + mode)}</b>{glue ? <> · {t('glue.stepN', { n: glueStepOf(glue) })}</> : null}</span>
      <span className="sep" />
      <span>{t('status.parts')}: <b>{parts.length}</b></span>
      <span>{t('status.visible')}: <b>{parts.length - hidden.size}</b></span>
      <span>{t('status.selected')}: <b>{selected.size}</b></span>
      <span>{t('status.composites')}: <b>{doc.composites.length}</b></span>
      <span className="sep" />
      <span>{t('status.tool')}: <b>{t('tool.' + tool)}</b></span>
      {measure != null ? <span>{t('vp.measure')}: <b className="mono">{fmtN(measure)} mm</b></span> : null}
      {hp ? <><span className="sep" /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{eff(hp, doc.edits[hp.id]).name} · <span className="mono">{fmtN(hp.dims.L) ?? '?'}×{fmtN(hp.dims.W) ?? '?'}×{fmtN(hp.dims.T) ?? '?'}</span></span></> : null}
      <span style={{ marginLeft: 'auto' }}>{extra}</span>
    </div>
  );
}

export function ContextMenu({ store }: { store: LabStore }) {
  const { t } = useI18n();
  const ctx = useLab(store, (s) => s.ctx);
  const selected = useLab(store, (s) => s.selected);
  const mode = useLab(store, (s) => s.mode);
  const hidden = useLab(store, (s) => s.hidden);
  const doc = useLab(store, (s) => s.doc);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ctx) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) store.closeCtx(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') store.closeCtx(); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', key); };
  }, [ctx, store]);
  if (!ctx) return null;
  const ids = [...selected];
  const comp = ctx.partId ? store.compositeOf(ctx.partId) : null;
  const x = Math.min(ctx.x, window.innerWidth - 240), y = Math.min(ctx.y, window.innerHeight - 380);
  const item = (icon: string, label: string, fn: () => void, disabled = false, kbd?: string) => (
    <button disabled={disabled} onClick={() => { store.closeCtx(); fn(); }}><Icon name={icon} size={15} />{label}{kbd ? <kbd>{kbd}</kbd> : null}</button>
  );
  return (
    <div className="menu" ref={ref} style={{ left: x, top: y }} role="menu">
      <div className="menu-title">{ids.length ? t('ctx.selected', { n: ids.length }) : t('ctx.scene')}</div>
      {item('focus', t('vp.focus'), () => store.focusSelected(), !ids.length, 'F')}
      {item('eyeOff', t('ctx.hide'), () => store.hide(ids), !ids.length, 'H')}
      {item('isolate', t('vp.isolate'), () => store.isolateSelection(), !ids.length, 'I')}
      {item('eye', t('ctx.showAll'), () => store.showAll(), !hidden.size, 'Shift+H')}
      {item('cursor', t('ctx.selectAll'), () => store.selectAll(), false, 'Ctrl+A')}
      <hr />
      {mode === 'merge' ? <>
        {item('merge', t('merge.merge'), () => store.mergeSelected(), store.selectedRowIds().length < 2)}
        {item('split', t('merge.split'), () => store.splitSelected(), !ids.length)}
      </> : null}
      {item('glue', t('ctx.glueThis'), () => store.startGlue(), !ids.length || !store.perms.glue)}
      {comp && ctx.partId ? item('unlink', t('props.detach'), () => store.detachPart(ctx.partId!), !store.perms.glue) : null}
      {comp ? item('unlink', t('props.dissolve'), () => store.dissolveOf(comp.id), !store.perms.glue) : null}
      <hr />
      {item('refresh', t('props.restore'), () => store.resetSelected(), !ids.length || !store.perms.editParts)}
    </div>
  );
}
