'use client';
import { useCallback, useEffect, useState } from 'react';
import { Protected } from '@/components/ui/AppShell';
import { Confirm, Modal, useToast } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { SettingsForm } from '@/components/pack/PackWorkspace';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import type { Material, PackSettings } from '@/lib/types';

const EMPTY: Material = { name: '', density: 700, sheetL: 2800, sheetW: 2070, sheetWeight: null, method: 'density' };

function numOrNull(s: string): number | null {
  const n = Number(s.replace(',', '.'));
  return s.trim() === '' || !isFinite(n) ? null : n;
}

function MaterialForm({ m, onClose, onSaved }: { m: Material; onClose(): void; onSaved(): void }) {
  const { t } = useI18n();
  const push = useToast();
  const [v, setV] = useState<Material>(m);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!v.name.trim()) { push(t('mat.nameReq'), 'warn'); return; }
    if (v.method === 'density' && !v.density) { push(t('mat.densityReq'), 'warn'); return; }
    if (v.method === 'sheet' && (!v.sheetL || !v.sheetW || !v.sheetWeight)) { push(t('mat.sheetReq'), 'warn'); return; }
    setBusy(true);
    try {
      if (v.id) await api.updateMaterial(v.id, { ...v, name: v.name.trim() }); else await api.createMaterial({ ...v, name: v.name.trim() });
      onSaved();
    } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); } finally { setBusy(false); }
  };
  const nf = (k: 'density' | 'sheetL' | 'sheetW' | 'sheetWeight', label: string, suffix: string) => (
    <label className="field"><span>{label} <span className="faint">({suffix})</span></span>
      <input className="input num" inputMode="decimal" defaultValue={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: numOrNull(e.target.value) })} />
    </label>
  );
  const kgPerM2 = v.sheetL && v.sheetW && v.sheetWeight ? v.sheetWeight / ((v.sheetL * v.sheetW) / 1e6) : null;
  return (
    <Modal title={v.id ? t('mat.edit') : t('mat.add')} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
      <button className="btn primary" disabled={busy} onClick={save}>{t('common.save')}</button>
    </>}>
      <div className="col" style={{ gap: 12 }}>
        <label className="field"><span>{t('mat.name')}</span><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} placeholder="ЛДСП 16 Egger" /></label>
        <div className="small muted">{t('mat.nameNote')}</div>
        <div className="field"><span>{t('mat.method')}</span>
          <div className="modes" role="radiogroup">
            {(['density', 'sheet', 'manual'] as const).map((k) => <button key={k} role="radio" aria-checked={v.method === k} className={v.method === k ? 'on' : ''} onClick={() => setV({ ...v, method: k })}>{t('mat.m.' + k)}</button>)}
          </div>
        </div>
        {v.method === 'density' ? nf('density', t('mat.density'), 'kg/m³') : null}
        {v.method === 'sheet' ? (
          <>
            <div className="grid3">{nf('sheetL', t('mat.sheetL'), 'mm')}{nf('sheetW', t('mat.sheetW'), 'mm')}{nf('sheetWeight', t('mat.sheetWeight'), 'kg')}</div>
            {kgPerM2 != null ? <div className="small muted">≈ {kgPerM2.toFixed(2)} kg/m²</div> : null}
          </>
        ) : null}
        {v.method === 'manual' ? <div className="alert small"><Icon name="info" size={16} />{t('mat.manualNote')}</div> : null}
      </div>
    </Modal>
  );
}

function Inner() {
  const { t } = useI18n();
  const { can } = useAuth();
  const push = useToast();
  const [list, setList] = useState<Material[] | null>(null);
  const [edit, setEdit] = useState<Material | null>(null);
  const [del, setDel] = useState<Material | null>(null);
  const [q, setQ] = useState('');
  const [ps, setPs] = useState<PackSettings | null>(null);
  const canEdit = can('P6') || can('P10');

  const load = useCallback(async () => {
    try { setList(await api.materials()); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); setList([]); }
  }, [push]);
  useEffect(() => { void load(); api.defaultPackSettings().then(setPs).catch(() => undefined); }, [load]);

  const savePs = async () => {
    if (!ps) return;
    try { setPs(await api.saveDefaultPackSettings(ps)); push(t('common.saved'), 'ok'); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const filtered = (list || []).filter((m) => !q || m.name.toLowerCase().includes(q.toLowerCase()));
  const val = (m: Material) => m.method === 'density' ? `${m.density ?? '?'} kg/m³` : m.method === 'sheet' ? `${m.sheetWeight ?? '?'} kg / ${m.sheetL ?? '?'}×${m.sheetW ?? '?'}` : t('mat.m.manual');

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>{t('mat.title')}</h1><p>{t('mat.sub')}</p></div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) minmax(320px,1fr)', gap: 18, alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <h2>{t('mat.list')}</h2>
            <input className="input sm" style={{ maxWidth: 240, marginLeft: 'auto' }} placeholder={t('table.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('table.search')} />
            {canEdit ? <button className="btn sm primary" onClick={() => setEdit({ ...EMPTY })}><Icon name="plus" size={15} />{t('mat.add')}</button> : null}
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>{t('mat.name')}</th><th>{t('mat.method')}</th><th>{t('mat.value')}</th><th /></tr></thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id ?? m.name}>
                    <td><b>{m.name}</b></td>
                    <td><span className={'badge ' + (m.method === 'manual' ? 'warn' : 'info')}>{t('mat.m.' + m.method)}</span></td>
                    <td className="mono small">{val(m)}</td>
                    <td className="nowrap" style={{ textAlign: 'right' }}>
                      {canEdit ? <>
                        <button className="btn xs icon-btn" onClick={() => setEdit(m)} aria-label={t('common.edit')}><Icon name="edit" size={14} /></button>{' '}
                        <button className="btn xs icon-btn danger" onClick={() => setDel(m)} aria-label={t('common.delete')}><Icon name="trash" size={14} /></button>
                      </> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {list && !filtered.length ? <div className="empty">{t('mat.empty')}</div> : null}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h2>{t('mat.packDefaults')}</h2></div>
          <div className="card-pad">
            <div className="small muted" style={{ marginBottom: 12 }}>{t('mat.packDefaultsNote')}</div>
            {ps ? <SettingsForm s={ps} set={(p) => setPs({ ...ps, ...p })} disabled={!can('P6')} /> : <div className="muted">{t('common.loading')}</div>}
            {can('P6') ? <button className="btn primary block" style={{ marginTop: 14 }} onClick={savePs}><Icon name="save" size={15} />{t('common.save')}</button> : null}
          </div>
        </div>
      </div>
      {edit ? <MaterialForm m={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); push(t('common.saved'), 'ok'); void load(); }} /> : null}
      {del ? <Confirm danger text={t('mat.confirmDelete', { n: del.name })} onNo={() => setDel(null)} yesLabel={t('common.delete')}
        onYes={async () => { try { await api.deleteMaterial(del.id!); setDel(null); void load(); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); } }} /> : null}
    </div>
  );
}

export default function MaterialsPage() {
  return <Protected><Inner /></Protected>;
}
