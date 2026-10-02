'use client';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { useLab, type LabStore, type SideTab } from '@/lib/lab/store';
import { useI18n } from '@/lib/i18n';
import { useToast } from '../ui/Modal';
import { Icon } from '../ui/Icon';
import { Viewport } from './Viewport';
import { PartsTable } from './PartsTable';
import { PropsPanel } from './PropsPanel';
import { Drawing2D } from './Drawing2D';
import { DataPanel } from './DataPanel';
import { MergePanel } from './MergePanel';
import { GluePanel } from './GluePanel';
import { GroupPanel } from './GroupPanel';
import { LeaveGuard } from './LeaveGuard';
import { ContextMenu, ModeBar, StatusBar, GlueWizard } from './Chrome';

function useShortcuts(store: LabStore) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (document.querySelector('.overlay')) return;
      const s = store.get();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); return; }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); store.redo(); return; }
      if (mod && k === 's') { e.preventDefault(); void store.saveNow(); return; }
      if (mod && k === 'a') { e.preventDefault(); store.selectAll(); return; }
      if (mod || e.altKey) return;
      if (e.key === 'Escape') {
        if (s.ctx) store.closeCtx();
        else if (s.glue && store.glueBack()) { /* tanlov bosqichma-bosqich bekor qilindi */ }
        else if (s.tool !== 'select') store.setTool('select');
        else store.clearSelection();
        return;
      }
      if (e.key === 'Enter' && s.glue) { e.preventDefault(); store.glueConfirm(); return; }
      switch (k) {
        case '1': store.setMode('view'); break;
        case '2': store.setMode('merge'); break;
        case '3': store.setMode('glue'); break;
        case '4': store.setMode('group'); break;
        case 'v': store.setTool('select'); break;
        case 'b': store.setTool('box'); break;
        case 'm': store.setTool(s.tool === 'measure' ? 'select' : 'measure'); break;
        case 'f': store.focusSelected(); break;
        case 'h': if (e.shiftKey) store.showAll(); else store.hide([...s.selected]); break;
        case 'i': if (s.isolate) store.toggle('isolate'); else store.isolateSelection(); break;
        case 'x': store.toggle('xray'); break;
        case 'e': store.toggle('edges'); break;
        case 'g': store.toggle('grid'); break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);
}

const LEFT_MIN = 240;
const LEFT_SNAP = 160;
const LEFT_DEFAULT = 320;
const LEFT_KEY = 'lab.leftW';

