'use client';
import { Suspense, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { ApiError } from '@/lib/api';
import { BrandMark, Icon } from '@/components/ui/Icon';
import { LangSwitch } from '@/components/ui/AppShell';

function LoginForm() {
  const { t } = useI18n();
  const { login } = useAuth();
  const router = useRouter();
  const sp = useSearchParams();
  const [l, setL] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await login(l.trim(), p);
      const next = sp.get('next');
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/orders');
    } catch (ex) {
      setErr(ex instanceof ApiError && ex.status === 401 ? t('login.bad') : ex instanceof ApiError && ex.status === 403 ? t('login.blocked') : ex instanceof Error ? ex.message : String(ex));
    } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <div className="login-art">
        <div className="brand"><BrandMark size={36} /><span style={{ fontSize: 18 }}>Bazis upokovka</span></div>
        <div>
          <h1>{t('login.hero')}</h1>
          <p>{t('login.heroText')}</p>
        </div>
        <svg viewBox="0 0 400 180" style={{ width: '100%', maxWidth: 520, opacity: 0.9 }} aria-hidden>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${20 + i * 125} ${60 - i * 18})`}>
              <path d="M0 30 L60 0 L120 30 L60 60 Z" fill="#c9a479" />
              <path d="M0 30 L60 60 L60 120 L0 90 Z" fill="#a7814f" />
              <path d="M120 30 L60 60 L60 120 L120 90 Z" fill="#b8925f" />
              <path d="M30 15 L90 45" stroke="#8a6a46" strokeWidth="6" />
            </g>
          ))}
        </svg>
      </div>
      <div className="login-form">
        <form className="card" onSubmit={submit}>
          <div className="row between" style={{ marginBottom: 18 }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>{t('login.title')}</h2>
            <LangSwitch dark={false} />
          </div>
          <div className="col" style={{ gap: 12 }}>
            <label className="field"><span>{t('login.login')}</span>
              <input className="input" autoComplete="username" value={l} onChange={(e) => setL(e.target.value)} required autoFocus />
            </label>
            <label className="field"><span>{t('login.password')}</span>
              <div style={{ position: 'relative' }}>
                <input className="input" type={show ? 'text' : 'password'} autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required style={{ paddingRight: 40 }} />
                <button type="button" className="btn ghost sm icon-btn" style={{ position: 'absolute', right: 3, top: 3 }} onClick={() => setShow(!show)} aria-label={t('login.showPwd')}><Icon name={show ? 'eyeOff' : 'eye'} size={16} /></button>
              </div>
            </label>
            {err ? <div className="alert err small" role="alert"><Icon name="warn" size={16} />{err}</div> : null}
            <button className="btn primary block" disabled={busy} style={{ height: 40 }}>{busy ? t('common.loading') : t('login.submit')}</button>
          </div>
          <div className="small faint" style={{ marginTop: 16 }}>{t('login.note')}</div>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
