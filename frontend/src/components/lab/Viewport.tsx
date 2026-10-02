'use client';
import { useEffect, useRef } from 'react';
import { LabEngine } from '@/lib/lab/LabEngine';
import { glueStepOf, useLab, type LabStore } from '@/lib/lab/store';
import { useI18n } from '@/lib/i18n';
import { Icon } from '../ui/Icon';

export function Viewport({ store }: { store: LabStore }) {
  const host = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;
  const ready = useLab(store, (s) => s.ready);
  const tool = useLab(store, (s) => s.tool);
  const glue = useLab(store, (s) => s.glue);
  const isolate = useLab(store, (s) => s.isolate);
  const xray = useLab(store, (s) => s.xray);
  const edges = useLab(store, (s) => s.edges);
  const grid = useLab(store, (s) => s.grid);
  const axes = useLab(store, (s) => s.axes);
  const explode = useLab(store, (s) => s.explode);
  const mode = useLab(store, (s) => s.mode);

  useEffect(() => {
    if (!host.current) return;
    let engine: LabEngine;
    try {
      engine = new LabEngine(host.current, {
        onClick: (hit, ev) => store.onPick(hit, ev),
        onDblClick: (hit) => { if (hit) store.focusIds([hit.partId]); },
        onHover: (hit) => store.setHover(hit ? hit.partId : null),
        onContext: (hit, x, y) => store.onContext(hit, x, y),
        onBoxSelect: (ids, add) => store.onBoxSelect(ids, add),
        onMeasure: (d) => store.onMeasure(d),
        onCameraChange: () => store.saveCamera(),
      });
    } catch (e) {
      store.toast(tRef.current('vp.webglFail') + ': ' + (e instanceof Error ? e.message : String(e)), 'error');
      return;
    }
    store.attach(engine);
    return () => { store.detachEngine(engine); engine.dispose(); };
  }, [store]);

  let hint: { text: string; cls: string } | null = null;
  if (glue) {
    const step = glueStepOf(glue);
    hint = { text: t('glue.hint' + step), cls: step === 1 ? 'main' : 'attached' };
  } else if (tool === 'measure') hint = { text: t('vp.measureHint'), cls: '' };
  else if (tool === 'box') hint = { text: t('vp.boxHint'), cls: '' };

  const tb = (on: boolean, icon: string, title: string, fn: () => void, key?: string) => (
    <button className={on ? 'on' : ''} onClick={fn} title={title + (key ? ` (${key})` : '')} aria-label={title} aria-pressed={on}><Icon name={icon} size={17} /></button>
  );

  return (
    <div className={'viewport' + (mode === 'glue' ? ' glue' : '')}>
      <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      {!ready ? <div className="vp-empty">{t('common.loading')}</div> : null}
      <div className="vp-tools">
        <div className="grp">
          {tb(tool === 'select', 'cursor', t('vp.select'), () => store.setTool('select'), 'V')}
          {tb(tool === 'box', 'boxSel', t('vp.boxSelect'), () => store.setTool('box'), 'B')}
          {tb(tool === 'measure', 'ruler', t('vp.measure'), () => store.setTool(tool === 'measure' ? 'select' : 'measure'), 'M')}
        </div>
        <div className="grp">
          {tb(false, 'focus', t('vp.focus'), () => store.focusSelected(), 'F')}
          {tb(isolate, 'isolate', t('vp.isolate'), () => (isolate ? store.toggle('isolate') : store.isolateSelection()), 'I')}
          {tb(xray, 'xray', t('vp.xray'), () => store.toggle('xray'), 'X')}
          {tb(edges, 'edges', t('vp.edges'), () => store.toggle('edges'), 'E')}
        </div>
        <div className="grp">
          {tb(grid, 'grid', t('vp.grid'), () => store.toggle('grid'), 'G')}
          {tb(axes, 'axes', t('vp.axes'), () => store.toggle('axes'))}
        </div>
      </div>
      <div className="vp-views" role="group" aria-label={t('vp.views')}>
        {(['iso', 'front', 'back', 'side', 'top'] as const).map((v) => (
          <button key={v} onClick={() => store.view(v)} title={t('view.' + v)}>{t('view.' + v + '.s')}</button>
        ))}
      </div>
      {hint ? <div className={'vp-hint ' + hint.cls}>{hint.text}</div> : null}
      <div className="vp-explode">
        <Icon name="explode" size={15} />
        <span>{t('vp.explode')}</span>
        <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => store.setExplode(Number(e.target.value))} aria-label={t('vp.explode')} />
      </div>
    </div>
  );
}
