'use client';
/* Chiqishdan oldin ogohlantirish: saqlanmagan o'zgarishlar va tugallanmagan jarayonlar. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLab, type LabStore } from '@/lib/lab/store';
import { useI18n } from '@/lib/i18n';
import { Modal } from '../ui/Modal';

type Pending = { kind: 'link'; href: string } | { kind: 'back' };

export function LeaveGuard({ store }: { store: LabStore }) {
  const { t } = useI18n();
  const router = useRouter();
  const save = useLab(store, (s) => s.save);
  const glue = useLab(store, (s) => s.glue);
  const tool = useLab(store, (s) => s.tool);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);

  const unsaved = store.canSave && (save === 'dirty' || save === 'saving' || save === 'error');
  const toolOn = !glue && tool !== 'select';
  const gluePending = !!glue && (!!glue.main || glue.attached.length > 0);
  const risky = unsaved || gluePending || toolOn;
  const riskyRef = useRef(risky);
  riskyRef.current = risky;

  // Brauzer yorlig'ini yopish / yangilash.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (!riskyRef.current) return;
      if (store.isDirty && store.canSave) void store.saveNow();
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [store]);

  // Ilova ichidagi havolalar.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!riskyRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ kind: 'link', href: url.pathname + url.search + url.hash });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  // Brauzerning "orqaga" tugmasi.
  useEffect(() => {
    history.pushState({ leaveGuard: true }, '', location.href);
    let armed = true;
    const onPop = () => {
      if (!armed) return;
      if (!riskyRef.current) { armed = false; history.go(-1); return; }
      history.pushState({ leaveGuard: true }, '', location.href);
      setPending({ kind: 'back' });
    };
    window.addEventListener('popstate', onPop);
    return () => { armed = false; window.removeEventListener('popstate', onPop); };
  }, []);

  const go = useCallback((p: Pending) => {
    if (p.kind === 'link') router.push(p.href);
    else history.go(-2);
  }, [router]);

  if (!pending) return null;
  const close = () => { if (!busy) setPending(null); };
  const leave = (p: Pending) => { riskyRef.current = false; setPending(null); go(p); };
  const saveAndLeave = async () => {
    setBusy(true);
    await store.saveNow();
    setBusy(false);
    if (store.get().save === 'error') return;
    leave(pending);
  };

  const issues: string[] = [];
  if (save === 'error') issues.push(t('leave.error'));
  else if (save === 'saving') issues.push(t('leave.saving'));
  else if (unsaved) issues.push(t('leave.unsaved'));
  if (gluePending) issues.push(t('leave.glue'));
  else if (toolOn) issues.push(t('leave.tool'));

  return (
    <Modal title={t('leave.title')} onClose={close} footer={<>
      <button className="btn" onClick={close} disabled={busy}>{t('leave.stay')}</button>
      <button className="btn danger" onClick={() => leave(pending)} disabled={busy}>{t('leave.exit')}</button>
      {store.canSave ? <button className="btn primary" onClick={() => void saveAndLeave()} disabled={busy}>{t('leave.saveExit')}</button> : null}
    </>}>
      <div className="col" style={{ gap: 8 }}>
        <b>{t('leave.q')}</b>
        <ul style={{ margin: 0, paddingLeft: 18 }}>{issues.map((x) => <li key={x}>{x}</li>)}</ul>
      </div>
    </Modal>
  );
}
