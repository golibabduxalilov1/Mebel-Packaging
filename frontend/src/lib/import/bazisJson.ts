/*
 * Bazis skripti yozgan JSON (TZ 3.5, F7a). Sxema: bazis-script/README.md.
 * Skriptda yo'q qiymat null bo'ladi va jadvalda "noma'lum" ko'rinadi.
 * pos (GMin/GMax) bo'lsa detal 3D da quti sifatida ko'rsatiladi, aks holda faqat jadvalda.
 */
import type { Part, PartKind, Vec3 } from '../types';
import { rgbHex } from './geom';

interface JsonPart {
  id?: string | number;
  name?: string | null;
  artPos?: string | null;
  designation?: string | null;
  material?: string | null;
  color?: string | number[] | null;
  length?: number | null;
  width?: number | null;
  thickness?: number | null;
  type?: string | null;
  product?: string | null;
  butts?: { material?: string | null; thickness?: number | null; sign?: string | null }[] | null;
  bent?: boolean | null;
  hidden?: boolean | null;
  pos?: { min: number[]; max: number[] } | null;
}

interface JsonFile {
  schemaVersion?: number;
  scriptVersion?: string;
  bazisApiVersion?: number | string | null;
  model?: string;
  unit?: string;
  date?: string;
  parts?: JsonPart[];
}

type RawPart = Omit<Part, 'bbox' | 'obb' | 'dims' | 'area' | 'volume' | 'color'> & { color?: string; jsonDims: { L: number | null; W: number | null; T: number | null } };

const numOrNull = (v: unknown): number | null => (typeof v === 'number' && isFinite(v) ? v : null);

/** "#RGB", "#RRGGBB" yoki [r,g,b] (0..1 yoki 0..255) -> "#rrggbb"; boshqasi undefined. */
function jsonColor(c: unknown): string | undefined {
  if (typeof c === 'string') {
    const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
    if (!m) return undefined;
    const h = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
    return '#' + h.toLowerCase();
  }
  if (Array.isArray(c) && c.length >= 3 && c.slice(0, 3).every((x) => typeof x === 'number' && isFinite(x))) {
    const k = c.slice(0, 3).some((x) => x > 1) ? 255 : 1;
    return rgbHex(c.slice(0, 3).map((x) => x / k));
  }
  return undefined;
}

export function parseBazisJson(text: string, fileName: string) {
  let data: JsonFile;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    throw new Error("JSON fayl o'qilmadi (buzilgan)");
  }
  if (!data || !Array.isArray(data.parts)) throw new Error('bu Bazis skripti JSON fayli emas ("parts" topilmadi)');
  if (data.unit && data.unit !== 'mm') throw new Error('JSON birligi "' + data.unit + '", faqat mm qo\'llanadi');
  const warnings: string[] = [];
  const parts: RawPart[] = data.parts.map((p, i) => {
    const t = (p.type || '').toLowerCase();
    const kind: PartKind = t === 'hardware' || t === 'furnitura' ? 'hardware' : t === 'profile' || t === 'profil' ? 'profile' : 'panel';
    const L = numOrNull(p.length), W = numOrNull(p.width), T = numOrNull(p.thickness);
    const butts = Array.isArray(p.butts) ? p.butts : null;
    const edgeText = butts && butts.length
      ? Array.from(butts.reduce((m, b) => { const k = (b.sign || b.material || '?') + (b.thickness != null ? ' ' + b.thickness : ''); m.set(k, (m.get(k) || 0) + 1); return m; }, new Map<string, number>()))
          .map(([k, n]) => k + ' ×' + n).join('; ')
      : '';
    const hasPos = p.pos && Array.isArray(p.pos.min) && Array.isArray(p.pos.max) && p.pos.min.length === 3 && p.pos.max.length === 3;
    const name = p.name || 'Detal ' + (i + 1);
    const notes: string[] = [];
    if (p.bent) notes.push('Egilgan panel (Bazis "Bent" belgisi). O\'lcham GSize bo\'yicha olingan.');
    if (p.hidden) notes.push("Bazis'da yashirin detal.");
    return {
      id: String(p.id ?? 'j' + (i + 1)),
      name,
      baseName: name,
      material: p.material || 'Materialsiz',
      color: jsonColor(p.color),
      kind,
      geom: hasPos ? 'box' : 'none',
      group: p.product || '',
      note: notes.join(' '),
      boxMin: hasPos ? (p.pos!.min as Vec3) : undefined,
      boxMax: hasPos ? (p.pos!.max as Vec3) : undefined,
      artPos: p.artPos || '',
      des: p.designation || '',
      edgeText,
      bent: !!p.bent,
      product: p.product || '',
      jsonDims: { L, W, T },
    };
  });
  if (!parts.length) throw new Error("JSON faylda detal yo'q");
  if (!parts.some((p) => p.geom === 'box')) warnings.push("JSON faylda 3D joylashuv (pos) yo'q: detallar faqat jadvalda ko'rinadi. 3D uchun .b3d, .dae yoki .obj ni oching.");
  return {
    name: data.model || fileName.replace(/\.json$/i, ''),
    source: 'Bazis skripti ' + (data.scriptVersion || '') + (data.bazisApiVersion ? ', API ' + data.bazisApiVersion : ''),
    parts,
    warnings,
    stats: { schemaVersion: data.schemaVersion ?? 0, date: data.date || '' },
  };
}
