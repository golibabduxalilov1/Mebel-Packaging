'use client';
import { useLab, type LabStore } from '@/lib/lab/store';
import { useI18n } from '@/lib/i18n';
import { Icon } from '../ui/Icon';

export function MergePanel({ store }: { store: LabStore }) {
  const { t } = useI18n();
  const doc = useLab(store, (s) => s.doc);
  const selected = useLab(store, (s) => s.selected);
  const readOnly = useLab(store, (s) => s.readOnly);
  const can = store.perms.merge && !readOnly;
  const selRows = doc.rows.filter((r) => r.members.some((m) => selected.has(m)));
  const manual = doc.rows.filter((r) => r.manual && r.members.length > 1).length;
  const parts = doc.rows.reduce((s, r) => s + r.members.length, 0);

  return (
    <div className="side-scroll">
      <div className="side-sec">
        <h4>{t('merge.title')}</h4>
        <p className="small muted" style={{ marginTop: 0 }}>{t('merge.rule')}</p>
        <label className="check"><input type="checkbox" checked={doc.mergeKey.kromka} disabled={!can} onChange={(e) => store.setMergeKey({ kromka: e.target.checked })} />{t('merge.byKromka')}</label>
        <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={doc.mergeKey.cuts} disabled={!can} onChange={(e) => store.setMergeKey({ cuts: e.target.checked })} />{t('merge.byCuts')}</label>
        <button className="btn sm primary block" style={{ marginTop: 12 }} disabled={!can} onClick={() => store.autoMerge()}><Icon name="merge" size={15} />{t('merge.auto')}</button>
        <div className="small muted" style={{ marginTop: 6 }}>{t('merge.autoNote')}</div>
      </div>
      <div className="side-sec">
        <h4>{t('merge.manual')}</h4>
        <div className="small muted" style={{ marginBottom: 8 }}>{t('merge.manualHint')}</div>
        <div className="row" style={{ marginBottom: 10 }}><span className="badge info">{t('merge.selRows', { n: selRows.length })}</span></div>
        <div className="col">
          <button className="btn sm" disabled={!can || selRows.length < 2} onClick={() => store.mergeSelected()}><Icon name="merge" size={15} />{t('merge.merge')}</button>
          <button className="btn sm" disabled={!can || !selRows.some((r) => r.members.length > 1)} onClick={() => store.splitSelected()}><Icon name="split" size={15} />{t('merge.split')}</button>
          <button className="btn sm ghost" disabled={!selected.size} onClick={() => store.clearSelection()}>{t('merge.clearSel')}</button>
        </div>
        {selRows.length === 1 ? (
          <label className="field" style={{ marginTop: 12 }}>
            <span>{t('merge.qty')}</span>
            <input className="input sm num" type="number" min={0} key={selRows[0].id + (selRows[0].qty ?? '')} defaultValue={selRows[0].qty ?? selRows[0].members.length} disabled={!can}
              onBlur={(e) => { const n = Number(e.target.value); store.setRowQty(selRows[0].id, n === selRows[0].members.length ? null : n); }} />
            <span className="small faint">{t('merge.qtyNote', { n: selRows[0].members.length })}</span>
          </label>
        ) : null}
      </div>
      <div className="side-sec small">
        <div className="row between"><span className="muted">{t('merge.rows')}</span><b className="mono">{doc.rows.length}</b></div>
        <div className="row between"><span className="muted">{t('data.parts')}</span><b className="mono">{parts}</b></div>
        <div className="row between"><span className="muted">{t('merge.manualCount')}</span><b className="mono">{manual}</b></div>
        <div className="row between"><span className="muted">{t('merge.composites')}</span><b className="mono">{doc.composites.length}</b></div>
      </div>
    </div>
  );
}
