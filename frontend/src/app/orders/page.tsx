'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Protected } from '@/components/ui/AppShell';
import { Confirm, Modal, useToast } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { ImportPanel, type ImportDone } from '@/components/lab/ImportPanel';
import { api, type Order } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

const statusCls: Record<string, string> = { new: 'info', lab: 'accent', packed: 'ok', done: 'ok' };

function NewOrder({ onClose, onCreated }: { onClose(): void; onCreated(o: Order): void }) {
  const { t } = useI18n();
  const [client, setClient] = useState('');
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [progress, setProgress] = useState('');

  const done = async (d: ImportDone) => {
    setProgress(t('orders.uploading'));
    const fd = new FormData();
    fd.append('file', d.main);
    d.extras.forEach((f) => fd.append('extra', f));
    fd.append('client', client.trim());
    fd.append('name', name.trim() || d.result.name.replace(/\.[^.]+$/, ''));
    fd.append('note', note.trim());
    fd.append('importOptions', JSON.stringify(d.options));
    fd.append('partsCount', String(d.result.parts.length));
    const g = d.result.gabarit;
    fd.append('gabarit', g ? g.map((v) => Math.round(v)).join('×') : '');
    try {
      const o = await api.createOrder(fd);
      onCreated(o);
    } finally { setProgress(''); }
  };

  return (
    <Modal title={t('orders.new')} onClose={onClose}>
      <div className="col" style={{ gap: 12 }}>
        <div className="grid2">
          <label className="field"><span>{t('orders.client')}</span><input className="input" value={client} onChange={(e) => setClient(e.target.value)} /></label>
          <label className="field"><span>{t('orders.name')}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('orders.namePh')} /></label>
        </div>
        <label className="field"><span>{t('orders.note')}</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <ImportPanel onDone={done} busyLabel={progress || undefined} />
      </div>
    </Modal>
  );
}

