import React from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import './SiteFooter.css';

export default function SiteFooter({ variant = 'default', className = '' }) {
  const { t } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <footer className={`site-footer site-footer-${variant} ${className}`.trim()}>
      <div className="site-footer-inner">
        <div className="footer-brand">
          <strong>DeKs</strong>
          <span>{t('footer_tagline')}</span>
        </div>
        <div className="footer-links">
          <Link to="/about">{t('nav_about')}</Link>
          <Link to="/login">{t('nav_login')}</Link>
        </div>
        <p className="footer-copy">{t('footer_copy', { year })}</p>
      </div>
    </footer>
  );
}
