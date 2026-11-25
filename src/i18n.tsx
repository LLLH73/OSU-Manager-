import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UiLanguage } from './types';

export type { UiLanguage };

export const UI_LANGUAGE_STORAGE_KEY = 'osu_mgr_lang';

function normalizeLang(val: unknown): UiLanguage {
  return val === 'en' ? 'en' : 'zh';
}

function readStoredLang(): UiLanguage {
  if (typeof window === 'undefined') return 'zh';
  try {
    return normalizeLang(window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY));
  } catch {
    return 'zh';
  }
}

let activeLang: UiLanguage = readStoredLang();
const listeners = new Set<(lang: UiLanguage) => void>();

function applyDomLang(lang: UiLanguage): void {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
  }
}

applyDomLang(activeLang);

export function getCurrentLang(): UiLanguage {
  return activeLang;
}

export function setGlobalLang(next: UiLanguage): void {
  const normalized = normalizeLang(next);
  applyDomLang(normalized);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, normalized);
    } catch {
      // Ignore storage error
    }
  }
  if (normalized === activeLang) return;
  activeLang = normalized;
  for (const listener of listeners) {
    listener(normalized);
  }
}

export function tx(zh: string, en: string, lang: UiLanguage = activeLang): string {
  return lang === 'en' ? en : zh;
}

export interface I18nContextValue {
  lang: UiLanguage;
  isEn: boolean;
  setLang: (next: UiLanguage) => void;
  t: (zh: string, en: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: activeLang,
  isEn: activeLang === 'en',
  setLang: setGlobalLang,
  t: (zh, en) => tx(zh, en, activeLang),
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<UiLanguage>(() => activeLang);

  useEffect(() => {
    const onChange = (next: UiLanguage) => setLangState(next);
    listeners.add(onChange);

    const onStorage = (e: StorageEvent) => {
      if (e.key === UI_LANGUAGE_STORAGE_KEY) {
        const next = normalizeLang(e.newValue);
        if (next !== activeLang) {
          activeLang = next;
          applyDomLang(next);
          for (const listener of listeners) {
            listener(next);
          }
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const setLang = useCallback((next: UiLanguage) => {
    setGlobalLang(next);
  }, []);

  const t = useCallback(
    (zh: string, en: string) => (lang === 'en' ? en : zh),
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, isEn: lang === 'en', setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