export function LabWorkspace({ store, title, subtitle, right, left, standalone, statusExtra }: {
  store: LabStore; title: string; subtitle?: string; right?: ReactNode; left?: ReactNode; standalone?: boolean; statusExtra?: ReactNode;
}) {
  const { t } = useI18n();
  const push = useToast();
  const mode = useLab(store, (s) => s.mode);
  const tab = useLab(store, (s) => s.tab);
  const toast = useLab(store, (s) => s.toast);
  const result = useLab(store, (s) => s.result);
  const [showL, setShowL] = useState(true);
  const [showR, setShowR] = useState(true);
  const [leftW, setLeftW] = useState(LEFT_DEFAULT);
  const bodyRef = useRef<HTMLDivElement>(null);
  useShortcuts(store);

  useEffect(() => {
    try { const v = Number(localStorage.getItem(LEFT_KEY)); if (v >= LEFT_MIN) setLeftW(v); } catch { /* ignore */ }
  }, []);
  // Panel butun ekranning yarmidan oshmaydi.
  const maxLeft = useCallback(() => Math.max(LEFT_MIN, Math.floor((bodyRef.current?.clientWidth ?? window.innerWidth) * 0.5) - 1), []);
  const saveLeft = (w: number) => { try { localStorage.setItem(LEFT_KEY, String(w)); } catch { /* ignore */ } };
  const onResizeDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const left = bodyRef.current!.getBoundingClientRect().left;
    let last = leftW;
    const move = (ev: PointerEvent) => {
      const raw = ev.clientX - left;
      if (raw < LEFT_SNAP) { setShowL(false); return; }
      setShowL(true);
      last = Math.min(maxLeft(), Math.max(LEFT_MIN, raw));
      setLeftW(last);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      if (last >= LEFT_MIN) saveLeft(last);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const onResizeKey = (e: RKeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowLeft' ? -24 : e.key === 'ArrowRight' ? 24 : 0;
    if (!d) return;
    e.preventDefault();
    const w = leftW + d;
    if (w < LEFT_MIN) { setShowL(false); return; }
    const n = Math.min(maxLeft(), w);
    setLeftW(n); saveLeft(n);
  };

  useEffect(() => { if (toast) push(toast.text, toast.kind); }, [toast, push]);
  const tabs: { id: SideTab; label: string; icon: string }[] = [
    { id: 'model', label: mode === 'merge' ? t('tab.merge') : t('tab.props'), icon: mode === 'merge' ? 'merge' : 'sliders' },
    { id: 'drawing', label: t('tab.drawing'), icon: 'drawing' },
    { id: 'data', label: t('tab.data'), icon: 'chart' },
  ];

  let rightBody: ReactNode;
  if (mode === 'glue') rightBody = <GluePanel store={store} />;
  else if (mode === 'group') rightBody = <GroupPanel store={store} />;
  else if (tab === 'drawing') rightBody = <Drawing2D store={store} />;
  else if (tab === 'data') rightBody = <DataPanel store={store} fileName={result?.name || 'model'} />;
  else if (mode === 'merge') rightBody = <><MergePanel store={store} /></>;
  else rightBody = <PropsPanel store={store} />;

  const panelBtns = (
    <div className="row" style={{ gap: 2 }}>
      <button className={'btn sm icon-btn' + (showL ? ' on' : '')} onClick={() => setShowL((v) => !v)} title={t('lab.toggleTable')} aria-label={t('lab.toggleTable')}><Icon name="panelL" size={16} /></button>
      <button className={'btn sm icon-btn' + (showR ? ' on' : '')} onClick={() => setShowR((v) => !v)} title={t('lab.togglePanel')} aria-label={t('lab.togglePanel')}><Icon name="panelR" size={16} /></button>
    </div>
  );

  return (
    <div className={'lab' + (standalone ? ' standalone' : '')}>
      <ModeBar store={store} title={title} subtitle={subtitle} left={left} right={<>{panelBtns}{right}</>} />
      {mode === 'glue' ? <GlueWizard store={store} /> : <div />}
      <div ref={bodyRef} className={'lab-body' + (showL ? '' : ' no-left') + (showR ? '' : ' no-right')} style={{ '--left-w': leftW + 'px' } as CSSProperties}>
        <aside className="side left" aria-label={t('lab.table')}>
          {showL ? <PartsTable store={store} /> : null}
          <div className="side-resize" role="separator" aria-orientation="vertical" aria-label={t('lab.table')} tabIndex={0} onPointerDown={onResizeDown} onKeyDown={onResizeKey} onDoubleClick={() => { setLeftW(LEFT_DEFAULT); saveLeft(LEFT_DEFAULT); }} />
        </aside>
        <Viewport store={store} />
        <aside className="side right" aria-label={t('lab.panel')}>
          {showR ? <>
            {mode !== 'glue' && mode !== 'group' ? (
              <div className="side-tabs" role="tablist">
                {tabs.map((x) => <button key={x.id} role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'on' : ''} onClick={() => store.setTab(x.id)}>{x.label}</button>)}
              </div>
            ) : (
              <div className="side-tabs"><button className="on">{t('mode.' + mode)}</button></div>
            )}
            {rightBody}
          </> : null}
        </aside>
      </div>
      <StatusBar store={store} extra={statusExtra} />
      <ContextMenu store={store} />
      <LeaveGuard store={store} />
    </div>
  );
}
