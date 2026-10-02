'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth, type Perm } from '@/lib/auth';
import { useI18n, type Lang } from '@/lib/i18n';
import { api } from '@/lib/api';
import { BrandMark, Icon } from './Icon';

export function LangSwitch({ dark = true }: { dark?: boolean }) {
  const { lang, setLang } = useI18n();
  const { user } = useAuth();
  const pick = (l: Lang) => {
    setLang(l);
    if (user) void api.setLang(l).catch(() => undefined);
  };
  return (
    <div className="seg" style={dark ? undefined : { background: 'var(--panel-2)', border: '1px solid var(--line)' }} role="group" aria-label="Til / Язык">
      {(['uz', 'ru'] as Lang[]).map((l) => (
        <button key={l} className={lang === l ? 'on' : ''} onClick={() => pick(l)} style={!dark && lang !== l ? { color: 'var(--muted)' } : undefined}>
          {l === 'uz' ? 'UZ' : 'RU'}
        </button>
      ))}
    </div>
  );
}

export function Header() {
  const { user, can, logout } = useAuth();
  const { t } = useI18n();
  const path = usePathname() || '';
  const on = (p: string) => (path === p || path.startsWith(p + '/') ? 'on' : '');
  const initials = (user?.fullName || user?.login || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <header className="hdr">
      <Link href="/orders" className="brand"><BrandMark /><span>Bazis upokovka<small>{t('app.tagline')}</small></span></Link>
      <nav className="nav">
        <Link href="/orders" className={on('/orders') || on('/lab') || on('/pack')}>{t('nav.orders')}</Link>
        <Link href="/materials" className={on('/materials')}>{t('nav.materials')}</Link>
        {can('P10') ? <Link href="/admin/users" className={on('/admin')}>{t('nav.admin')}</Link> : null}
        <Link href="/viewer" className={on('/viewer')}>{t('nav.viewer')}</Link>
      </nav>
      <div className="hdr-right">
        <LangSwitch />
        {user ? (
          <>
            <Link href="/profile" className="user-chip" title={t('nav.profile')}>
              <span className="avatar">{initials}</span>
              <span className="nowrap" style={{ fontSize: 13, fontWeight: 650 }}>{user.fullName || user.login}<small>{user.roleName}</small></span>
            </Link>
            <button className="btn ghost sm icon-btn" style={{ color: '#fff' }} onClick={logout} title={t('nav.logout')} aria-label={t('nav.logout')}><Icon name="logout" /></button>
          </>
        ) : null}
      </div>
    </header>
  );
}

/** Kirish talab qilinadigan sahifa. need berilsa, ruxsat bo'lmasa xabar ko'rsatiladi. */
export function Protected({ children, need, bare }: { children: ReactNode; need?: Perm | Perm[]; bare?: boolean }) {
  const { user, loading, can } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.replace('/login?next=' + encodeURIComponent(location.pathname + location.search));
  }, [loading, user, router]);
  if (loading || !user) return <div className="app"><div className="empty" style={{ marginTop: 120 }}>{t('common.loading')}</div></div>;
  const needs = need ? (Array.isArray(need) ? need : [need]) : [];
  const body = needs.length && !needs.some((p) => can(p))
    ? <div className="page"><div className="alert err"><Icon name="lock" /><div><b>{t('perm.denied')}</b><div>{t('perm.need', { p: needs.join(' / ') })}</div></div></div></div>
    : children;
  if (bare) return <>{body}</>;
  return <div className="app"><Header />{body}</div>;
}
