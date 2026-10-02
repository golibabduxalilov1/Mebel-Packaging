'use client';
import { useState } from 'react';
import { useLab, type LabStore } from '@/lib/lab/store';
import { useI18n } from '@/lib/i18n';
import { Icon } from '../ui/Icon';

/** "Alohida upokovka" rejimi: guruh yaratish va tanlangan detallarni guruhga biriktirish. */
export function GroupPanel({ store }: { store: LabStore }) {
  const { t } = useI18n();
  const doc = useLab(store, (s) => s.doc);
  const selected = useLab(store, (s) => s.selected);
  const readOnly = useLab(store, (s) => s.readOnly);
  const [name, setName] = useState('');

  if (!store.perms.editParts || readOnly) return <div className="empty"><Icon name="lock" size={24} /><div>{t('group.noPerm')}</div></div>;

  const groups = doc.packGroups || [];
  const counts = new Map<string, number>();
  for (const gid of Object.values(doc.partGroup || {})) counts.set(gid, (counts.get(gid) || 0) + 1);
  const create = () => {
    store.createGroup(name.trim() || t('group.defaultName', { n: groups.length + 1 }), true);
    setName('');
  };

  return (
    <div className="side-scroll">
      <div className="side-sec small muted">{t('group.hint')}</div>
      <div className="side-sec col" style={{ gap: 8 }}>
        <div className="small">{t('group.selected', { n: selected.size })}</div>
        <input className="input sm" value={name} placeholder={t('group.namePh')} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
        <button className="btn primary block" onClick={create}><Icon name="plus" size={15} />{selected.size ? t('group.createWith') : t('group.create')}</button>
        <button className="btn block" disabled={!selected.size} onClick={() => store.assignSelected(null)}>{t('group.remove')}</button>
        <div className="small muted">{t('group.compositeNote')}</div>
      </div>
      <div className="side-sec col" style={{ gap: 8 }}>
        <div className="label">{t('group.list', { n: groups.length })}</div>
        {!groups.length ? <div className="small faint">{t('group.none')}</div> : null}
        {groups.map((g) => (
          <div key={g.id} className="card card-pad col" style={{ gap: 6, padding: 8 }}>
            <div className="row" style={{ gap: 6 }}>
              <span className="swatch" style={{ background: g.color }} />
              <input className="input sm grow" defaultValue={g.name} aria-label={t('group.rename')} title={t('group.rename')}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== g.name) store.renameGroup(g.id, v); else e.target.value = g.name; }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
              <span className="badge">{counts.get(g.id) || 0}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn xs" disabled={!selected.size} onClick={() => store.assignSelected(g.id)}>{t('group.addSelected')}</button>
              <button className="btn xs" onClick={() => store.select(Object.entries(doc.partGroup || {}).filter(([, v]) => v === g.id).map(([k]) => k), 'set', false)}>{t('group.pick')}</button>
              <button className="btn xs icon-btn" style={{ marginLeft: 'auto' }} onClick={() => store.deleteGroup(g.id)} title={t('group.delete')} aria-label={t('group.delete')}><Icon name="trash" size={13} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
