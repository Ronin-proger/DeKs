import React from 'react';
import { Link } from 'react-router-dom';
import { isAuthenticated } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext';

function NotFoundPage() {
  const { t } = useLanguage();
  const home = isAuthenticated() ? '/dashboard' : '/login';

  return (
    <div className="not-found-page">
      <h1>404</h1>
      <h2>{t('notfound_title')}</h2>
      <p>{t('notfound_desc')}</p>
      <Link to={home} className="btn">{t('notfound_home')}</Link>
      <Link to="/about" className="btn btn-ghost" style={{ marginLeft: 12 }}>{t('nav_about')}</Link>
    </div>
  );
}

export default NotFoundPage;
