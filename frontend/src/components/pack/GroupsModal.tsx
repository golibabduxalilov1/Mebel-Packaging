'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { LabStore, useLab } from '@/lib/lab/store';
import { runImport } from '@/lib/import/runImport';
import { DEFAULT_IMPORT } from '@/lib/types';
import { Modal } from '../ui/Modal';
import { PartsTable } from '../lab/PartsTable';
import { GroupPanel } from './GroupPanel';

/**
 * "Alohida upokovka": guruhlarni Upokovka muhitida boshqarish. Model brauzerda qayta import qilinadi (3D sahnasiz),
 * guruhlar laboratoriya hujjatiga yoziladi va upokovka elementlari yangilanadi.
 */
export function GroupsModal({ orderId, onClose, onSaved }: { orderId: number; onClose(): void; onSaved(): void }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const store = useMemo(() => new LabStore(), []);
  const [phase, setPhase] = useState<'load' | 'ready' | 'error'>('load');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const tRef = useRef(t);
  tRef.current = t;
  const canRef = useRef(can);
  canRef.current = can;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [lab, materials] = await Promise.all([api.lab(orderId), api.materials()]);
        const main = lab.files.find((f) => f.main);
        if (!main) throw new Error(tRef.current('lab.noFile'));
        const blobs = await Promise.all(lab.files.map(async (f) => new File([await api.fileBlob(orderId, f.id)], f.name)));
        const mainFile = blobs[lab.files.indexOf(main)];
        const r = await runImport(mainFile, lab.order.importOptions || DEFAULT_IMPORT, blobs.filter((b) => b !== mainFile));
        if (cancelled) return;
        if (!r.ok) throw new Error(r.error);
        const editParts = canRef.current('P2');
        store.load(r.result, lab.doc, lab.scene, materials, {
          perms: { editParts, merge: false, glue: false }, readOnly: !editParts,
          // sahna holati (kamera) bu yerda yo'q: laboratoriyadagi saqlangan holat o'zgarmaydi
          saver: async (p) => { await api.saveLab(orderId, { ...p, scene: lab.scene || p.scene }); },
        });
        setPhase('ready');
      } catch (e) {
        if (!cancelled) { setErr(e instanceof Error ? e.message : String(e)); setPhase('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [orderId, store]);

  const dirty = useLab(store, (s) => s.save);
  const finish = async () => {
    const changed = store.isDirty;
    setBusy(true);
    if (changed) await store.saveNow();
    setBusy(false);
    if (store.get().save === 'error') return;
    if (changed) onSaved();
    onClose();
  };

  return (
    <Modal title={t('mode.group')} onClose={() => { if (!busy) void finish(); }} wide
      footer={<button className="btn primary" disabled={busy || phase === 'load'} onClick={() => void finish()}>{dirty === 'dirty' || dirty === 'error' ? t('common.save') : t('common.back')}</button>}>
      {phase === 'load' ? <div className="empty">{t('lab.importing')}</div> : null}
      {phase === 'error' ? <div className="alert err">{err}</div> : null}
      {phase === 'ready' ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 12, height: '60vh' }}>
          <div style={{ minHeight: 0, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 6 }}><PartsTable store={store} /></div>
          <div style={{ minHeight: 0, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 6 }}><GroupPanel store={store} /></div>
        </div>
      ) : null}
    </Modal>
  );
}
