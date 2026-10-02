'use client';
import { useCallback, useEffect, useState } from 'react';
import { Protected } from '@/components/ui/AppShell';
import { Confirm, Modal, useToast } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { AdminTabs } from '@/components/admin/AdminTabs';
import { api, type Role, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

interface Form { id?: number; login: string; fullName: string; password: string; roleId: number; lang: 'uz' | 'ru'; active: boolean }

function UserForm({ f0, roles, onClose, onSaved }: { f0: Form; roles: Role[]; onClose(): void; onSaved(): void }) {
  const { t } = useI18n();
  const push = useToast();
  const [f, setF] = useState<Form>(f0);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!f.login.trim() || (!f.id && f.password.length < 6) || (f.password && f.password.length < 6)) { push(t('users.invalid'), 'warn'); return; }
    setBusy(true);
    try {
      if (f.id) await api.updateUser(f.id, { fullName: f.fullName, roleId: f.roleId, lang: f.lang, active: f.active, ...(f.password ? { password: f.password } : {}) });
      else await api.createUser({ login: f.login.trim(), fullName: f.fullName, password: f.password, roleId: f.roleId, lang: f.lang, active: f.active });
      onSaved();
    } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <Modal title={f.id ? t('users.edit') : t('users.add')} onClose={onClose} footer={<>
      <button className="btn" onClick={onClose}>{t('common.cancel')}</button>
      <button className="btn primary" disabled={busy} onClick={save}>{t('common.save')}</button>
    </>}>
      <div className="col" style={{ gap: 12 }}>
        <div className="grid2">
          <label className="field"><span>{t('login.login')}</span><input className="input" value={f.login} disabled={!!f.id} autoComplete="off" onChange={(e) => setF({ ...f, login: e.target.value })} /></label>
          <label className="field"><span>{t('users.fullName')}</span><input className="input" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></label>
        </div>
        <label className="field"><span>{f.id ? t('users.newPassword') : t('login.password')}</span>
          <input className="input" type="password" autoComplete="new-password" value={f.password} placeholder={f.id ? t('users.keepPwd') : ''} onChange={(e) => setF({ ...f, password: e.target.value })} />
        </label>
        <div className="grid2">
          <label className="field"><span>{t('users.role')}</span>
            <select className="select" value={f.roleId} onChange={(e) => setF({ ...f, roleId: Number(e.target.value) })}>
              {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="field"><span>{t('users.lang')}</span>
            <select className="select" value={f.lang} onChange={(e) => setF({ ...f, lang: e.target.value as 'uz' | 'ru' })}>
              <option value="uz">O&apos;zbekcha</option><option value="ru">Русский</option>
            </select>
          </label>
        </div>
        <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />{t('users.active')}</label>
      </div>
    </Modal>
  );
}

function Inner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const push = useToast();
  const [users, setUsers] = useState<User[] | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [del, setDel] = useState<User | null>(null);
  const load = useCallback(async () => {
    try { const [u, r] = await Promise.all([api.users(), api.roles()]); setUsers(u); setRoles(r); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); }
  }, [push]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="page">
      <div className="page-head"><div><h1>{t('admin.title')}</h1><p>{t('admin.sub')}</p></div></div>
      <AdminTabs />
      <div className="card">
        <div className="card-head">
          <h2>{t('admin.users')}</h2>
          <button className="btn sm primary" style={{ marginLeft: 'auto' }} disabled={!roles.length}
            onClick={() => setForm({ login: '', fullName: '', password: '', roleId: roles[roles.length - 1]?.id || 0, lang: 'uz', active: true })}><Icon name="plus" size={15} />{t('users.add')}</button>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead><tr><th>{t('login.login')}</th><th>{t('users.fullName')}</th><th>{t('users.role')}</th><th>{t('users.lang')}</th><th>{t('users.state')}</th><th /></tr></thead>
            <tbody>
              {(users || []).map((u) => (
                <tr key={u.id}>
                  <td className="mono"><b>{u.login}</b></td>
                  <td>{u.fullName}</td>
                  <td><span className="badge info">{u.roleName}</span></td>
                  <td>{u.lang.toUpperCase()}</td>
                  <td>{u.active ? <span className="badge ok">{t('users.activeS')}</span> : <span className="badge err">{t('users.blocked')}</span>}</td>
                  <td className="nowrap" style={{ textAlign: 'right' }}>
                    <button className="btn xs icon-btn" onClick={() => setForm({ id: u.id, login: u.login, fullName: u.fullName, password: '', roleId: u.roleId, lang: u.lang, active: u.active })} aria-label={t('common.edit')}><Icon name="edit" size={14} /></button>{' '}
                    <button className="btn xs icon-btn danger" disabled={u.id === user?.id} onClick={() => setDel(u)} aria-label={t('common.delete')}><Icon name="trash" size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!users ? <div className="empty">{t('common.loading')}</div> : null}
        </div>
      </div>
      {form ? <UserForm f0={form} roles={roles} onClose={() => setForm(null)} onSaved={() => { setForm(null); push(t('common.saved'), 'ok'); void load(); }} /> : null}
      {del ? <Confirm danger text={t('users.confirmDelete', { n: del.login })} onNo={() => setDel(null)} yesLabel={t('common.delete')}
        onYes={async () => { try { await api.deleteUser(del.id); setDel(null); void load(); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); } }} /> : null}
    </div>
  );
}

export default function UsersPage() {
  return <Protected need="P10"><Inner /></Protected>;
}
