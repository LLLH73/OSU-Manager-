import { getConfig } from './config.js';
import type { UiLanguage } from './types.js';

export function getServerLang(): UiLanguage {
  return getConfig().language === 'en' ? 'en' : 'zh';
}

export function isServerEn(): boolean {
  return getServerLang() === 'en';
}

export function st(zh: string, en: string): string {
  return isServerEn() ? en : zh;
}
