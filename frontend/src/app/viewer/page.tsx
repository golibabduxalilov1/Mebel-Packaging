'use client';
/* Mustaqil DAE/OBJ/B3D ko'ruvchi: login va server talab qilinmaydi (fayl faqat brauzerda ochiladi). */
import Link from 'next/link';
import { useState } from 'react';
import { BrandMark, Icon } from '@/components/ui/Icon';
import { LangSwitch } from '@/components/ui/AppShell';
import { ImportPanel, textureMap, type ImportDone } from '@/components/lab/ImportPanel';
import { LabWorkspace } from '@/components/lab/LabWorkspace';
import { LabStore } from '@/lib/lab/store';
import { useI18n } from '@/lib/i18n';
import { api, getToken } from '@/lib/api';
import type { Material } from '@/lib/types';

export default function ViewerPage() {
  const { t } = useI18n();
  const [store, setStore] = useState<LabStore | null>(null);
  const [info, setInfo] = useState<{ name: string; ms: number; size: number } | null>(null);

  const done = async (d: ImportDone) => {
    let materials: Material[] = [];
    // tizimga kirgan bo'lsa materiallar zichligi olinadi; aks holda og'irlik "noma'lum"
    if (getToken()) { try { materials = await api.materials(); } catch { materials = []; } }
    const s = new LabStore();
    s.load(d.result, null, null, materials, { textures: textureMap(d.extras) });
    setInfo({ name: d.main.name, ms: d.ms, size: d.main.size });
    setStore(s);
  };

  if (store && info) {
    return (
      <LabWorkspace
        store={store} standalone title={info.name} subtitle={t('viewer.local')}
        left={<button className="btn sm icon-btn" onClick={() => { setStore(null); setInfo(null); }} title={t('viewer.another')} aria-label={t('viewer.another')}><Icon name="chevronL" size={16} /></button>}
        right={<LangSwitch dark={false} />}
        statusExtra={<span>{t('lab.importMs', { ms: info.ms })} · {(info.size / 1048576).toFixed(1)} MB</span>}
      />
    );
  }
  return (
    <div className="app">
      <header className="hdr">
        <Link href="/orders" className="brand"><BrandMark /><span>Bazis upokovka<small>{t('nav.viewer')}</small></span></Link>
        <div className="hdr-right"><LangSwitch /></div>
      </header>
      <div className="page" style={{ maxWidth: 640 }}>
        <div className="page-head"><div><h1>{t('viewer.title')}</h1><p>{t('viewer.sub')}</p></div></div>
        <div className="card card-pad"><ImportPanel onDone={done} /></div>
      </div>
    </div>
  );
}
