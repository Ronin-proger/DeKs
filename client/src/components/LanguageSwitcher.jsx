import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, Globe } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import './LanguageSwitcher.css';

export default function LanguageSwitcher({ compact = false }) {
  const { lang, setLang, languages, t } = useLanguage();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const current = languages.find((item) => item.code === lang) || languages[0];

  useEffect(() => {
    if (!open) return undefined;

    const handleOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const pick = (code) => {
    setLang(code);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`lang-switcher ${compact ? 'compact' : ''} ${open ? 'open' : ''}`}
    >
      {!compact && <Globe size={14} className="lang-switcher-icon" />}
      <span className="lang-switcher-label">{t('lang')}</span>

      <div className="lang-dropdown">
        <button
          type="button"
          className="lang-dropdown-trigger"
          onClick={() => setOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={t('lang')}
        >
          <span>{current.label}</span>
          <ChevronDown size={14} className="lang-dropdown-chevron" />
        </button>

        {open && (
          <ul className="lang-dropdown-menu" role="listbox" aria-label={t('lang')}>
            {languages.map((item) => (
              <li key={item.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={item.code === lang}
                  className={`lang-dropdown-item ${item.code === lang ? 'active' : ''}`}
                  onClick={() => pick(item.code)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
