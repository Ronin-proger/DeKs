import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LANGUAGES, translations } from '../i18n/translations';

const LanguageContext = createContext(null);
const STORAGE_KEY = 'app_lang';
const LOCALES = { ru: 'ru-RU', en: 'en-US', tk: 'tk-TM' };

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return translations[saved] ? saved : 'ru';
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((code) => {
    if (translations[code]) setLangState(code);
  }, []);

  const t = useCallback((key, vars = {}) => {
    let text = translations[lang]?.[key] ?? translations.ru[key] ?? key;
    if (Array.isArray(text)) return text;
    if (typeof text !== 'string') return String(text);
    return text.replace(/\{\{(\w+)\}\}/g, (_, name) => (
      vars[name] !== undefined ? String(vars[name]) : `{{${name}}}`
    ));
  }, [lang]);

  const value = useMemo(() => ({
    lang,
    locale: LOCALES[lang] || LOCALES.ru,
    setLang,
    t,
    languages: LANGUAGES,
    months: translations[lang]?.months || translations.ru.months,
    weekdays: translations[lang]?.weekdays || translations.ru.weekdays,
  }), [lang, setLang, t]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
