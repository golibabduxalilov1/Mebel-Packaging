'use client';
/* F4: interfeys tili (o'zbek lotin / rus). Tanlov foydalanuvchi profilida va brauzerda saqlanadi. */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { uz } from './uz';
import { ru } from './ru';

export type Lang = 'uz' | 'ru';
export type DictKey = keyof typeof uz;

const dicts: Record<Lang, Record<string, string>> = { uz, ru };
let current: Lang = 'uz';

/** React'dan tashqarida ham ishlaydi (store xabarlari uchun). */
export function tr(key: DictKey | string, params?: Record<string, string | number>): string {
  let s = dicts[current][key] ?? dicts.uz[key] ?? key;
  if (params) for (const k of Object.keys(params)) s = s.split('{' + k + '}').join(String(params[k]));
  return s;
}

interface Ctx { lang: Lang; setLang(l: Lang): void; t: typeof tr }
const I18nCtx = createContext<Ctx>({ lang: 'uz', setLang: () => undefined, t: tr });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('uz');
  // Saqlangan til qo'llanmaguncha bolalar chizilmaydi: aks holda Suspense ichidagi qismlar server HTML (uz) bilan mos kelmay qoladi (hydration xatosi).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bu_lang');
      if (saved === 'uz' || saved === 'ru') { current = saved; setLangState(saved); document.documentElement.lang = saved === 'uz' ? 'uz-Latn' : 'ru'; }
    } catch { /* bo'sh */ }
    setReady(true);
  }, []);
  const setLang = useCallback((l: Lang) => {
    current = l;
    setLangState(l);
    try { localStorage.setItem('bu_lang', l); } catch { /* bo'sh */ }
    document.documentElement.lang = l === 'uz' ? 'uz-Latn' : 'ru';
  }, []);
  // t har til almashganda yangi funksiya bo'lishi kerak, aks holda memo komponentlar yangilanmaydi
  const t = useCallback((key: DictKey | string, params?: Record<string, string | number>) => tr(key, params), [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{ready ? children : null}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
