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
  useEffect(() => {
    try {
      const saved = localStorage.getItem('bu_lang');
      if (saved === 'uz' || saved === 'ru') { current = saved; setLangState(saved); }
    } catch { /* bo'sh */ }
  }, []);
  const setLang = useCallback((l: Lang) => {
    current = l;
    setLangState(l);
    try { localStorage.setItem('bu_lang', l); } catch { /* bo'sh */ }
    document.documentElement.lang = l === 'uz' ? 'uz-Latn' : 'ru';
  }, []);
  // t har til almashganda yangi funksiya bo'lishi kerak, aks holda memo komponentlar yangilanmaydi
  const t = useCallback((key: DictKey | string, params?: Record<string, string | number>) => tr(key, params), [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  return <I18nCtx.Provider value={{ lang, setLang, t }}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
