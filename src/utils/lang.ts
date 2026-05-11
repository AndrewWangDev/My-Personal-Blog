import { ui, defaultLang } from '../i18n/ui';
import type { AstroGlobal } from 'astro';

export function getLangFromRequest(Astro: AstroGlobal | any): string {
  // 1. Try Cookie
  const cookieLang = Astro.cookies.get('lang')?.value;
  if (cookieLang) return cookieLang;

  // 2. Try Accept-Language
  const acceptLanguage = Astro.request.headers.get('accept-language') || '';
  const match = acceptLanguage.match(/zh|ja|de/i);
  if (match) {
    const code = match[0].toLowerCase();
    if (code === 'zh') {
      return acceptLanguage.toLowerCase().includes('zh-tw') || acceptLanguage.toLowerCase().includes('zh-hk') ? 'zh-tw' : 'zh';
    }
    return code;
  }

  // 3. Default to English (covers bots and other unhandled languages)
  return 'en';
}

export function getTranslations(lang: string) {
  const target = (ui as any)[lang] || ui[defaultLang];
  const fallback = ui[defaultLang];
  return new Proxy(target, {
    get(obj, prop: string) {
      if (prop in obj && obj[prop] !== undefined && obj[prop] !== '') {
        return obj[prop];
      }
      return (fallback as any)[prop] ?? prop;
    }
  });
}

