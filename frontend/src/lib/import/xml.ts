/*
 * Yengil XML o'qigich. Web Worker ichida DOMParser yo'q, shuning uchun COLLADA (.dae)
 * fayllarini shu o'qigich bilan daraxtga aylantiramiz. Faqat bizga kerakli qism:
 * elementlar, atributlar, matn, izohlar, CDATA. Nomlar maydoni prefiksi olib tashlanadi.
 */

export interface XEl {
  tag: string; // localName
  attrs: Record<string, string>;
  kids: XEl[];
  text: string;
  parent: XEl | null;
}

const ENT: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

export function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENT[e] ?? m;
  });
}

const ATTR_RE = /([^\s=/]+)\s*=\s*("([^"]*)"|'([^']*)')/g;

function localName(n: string): string {
  const i = n.indexOf(':');
  return i >= 0 ? n.slice(i + 1) : n;
}

export class XmlError extends Error {}

export function parseXML(src: string): XEl {
  const root: XEl = { tag: '#document', attrs: {}, kids: [], text: '', parent: null };
  let top = root;
  const n = src.length;
  let i = 0;
  // BOM
  if (src.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      if (top !== root) top.text += src.slice(i);
      break;
    }
    if (lt > i && top !== root && top.kids.length === 0) top.text += src.slice(i, lt);
    const c1 = src.charCodeAt(lt + 1);
    if (c1 === 33 /* ! */) {
      if (src.startsWith('<!--', lt)) {
        const e = src.indexOf('-->', lt + 4);
        i = e < 0 ? n : e + 3;
        continue;
      }
      if (src.startsWith('<![CDATA[', lt)) {
        const e = src.indexOf(']]>', lt + 9);
        const end = e < 0 ? n : e;
        if (top !== root) top.text += src.slice(lt + 9, end);
        i = e < 0 ? n : e + 3;
        continue;
      }
      // DOCTYPE va boshqalar (ichki subset qo'llanmaydi)
      const e = src.indexOf('>', lt);
      i = e < 0 ? n : e + 1;
      continue;
    }
    if (c1 === 63 /* ? */) {
      const e = src.indexOf('?>', lt);
      i = e < 0 ? n : e + 2;
      continue;
    }
    if (c1 === 47 /* / */) {
      const gt = src.indexOf('>', lt);
      if (gt < 0) throw new XmlError('yopuvchi teg tugamagan');
      const name = localName(src.slice(lt + 2, gt).trim());
      // mos ochuvchi tegni topguncha yuqoriga chiqamiz (buzilgan fayllarga yumshoq munosabat)
      let t: XEl | null = top;
      while (t && t !== root && t.tag !== name) t = t.parent;
      if (t && t !== root) {
        finishText(t);
        top = t.parent || root;
      }
      i = gt + 1;
      continue;
    }
    // ochuvchi teg: qo'shtirnoq ichidagi '>' ni hisobga olib oxirini topamiz
    let j = lt + 1;
    let q = 0;
    while (j < n) {
      const c = src.charCodeAt(j);
      if (q) {
        if (c === q) q = 0;
      } else if (c === 34 || c === 39) q = c;
      else if (c === 62) break;
      j++;
    }
    if (j >= n) throw new XmlError('teg tugamagan (fayl buzilgan yoki kesilgan)');
    const selfClose = src.charCodeAt(j - 1) === 47;
    const inner = src.slice(lt + 1, selfClose ? j - 1 : j);
    let k = 0;
    while (k < inner.length && !/\s/.test(inner[k])) k++;
    const el: XEl = { tag: localName(inner.slice(0, k)), attrs: {}, kids: [], text: '', parent: top };
    if (k < inner.length) {
      ATTR_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      const rest = inner.slice(k);
      while ((m = ATTR_RE.exec(rest))) {
        el.attrs[localName(m[1])] = decodeEntities(m[3] !== undefined ? m[3] : m[4] || '');
      }
    }
    top.kids.push(el);
    if (!selfClose) top = el;
    i = j + 1;
  }
  const doc = root.kids[0];
  if (!doc) throw new XmlError("XML ildiz elementi topilmadi");
  return doc;
}

function finishText(el: XEl) {
  if (el.kids.length) el.text = '';
  else if (el.text.indexOf('&') >= 0) el.text = decodeEntities(el.text);
}

export function kids(el: XEl | null | undefined, tag: string): XEl[] {
  if (!el) return [];
  const r: XEl[] = [];
  for (const k of el.kids) if (k.tag === tag) r.push(k);
  return r;
}

export function first(el: XEl | null | undefined, tag: string): XEl | null {
  if (!el) return null;
  for (const k of el.kids) if (k.tag === tag) return k;
  return null;
}

/** Bo'shliq bilan ajratilgan sonlarni tez o'qish. */
export function nums(el: XEl | null | undefined): Float64Array {
  if (!el || !el.text) return new Float64Array(0);
  return parseNumList(el.text);
}

export function parseNumList(s: string): Float64Array {
  const t = s.trim();
  if (!t) return new Float64Array(0);
  const parts = t.split(/\s+/);
  const out = new Float64Array(parts.length);
  for (let i = 0; i < parts.length; i++) out[i] = +parts[i];
  return out;
}

export function parseIntList(s: string): Int32Array {
  const t = s.trim();
  if (!t) return new Int32Array(0);
  const parts = t.split(/\s+/);
  const out = new Int32Array(parts.length);
  for (let i = 0; i < parts.length; i++) out[i] = parseInt(parts[i], 10);
  return out;
}
