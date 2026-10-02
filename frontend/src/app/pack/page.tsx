'use client';
import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Protected } from '@/components/ui/AppShell';
import { Icon } from '@/components/ui/Icon';
import { PackWorkspace } from '@/components/pack/PackWorkspace';
import { api, type Order } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

function PackInner() {
  const { t } = useI18n();
  const sp = useSearchParams();
  const id = Number(sp.get('id'));
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!id) { setErr(t('lab.noId')); return; }
    api.order(id).then(setOrder).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) {
    return (
      <div className="page">
        <div className="alert err"><Icon name="warn" />{err}</div>
        <Link className="btn" style={{ marginTop: 12 }} href="/orders">{t('nav.orders')}</Link>
      </div>
    );
  }
  if (!order) return <div className="empty" style={{ marginTop: 120 }}>{t('common.loading')}</div>;
  return <PackWorkspace order={order} />;
}

export default function PackPage() {
  return <Protected need="P9"><Suspense fallback={null}><PackInner /></Suspense></Protected>;
}
