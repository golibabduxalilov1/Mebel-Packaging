'use client';
/* F5-F8: fayl tanlash, import sozlamalari va brauzerda (Web Worker) import. Xato holatlari: himoyalangan .b3d (A2), noto'g'ri format. */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { renderThumb } from './renderThumb';
import { DEFAULT_IMPORT, type ImportOptions, type ImportResult } from '@/lib/types';
import { formatOf, MAX_FILE } from '@/lib/import/importFile';
import { runImport } from '@/lib/import/runImport';
import { useI18n } from '@/lib/i18n';
import { Icon } from '../ui/Icon';

export interface ImportDone { result: ImportResult; main: File; extras: File[]; options: ImportOptions; ms: number }

export function splitFiles(list: File[]): { main: File | null; extras: File[] } {
  const main = list.find((f) => formatOf(f.name)) || null;
  return { main, extras: list.filter((f) => f !== main) };
}

export function ImportOptionsForm({ value, onChange, format }: { value: ImportOptions; onChange(v: ImportOptions): void; format: string | null }) {
  const { t } = useI18n();
  const mesh = format === 'dae' || format === 'obj';
  return (
    <div className="grid3">
      <label className="field"><span>{t('imp.unit')}</span>
        <select className="select sm" value={value.unit} disabled={!mesh} onChange={(e) => onChange({ ...value, unit: e.target.value as ImportOptions['unit'] })}>
          <option value="auto">{t('imp.auto')}</option><option value="mm">mm</option><option value="cm">cm</option><option value="m">m</option>
        </select>
      </label>
      <label className="field"><span>{t('imp.up')}</span>
        <select className="select sm" value={value.upAxis} disabled={!mesh} onChange={(e) => onChange({ ...value, upAxis: e.target.value as ImportOptions['upAxis'] })}>
          <option value="auto">{t('imp.auto')}</option><option value="Y">Y</option><option value="Z">Z</option>
        </select>
      </label>
      <label className="field"><span>{t('imp.level')}</span>
        <select className="select sm" value={value.daeLevel} disabled={format !== 'dae'} onChange={(e) => onChange({ ...value, daeLevel: e.target.value as ImportOptions['daeLevel'] })}>
          <option value="top">{t('imp.levelTop')}</option><option value="mesh">{t('imp.levelMesh')}</option>
        </select>
      </label>
    </div>
  );
}

export function ImportPanel({ onDone, children, busyLabel }: { onDone(d: ImportDone): void | Promise<void>; children?: ReactNode; busyLabel?: string }) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [opts, setOpts] = useState<ImportOptions>(DEFAULT_IMPORT);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ kind: 'protected' | 'error'; text: string } | null>(null);
  const [over, setOver] = useState(false);
  const { main, extras } = splitFiles(files);
  const fmt = main ? formatOf(main.name) : null;

  const [thumb, setThumb] = useState<string | null>(null);

  useEffect(() => {
    setThumb(null);
    if (!main || main.size > MAX_FILE) return;
    let dead = false;
    runImport(main, opts, extras)
      .then((r) => { if (!dead && r.ok) setThumb(renderThumb(r.result)); })
      .catch(() => {});
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [main, opts.unit, opts.upAxis, opts.daeLevel]);

  const pick = (list: FileList | null) => {
    if (!list) return;
    setErr(null);
    setFiles(Array.from(list));
  };

  const go = async () => {
    if (!main) { setErr({ kind: 'error', text: t('imp.noMain') }); return; }
    if (main.size > MAX_FILE) { setErr({ kind: 'error', text: t('imp.tooBig') }); return; }
    setBusy(true); setErr(null);
    try {
      const r = await runImport(main, opts, extras);
      if (!r.ok) {
        if (r.protected) setErr({ kind: 'protected', text: r.modelName || main.name });
        else setErr({ kind: 'error', text: r.error });
        return;
      }
      await onDone({ result: r.result, main, extras, options: opts, ms: r.ms });
    } catch (e) {
      setErr({ kind: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="col" style={{ gap: 14 }}>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
        onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') input.current?.click(); }}
        style={{ border: '1.5px dashed ' + (over ? 'var(--primary)' : '#b9c6d0'), background: over ? 'var(--primary-50)' : 'var(--panel-2)', borderRadius: 14, padding: '26px 16px', textAlign: 'center', cursor: 'pointer' }}>
        {thumb
          ? <img src={thumb} alt={main?.name || ''} style={{ display: 'block', margin: '0 auto', maxWidth: '100%', maxHeight: 200, pointerEvents: 'none' }} />
          : <div style={{ color: 'var(--primary)' }}><Icon name="upload" size={30} /></div>}
        <div style={{ fontWeight: 700, marginTop: 6 }}>{main ? main.name : t('imp.drop')}</div>
        <div className="small muted">{main ? `${(main.size / 1048576).toFixed(2)} MB · ${fmt?.toUpperCase()}${extras.length ? ' · +' + extras.length + ' ' + t('imp.extras') : ''}` : t('imp.formats')}</div>
        <input ref={input} type="file" multiple hidden accept=".b3d,.dae,.obj,.mtl,.json,.png,.jpg,.jpeg,.bmp" onChange={(e) => pick(e.target.files)} />
      </div>
      {fmt === 'obj' && !extras.some((f) => /\.mtl$/i.test(f.name)) ? <div className="small muted">{t('imp.mtlHint')}</div> : null}
      {children}
      {err?.kind === 'protected' ? (
        <div className="alert err" role="alert"><Icon name="lock" size={20} /><div><b>{t('imp.protected')}</b><div>{t('imp.protectedText', { name: err.text })}</div></div></div>
      ) : err ? (
        <div className="alert err" role="alert"><Icon name="warn" size={20} /><div><b>{t('imp.error')}</b><div>{err.text}</div></div></div>
      ) : null}
      <button className="btn primary" disabled={!main || busy} onClick={go}>
        {busy ? (busyLabel || t('imp.busy')) : <><Icon name="play" size={15} />{t('imp.run')}</>}
      </button>
    </div>
  );
}

/** Rasm fayllaridan tekstura xaritasi (DAE/OBJ). */
export function textureMap(extras: File[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const f of extras) if (/\.(png|jpe?g|bmp|gif|webp)$/i.test(f.name)) m.set(f.name.toLowerCase(), URL.createObjectURL(f));
  return m;
}
