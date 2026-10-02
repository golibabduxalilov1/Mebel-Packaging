'use client';
/* Faqat shkafning o'zi: detallar jadvali, tanlash va chiziqlarsiz, yig'ilgan "jonli" ko'rinish. */
import { useEffect, useRef, type ReactNode } from 'react';
import { LabEngine } from '@/lib/lab/LabEngine';
import type { LabStore } from '@/lib/lab/store';
import { useI18n } from '@/lib/i18n';

export function ShowcaseView({ store, title, left, right }: { store: LabStore; title: string; left?: ReactNode; right?: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    if (!host.current) return;
    let engine: LabEngine;
    try { engine = new LabEngine(host.current, {}); } catch { return; }
    store.attach(engine);
    const s = store.get();
    if (s.edges) store.toggle('edges');
    if (s.grid) store.toggle('grid');
    if (s.axes) store.toggle('axes');
    if (s.explode) store.setExplode(0);
    store.view('iso');
    return () => { store.detachEngine(engine); engine.dispose(); };
  }, [store]);

  return (
    <div className="lab standalone" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="row" style={{ gap: 8, padding: '8px 12px', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
        {left}
        <strong style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</strong>
        <div className="vp-views" style={{ position: 'static' }} role="group" aria-label={t('vp.views')}>
          {(['iso', 'front', 'back', 'side', 'top'] as const).map((v) => (
            <button key={v} onClick={() => store.view(v)} title={t('view.' + v)}>{t('view.' + v + '.s')}</button>
          ))}
        </div>
        {right}
      </div>
      <div className="viewport" style={{ flex: 1 }}>
        <div ref={host} style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  );
}
