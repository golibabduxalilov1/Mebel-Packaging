'use client';
import Link from 'next/link';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Protected } from '@/components/ui/AppShell';
import { Icon } from '@/components/ui/Icon';
import { LabWorkspace } from '@/components/lab/LabWorkspace';
import { textureMap } from '@/components/lab/ImportPanel';
import { api, type Order } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { LabStore } from '@/lib/lab/store';
import { runImport } from '@/lib/import/runImport';
import { DEFAULT_IMPORT } from '@/lib/types';

function LabInner() {
  const { t } = useI18n();
  const { can } = useAuth();
  const sp = useSearchParams();
  const router = useRouter();
  const id = Number(sp.get('id'));
  const store = useMemo(() => new LabStore(), []);
  const [order, setOrder] = useState<Order | null>(null);
  const [phase, setPhase] = useState<'load' | 'import' | 'ready' | 'error'>('load');
  const [err, setErr] = useState<{ text: string; protected?: boolean } | null>(null);
  const [ms, setMs] = useState(0);
  const tRef = useRef(t);
  tRef.current = t;
  const canRef = useRef(can);
  canRef.current = can;

  useEffect(() => {
    if (!id) { setPhase('error'); setErr({ text: tRef.current('lab.noId') }); return; }
    const t = tRef.current, can = canRef.current;
    let cancelled = false;
    (async () => {
      try {
        const [lab, materials] = await Promise.all([api.lab(id), api.materials()]);
        if (cancelled) return;
        setOrder(lab.order);
        setPhase('import');
        const main = lab.files.find((f) => f.main);
        if (!main) throw new Error(t('lab.noFile'));
        const blobs = await Promise.all(lab.files.map(async (f) => new File([await api.fileBlob(id, f.id)], f.name)));
        const mainFile = blobs[lab.files.indexOf(main)];
        const extras = blobs.filter((b) => b !== mainFile);
        const r = await runImport(mainFile, lab.order.importOptions || DEFAULT_IMPORT, extras);
        if (cancelled) return;
        if (!r.ok) { setErr({ text: r.protected ? t('imp.protectedText', { name: r.modelName || main.name }) : r.error, protected: r.protected }); setPhase('error'); return; }
        setMs(r.ms);
        const perms = { editParts: can('P2'), merge: can('P3'), glue: can('P4') };
        store.load(r.result, lab.doc, lab.scene, materials, {
          perms, readOnly: !perms.editParts && !perms.merge && !perms.glue, textures: textureMap(extras),
          saver: async (p) => { await api.saveLab(id, p); },
        });
        setPhase('ready');
      } catch (e) {
        if (!cancelled) { setErr({ text: e instanceof Error ? e.message : String(e) }); setPhase('error'); }
      }
    })();
    return () => { cancelled = true; };
  }, [id, store]);

  const goPack = async () => {
    await store.saveNow();
    if (store.get().save === 'error') return;
    router.push(`/pack?id=${id}`);
  };

  if (phase === 'error') {
    return (
      <div className="page">
        <div className="card card-pad" style={{ maxWidth: 640 }}>
          <div className="alert err"><Icon name={err?.protected ? 'lock' : 'warn'} size={20} /><div><b>{err?.protected ? t('imp.protected') : t('lab.loadError')}</b><div>{err?.text}</div></div></div>
          <div className="row" style={{ marginTop: 14 }}><Link className="btn" href="/orders"><Icon name="chevronL" size={15} />{t('nav.orders')}</Link></div>
        </div>
      </div>
    );
  }
  if (phase !== 'ready' || !order) {
    return <div className="empty" style={{ marginTop: 120 }}>{phase === 'import' ? t('lab.importing') : t('common.loading')}</div>;
  }
  return (
    <LabWorkspace
      store={store}
      title={`${order.number} · ${order.name}`}
      subtitle={`${order.client ? order.client + ' · ' : ''}${order.fileName}`}
      left={<Link href="/orders" className="btn sm icon-btn" title={t('nav.orders')} aria-label={t('nav.orders')}><Icon name="chevronL" size={16} /></Link>}
      right={<button className="btn sm accent" onClick={goPack}><Icon name="layers" size={15} />{t('lab.toPack')}<Icon name="arrowR" size={15} /></button>}
      statusExtra={<span>{t('lab.importMs', { ms })}</span>}
    />
  );
}

export default function LabPage() {
  return <Protected need="P9"><Suspense fallback={null}><LabInner /></Suspense></Protected>;
}
