'use client';
import type { ImportOptions } from '../types';
import type { ImportResponse } from './importFile';

/** Faylni Web Worker da import qiladi. Worker yaratib bo'lmasa (eski brauzer) asosiy oqimda bajaradi. */
export async function runImport(file: File, options: ImportOptions, extras: File[] = []): Promise<ImportResponse> {
  const bytes = await file.arrayBuffer();
  const mtlFile = extras.find((f) => /\.mtl$/i.test(f.name));
  const mtlText = mtlFile ? await mtlFile.text() : null;
  const req = { fileName: file.name, bytes, mtlText, options };
  let worker: Worker | null = null;
  try {
    worker = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    worker = null;
  }
  if (!worker) {
    const { importFile } = await import('./importFile');
    return importFile(req);
  }
  return new Promise<ImportResponse>((resolve) => {
    worker!.onmessage = (ev: MessageEvent<ImportResponse>) => { resolve(ev.data); worker!.terminate(); };
    worker!.onerror = (ev) => { resolve({ ok: false, error: ev.message || 'import xatosi' }); worker!.terminate(); };
    worker!.postMessage(req, [bytes]);
  });
}
