'use client';
import { useCallback, useEffect, useState } from 'react';
import { Protected } from '@/components/ui/AppShell';
import { Confirm, useToast } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { AdminTabs } from '@/components/admin/AdminTabs';
import { api, type Permission, type Role } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const PERMS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];

function Inner() {
  const { t } = useI18n();
  const push = useToast();
  const [roles, setRoles] = useState<Role[] | null>(null);
  const [perms, setPerms] = useState<Permission[]>([]);
  const [draft, setDraft] = useState<Record<number, Role>>({});
  const [newName, setNewName] = useState('');
  const [del, setDel] = useState<Role | null>(null);

  const load = useCallback(async () => {
    try {
      const [r, p] = await Promise.all([api.roles(), api.permissions()]);
      setRoles(r); setPerms(p); setDraft({});
    } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); }
  }, [push]);
  useEffect(() => { void load(); }, [load]);

  const cur = (r: Role) => draft[r.id] || r;
  const toggle = (r: Role, p: string) => {
    const c = cur(r);
    const has = c.permissions.indexOf(p) >= 0;
    setDraft({ ...draft, [r.id]: { ...c, permissions: has ? c.permissions.filter((x) => x !== p) : [...c.permissions, p].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))) } });
  };
  const save = async (r: Role) => {
    const c = cur(r);
    try { await api.updateRole(r.id, { name: c.name, description: c.description, permissions: c.permissions }); push(t('common.saved'), 'ok'); void load(); }
    catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const create = async () => {
    if (!newName.trim()) return;
    try { await api.createRole({ name: newName.trim(), description: '', permissions: ['P9'] }); setNewName(''); void load(); }
    catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const pname = (code: string) => perms.find((p) => p.code === code)?.name || t('perm.' + code);

  return (
    <div className="page">
      <div className="page-head"><div><h1>{t('admin.title')}</h1><p>{t('roles.sub')}</p></div></div>
      <AdminTabs />
      <div className="card">
        <div className="card-head">
          <h2>{t('admin.roles')}</h2>
          <div className="row" style={{ marginLeft: 'auto' }}>
            <input className="input sm" placeholder={t('roles.newPh')} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} aria-label={t('roles.newPh')} />
            <button className="btn sm primary" onClick={create} disabled={!newName.trim()}><Icon name="plus" size={15} />{t('roles.add')}</button>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>{t('roles.role')}</th>
                {PERMS.map((p) => <th key={p} style={{ textAlign: 'center' }} title={pname(p)}>{p}</th>)}
                <th />
              </tr>
            </thead>
            <tbody>
              {(roles || []).map((r) => {
                const c = cur(r);
                const changed = !!draft[r.id];
                return (
                  <tr key={r.id}>
                    <td><b>{r.name}</b>{r.system ? <span className="badge" style={{ marginLeft: 6 }}>{t('roles.system')}</span> : null}<div className="small faint">{t('roles.usersN', { n: r.users ?? 0 })}</div></td>
                    {PERMS.map((p) => (
                      <td key={p} style={{ textAlign: 'center' }}>
                        <input type="checkbox" style={{ accentColor: 'var(--primary)', width: 16, height: 16 }} checked={c.permissions.indexOf(p) >= 0}
                          disabled={r.system && p === 'P10'} onChange={() => toggle(r, p)} aria-label={`${r.name}: ${pname(p)}`} />
                      </td>
                    ))}
                    <td className="nowrap" style={{ textAlign: 'right' }}>
                      <button className="btn xs primary" disabled={!changed} onClick={() => save(r)}>{t('common.save')}</button>{' '}
                      <button className="btn xs icon-btn danger" disabled={r.system || (r.users ?? 0) > 0} onClick={() => setDel(r)} aria-label={t('common.delete')}><Icon name="trash" size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="card-pad small muted" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '4px 18px' }}>
          {PERMS.map((p) => <div key={p}><b className="mono">{p}</b> · {pname(p)}</div>)}
        </div>
      </div>
      {del ? <Confirm danger text={t('roles.confirmDelete', { n: del.name })} onNo={() => setDel(null)} yesLabel={t('common.delete')}
        onYes={async () => { try { await api.deleteRole(del.id); setDel(null); void load(); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); } }} /> : null}
    </div>
  );
}

export default function RolesPage() {
  return <Protected need="P10"><Inner /></Protected>;
}
