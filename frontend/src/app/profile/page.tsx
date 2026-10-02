'use client';
import { useState } from 'react';
import { LangSwitch, Protected } from '@/components/ui/AppShell';
import { useToast } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';

function Inner() {
  const { t } = useI18n();
  const { user, refresh } = useAuth();
  const push = useToast();
  const [name, setName] = useState(user?.fullName || '');
  const [oldP, setOldP] = useState('');
  const [newP, setNewP] = useState('');
  const [newP2, setNewP2] = useState('');

  const saveName = async () => {
    try { await api.updateProfile(name.trim()); await refresh(); push(t('common.saved'), 'ok'); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); }
  };
  const savePwd = async () => {
    if (newP.length < 6) { push(t('profile.pwdShort'), 'warn'); return; }
    if (newP !== newP2) { push(t('profile.pwdMismatch'), 'warn'); return; }
    try { await api.changePassword(oldP, newP); setOldP(''); setNewP(''); setNewP2(''); push(t('profile.pwdChanged'), 'ok'); } catch (e) { push(e instanceof Error ? e.message : String(e), 'error'); }
  };
  if (!user) return null;
  return (
    <div className="page" style={{ maxWidth: 900 }}>
      <div className="page-head"><div><h1>{t('nav.profile')}</h1><p>{user.login} · {user.roleName}</p></div></div>
      <div className="grid2" style={{ gap: 18, alignItems: 'start' }}>
        <div className="card card-pad col" style={{ gap: 12 }}>
          <h3 style={{ margin: 0 }}>{t('profile.data')}</h3>
          <label className="field"><span>{t('users.fullName')}</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <div className="field"><span>{t('users.lang')}</span><div><LangSwitch dark={false} /></div></div>
          <div className="field"><span>{t('profile.perms')}</span><div className="row wrap" style={{ gap: 4 }}>{user.permissions.map((p) => <span key={p} className="badge info" title={t('perm.' + p)}>{p}</span>)}</div></div>
          <button className="btn primary" onClick={saveName}><Icon name="save" size={15} />{t('common.save')}</button>
        </div>
        <div className="card card-pad col" style={{ gap: 12 }}>
          <h3 style={{ margin: 0 }}>{t('profile.password')}</h3>
          <label className="field"><span>{t('profile.oldPwd')}</span><input className="input" type="password" autoComplete="current-password" value={oldP} onChange={(e) => setOldP(e.target.value)} /></label>
          <label className="field"><span>{t('profile.newPwd')}</span><input className="input" type="password" autoComplete="new-password" value={newP} onChange={(e) => setNewP(e.target.value)} /></label>
          <label className="field"><span>{t('profile.newPwd2')}</span><input className="input" type="password" autoComplete="new-password" value={newP2} onChange={(e) => setNewP2(e.target.value)} /></label>
          <button className="btn" onClick={savePwd} disabled={!oldP || !newP}><Icon name="lock" size={15} />{t('profile.changePwd')}</button>
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return <Protected><Inner /></Protected>;
}
