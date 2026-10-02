import { ProtectedFileError, type ImportOptions, type ImportResult } from '../types';
import { parseDAE } from './dae';
import { parseMTL, parseOBJ } from './obj';
import { parseB3D } from './b3d';
import { parseBazisJson } from './bazisJson';
import { finalizeB3d, finalizeDae, finalizeJson, finalizeObj } from './finalize';

export interface ImportRequest {
  fileName: string;
  bytes: ArrayBuffer;
  mtlText?: string | null;
  options: ImportOptions;
}

export type ImportResponse =
  | { ok: true; result: ImportResult; ms: number }
  | { ok: false; error: string; protected?: boolean; modelName?: string };

export const MAX_FILE = 200 * 1024 * 1024; // N2

export function formatOf(name: string): 'b3d' | 'dae' | 'obj' | 'json' | null {
  const m = /\.(b3d|dae|obj|json)$/i.exec(name);
  return m ? (m[1].toLowerCase() as 'b3d' | 'dae' | 'obj' | 'json') : null;
}

export async function importFile(req: ImportRequest): Promise<ImportResponse> {
  const t0 = Date.now();
  const fmt = formatOf(req.fileName);
  try {
    if (!fmt) throw new Error('faqat .b3d, .dae, .obj yoki Bazis skripti .json fayli qabul qilinadi');
    if (req.bytes.byteLength > MAX_FILE) throw new Error('fayl hajmi 200 MB dan katta');
    let result: ImportResult;
    if (fmt === 'b3d') {
      result = finalizeB3d(await parseB3D(new Uint8Array(req.bytes), req.fileName));
    } else {
      const text = new TextDecoder('utf-8').decode(new Uint8Array(req.bytes));
      if (fmt === 'dae') result = finalizeDae(parseDAE(text, req.fileName, req.options.daeLevel), req.options);
      else if (fmt === 'obj') {
        const mtl = req.mtlText ? parseMTL(req.mtlText) : null;
        result = finalizeObj(parseOBJ(text, req.fileName, mtl), req.options, !!(mtl && mtl.size));
      } else result = finalizeJson(parseBazisJson(text, req.fileName));
    }
    return { ok: true, result, ms: Date.now() - t0 };
  } catch (e) {
    if (e instanceof ProtectedFileError) return { ok: false, error: 'protected', protected: true, modelName: e.modelName };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Worker orqali uzatishda nusxalanmasligi kerak bo'lgan buferlar. */
export function transferList(r: ImportResult): Transferable[] {
  const out: Transferable[] = [];
  const seen = new Set<ArrayBufferLike>();
  for (const p of r.parts) {
    for (const a of [p.positions, p.uvs]) {
      if (a && !seen.has(a.buffer)) { seen.add(a.buffer); out.push(a.buffer as ArrayBuffer); }
    }
  }
  if (r.thumb && !seen.has(r.thumb.buffer)) out.push(r.thumb.buffer as ArrayBuffer);
  return out;
}