function OrdersInner() {
  const { t, lang } = useI18n();
  const { can } = useAuth();
  const opOnly = !can('P1') && !can('P2') && !can('P3') && !can('P4'); // faqat upokovka muhiti (Upokovkachi roli)
  const push = useToast();
  const router = useRouter();
  const [list, setList] = useState<Order[] | null>(null);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [creating, setCreating] = useState(false);
  const [del, setDel] = useState<Order | null>(null);

  const load = useCallback(async () => {
    try { setList(await api.orders({ search: q, status, from, to })); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); setList([]); }
  }, [q, status, from, to, push]);
  useEffect(() => { const h = setTimeout(load, 250); return () => clearTimeout(h); }, [load]);

  const dup = async (o: Order) => {
    try { const n = await api.duplicateOrder(o.id); push(t('orders.duplicated', { n: n.number }), 'ok'); void load(); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const remove = async () => {
    if (!del) return;
    try { await api.deleteOrder(del.id); push(t('orders.deleted'), 'ok'); setDel(null); void load(); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const date = (s: string) => new Date(s).toLocaleString(lang === 'ru' ? 'ru-RU' : 'uz-UZ', { dateStyle: 'short', timeStyle: 'short' });

  const all = list || [];
  const count = (st: string) => all.filter((o) => o.status === st).length;
  const sel = (v: string) => (status === v ? 'on' : '');
  const statuses: [string, string][] = [['', t('orders.allStatus')], ['new', t('status.new')], ['lab', t('status.lab')], ['packed', t('status.packed')], ['done', t('status.done')]];
  const metrics: { label: string; icon: string; value: number; unit: string }[] = [
    { label: t('orders.m.total'), icon: 'box', value: all.length, unit: t('orders.m.unitOrders') },
    { label: t('status.lab'), icon: 'layers', value: count('lab'), unit: t('orders.m.unitOrders') },
    { label: t('status.packed'), icon: 'check', value: count('packed') + count('done'), unit: t('orders.m.unitOrders') },
    { label: t('orders.boxes'), icon: 'table', value: all.reduce((s2, o) => s2 + (o.boxesCount || 0), 0), unit: t('orders.m.unitBoxes') },
  ];
  const dotCls: Record<string, string> = { new: '#2563eb', lab: '#f59e0b', packed: '#059669', done: '#059669' };

  return (
    <div className="page">
      <div className="page-head">
        <div className="grow">
          <h1>{t('orders.title')}</h1>
          <p>{t('orders.sub')}</p>
        </div>
        <div className="row">
          {can('P1') ? <button className="btn primary" onClick={() => setCreating(true)}><Icon name="plus" size={16} />{t('orders.new')}</button> : null}
        </div>
      </div>
      <div className="metrics">
        {metrics.map((m) => (
          <div key={m.label} className="metric">
            <div className="m-top"><span>{m.label}</span><span style={{ color: 'var(--primary)' }}><Icon name={m.icon} size={18} /></span></div>
            <div className="m-val"><b>{list ? m.value : '—'}</b><span>{m.unit}</span></div>
          </div>
        ))}
      </div>
      <div className="filters">
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 512 }}>
          <span style={{ position: 'absolute', left: 10, top: 6, color: 'var(--muted)' }}><Icon name="search" size={17} /></span>
          <input className="input" style={{ paddingLeft: 34 }} placeholder={t('orders.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('orders.search')} />
        </div>
        <div className="row wrap">
          <div className="seg-filter" role="group" aria-label={t('orders.status')}>
            <span>{t('orders.status')}:</span>
            {statuses.map(([v, label]) => <button key={v} className={sel(v)} onClick={() => setStatus(v)}>{label}</button>)}
          </div>
          <input className="input sm" type="date" style={{ width: 140 }} value={from} onChange={(e) => setFrom(e.target.value)} aria-label={t('orders.from')} />
          <input className="input sm" type="date" style={{ width: 140 }} value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('orders.to')} />
          <button className="btn icon-btn" onClick={() => { setQ(''); setStatus(''); setFrom(''); setTo(''); }} title={t('orders.resetFilters')} aria-label={t('orders.resetFilters')}><Icon name="x" size={16} /></button>
        </div>
      </div>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('orders.number')}</th><th>{t('orders.name')}</th><th>{t('orders.file')}</th>
                <th className="num">{t('orders.parts')}</th><th>{t('orders.gabarit')}</th><th>{t('orders.status')}</th>
                <th>{t('orders.updated')}</th><th style={{ textAlign: 'right' }}>{t('orders.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {all.map((o) => (
                <tr key={o.id}>
                  <td className="mono"><Link href={`${opOnly ? '/pack' : '/lab'}?id=${o.id}`}><b>{o.number}</b></Link></td>
                  <td style={{ maxWidth: 280 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</div>
                    <div className="mono faint" style={{ fontSize: 10 }}>{[o.client, o.note].filter(Boolean).join(' | ') || '—'}</div>
                  </td>
                  <td><span className="file-chip"><Icon name="file" size={12} />{o.fileName}<span className="faint">({o.format.toUpperCase()})</span></span></td>
                  <td className="num">{o.partsCount}</td>
                  <td className="mono muted">{o.gabarit || '—'} {o.gabarit ? <span style={{ fontSize: 10 }}>mm</span> : null}</td>
                  <td>
                    <span className={'badge ' + (statusCls[o.status] || '')}><span className="dot" style={{ background: dotCls[o.status] }} />{t('status.' + o.status)}</span>
                    {o.packStale ? <span className="badge warn" style={{ marginLeft: 6 }} title={t('pack.stale')}>!</span> : null}
                  </td>
                  <td className="mono muted nowrap" style={{ fontSize: 10 }}>{date(o.updatedAt)}</td>
                  <td className="nowrap" style={{ textAlign: 'right' }}>
                    {opOnly ? null : <Link className="btn xs icon-btn ghost" href={`/lab?id=${o.id}`} title={t('orders.openLab')} aria-label={t('orders.openLab')}><Icon name="box" size={20} /></Link>}
                    <Link className="btn xs icon-btn ghost" href={`/pack?id=${o.id}`} title={t('orders.openPack')} aria-label={t('orders.openPack')}><Icon name="layers" size={20} /></Link>
                    {can('P1') ? <button className="btn xs icon-btn ghost" onClick={() => dup(o)} title={t('orders.duplicate')} aria-label={t('orders.duplicate')}><Icon name="copy" size={20} /></button> : null}
                    {can('P1') ? <button className="btn xs icon-btn ghost danger" onClick={() => setDel(o)} title={t('common.delete')} aria-label={t('common.delete')}><Icon name="trash" size={20} /></button> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list && !list.length ? <div className="empty">{t('orders.empty')}</div> : null}
          {!list ? <div className="empty">{t('common.loading')}</div> : null}
        </div>
        <div className="tbl-foot">
          <div className="legend">
            <b style={{ color: 'var(--ink)' }}>{t('orders.legend')}:</b>
            {statuses.slice(1).map(([v, label]) => <span key={v}><span className="dot" style={{ background: dotCls[v] }} />{label}</span>)}
          </div>
          <span>{t('orders.shown', { n: all.length })}</span>
        </div>
      </div>
      {creating ? <NewOrder onClose={() => setCreating(false)} onCreated={(o) => { setCreating(false); router.push(`/lab?id=${o.id}`); }} /> : null}
      {del ? <Confirm danger text={t('orders.confirmDelete', { n: del.number })} onNo={() => setDel(null)} onYes={remove} yesLabel={t('common.delete')} /> : null}
    </div>
  );
}

export default function OrdersPage() {
  return <Protected need={['P9', 'P1']}><OrdersInner /></Protected>;
}
