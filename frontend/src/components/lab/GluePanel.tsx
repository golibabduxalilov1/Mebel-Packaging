'use client';
import { glueBlocker, glueStepOf, useLab, type LabStore } from '@/lib/lab/store';
import { eff } from '@/lib/model/labdoc';
import { useI18n } from '@/lib/i18n';
import { Icon } from '../ui/Icon';

export function GluePanel({ store }: { store: LabStore }) {
  const { t } = useI18n();
  const g = useLab(store, (s) => s.glue);
  const doc = useLab(store, (s) => s.doc);
  const readOnly = useLab(store, (s) => s.readOnly);

  if (!store.perms.glue || readOnly) return <div className="empty"><Icon name="lock" size={24} /><div>{t('glue.noPerm')}</div></div>;
  if (!g) {
    return (
      <div className="side-sec">
        <button className="btn primary block" onClick={() => store.startGlue()}><Icon name="glue" size={16} />{t('glue.start')}</button>
      </div>
    );
  }

  const step = glueStepOf(g);
  const why = glueBlocker(g);
  const name = (partId: string) => { const p = store.part(partId); return p ? eff(p, doc.edits[partId]).name : partId; };
  const entName = (ent: string) => { const c = doc.composites.find((x) => x.id === ent); return c ? c.name + ' ⛓' : name(ent); };

  return (
    <div className="side-scroll">
      <div className="side-sec small muted">{t('glue.s' + step + 'd')}</div>

      <div className="side-sec col" style={{ gap: 8 }}>
        <div className="label">{t('glue.main')}</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {g.main ? (
            <span className="chip main" title={entName(g.main)}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{entName(g.main)}</span>
              <button onClick={() => store.clearMain()} aria-label={t('glue.changeMain')} title={t('glue.changeMain')}><Icon name="x" size={12} /></button>
            </span>
          ) : <span className="small faint">{t('glue.none')}</span>}
        </div>
        <div className="label" style={{ marginTop: 4 }}>{t('glue.attached')}{g.attached.length ? ` (${g.attached.length})` : ''}</div>
        <div className="row wrap" style={{ gap: 6 }}>
          {g.attached.length ? g.attached.map((e) => (
            <span key={e} className="chip attached" title={entName(e)}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{entName(e)}</span>
              <button onClick={() => store.removeAttached(e)} aria-label={t('common.remove')}><Icon name="x" size={12} /></button>
            </span>
          )) : <span className="small faint">{t('glue.none')}</span>}
        </div>
      </div>

      <div className="side-sec col" style={{ gap: 6, position: 'sticky', bottom: 0, background: '#fff' }}>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={() => store.cancelGlue()} disabled={!g.main}>{t('common.cancel')}</button>
          <button className="btn sm grow accent" disabled={!!why} onClick={() => store.glueConfirm()}><Icon name="check" size={15} />{t('glue.confirm')}</button>
        </div>
        {why ? <div className="small muted" role="note">{t(why)}</div> : null}
        <div className="small faint">{t('glue.inPlace')}</div>
      </div>

      {doc.composites.length ? (
        <div className="side-sec">
          <h4>{t('glue.composites', { n: doc.composites.length })}</h4>
          <div className="col" style={{ gap: 6 }}>
            {doc.composites.map((c) => (
              <div key={c.id} className="row" style={{ fontSize: 13 }}>
                <Icon name="link" size={14} />
                <button className="btn ghost xs grow" style={{ justifyContent: 'flex-start' }} onClick={() => { store.setMode('view'); store.select([c.members[0].partId]); store.focusSelected(); }}>{c.name} · {c.members.length}</button>
                <button className="btn xs" onClick={() => store.dissolveOf(c.id)} title={t('props.dissolve')}><Icon name="unlink" size={13} /></button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
