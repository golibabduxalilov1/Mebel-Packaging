'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '@/lib/i18n';
import { Icon } from '../ui/Icon';

export function AdminTabs() {
  const { t } = useI18n();
  const p = usePathname() || '';
  return (
    <div className="modes" style={{ marginBottom: 16 }}>
      <Link href="/admin/users" className={p.startsWith('/admin/users') ? 'btn sm on' : 'btn sm ghost'}><Icon name="users" size={15} />{t('admin.users')}</Link>
      <Link href="/admin/roles" className={p.startsWith('/admin/roles') ? 'btn sm on' : 'btn sm ghost'}><Icon name="shield" size={15} />{t('admin.roles')}</Link>
    </div>
  );
}
