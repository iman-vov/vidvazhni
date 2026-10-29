// UI translations: flat key → text tables from data/i18n, `{name}` placeholders.
// The language is remembered per device; a missing key shows the key itself, so gaps are visible.

import { LANGS, loadTranslations, type Lang } from '../rules/load';

const tables = loadTranslations();
const STORAGE_KEY = 'vidvazhni.lang';

let lang: Lang = readStoredLang();
const listeners = new Set<() => void>();

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && (LANGS as readonly string[]).includes(v)) return v as Lang;
  } catch {
    // storage blocked: default language
  }
  return 'uk';
}

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  document.documentElement.lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore
  }
  for (const cb of listeners) cb();
}

export function onLangChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function has(key: string): boolean {
  return key in tables[lang];
}

const pluralRules = new Map<Lang, Intl.PluralRules>();

/** The word form for count `n`: `forms` = one|few|many in uk (1 карту, 2 карти, 5 карт), one|other in de/en. */
export function plural(n: number, forms: readonly string[], language: Lang = lang): string {
  let rules = pluralRules.get(language);
  if (!rules) pluralRules.set(language, (rules = new Intl.PluralRules(language)));
  const cat = rules.select(n);
  const i = cat === 'one' ? 0 : forms.length < 3 || cat === 'few' || cat === 'other' ? 1 : 2;
  return forms[Math.min(i, forms.length - 1)] ?? '';
}

/** `{name}` puts a param in; `{name|form|form|form}` puts in the word form for that number (plural). */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const text = tables[lang][key] ?? tables.uk[key] ?? key;
  return text
    .replace(/\{(\w+)\|([^{}]+)\}/g, (m, name: string, forms: string) => (name in params ? plural(Number(params[name]), forms.split('|')) : m))
    .replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

export { LANGS, type Lang };
