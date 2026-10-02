'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useI18n } from '@/lib/i18n';

export function Modal({ title, onClose, children, footer, wide }: { title: ReactNode; onClose(): void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', k, true);
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button.primary');
    first?.focus();
    return () => window.removeEventListener('keydown', k, true);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" ref={ref}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost sm icon-btn" style={{ marginLeft: 'auto' }} onClick={onClose} aria-label="close"><Icon name="x" /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

/* ---------- toast ---------- */
type ToastKind = 'info' | 'ok' | 'warn' | 'error';
interface ToastItem { id: number; text: string; kind: ToastKind }
const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => undefined);
let seq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = ++seq;
    setItems((x) => [...x.slice(-3), { id, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3200);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={'toast ' + t.kind}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

/* ---------- tasdiqlash ---------- */
export function Confirm({ text, onYes, onNo, danger, yesLabel }: { text: ReactNode; onYes(): void; onNo(): void; danger?: boolean; yesLabel?: string }) {
  const { t } = useI18n();
  return (
    <Modal title={t('confirm.title')} onClose={onNo} footer={<>
      <button className="btn" onClick={onNo}>{t('common.cancel')}</button>
      <button className={'btn ' + (danger ? 'danger' : 'primary')} onClick={onYes}>{yesLabel || t('common.yes')}</button>
    </>}>
      <div>{text}</div>
    </Modal>
  );
}
