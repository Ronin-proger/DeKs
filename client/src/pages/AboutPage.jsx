import React from 'react';
import { Link } from 'react-router-dom';
import { LayoutDashboard, LogIn, UserPlus } from 'lucide-react';
import { isAuthenticated } from '../utils/auth';
import { useLanguage } from '../context/LanguageContext';

const AboutPage = () => {
  const { t } = useLanguage();
  const authed = isAuthenticated();

  return (
    <div className="about-page">
      <div className="about-content">
        <h1>{t('nav_about')}</h1>

        <div className="about-card">
          <h2>{t('login_title')}</h2>
          <p>{t('about_subtitle')}</p>

          <div className="about-section">
            <h3>{t('about_purpose_title')}</h3>
            <p>{t('about_purpose_text')}</p>
          </div>

          <div className="about-section">
            <h3>{t('about_features_title')}</h3>
            <ul>
              <li>{t('about_feat_1')}</li>
              <li>{t('about_feat_2')}</li>
              <li>{t('about_feat_3')}</li>
              <li>{t('about_feat_4')}</li>
              <li>{t('about_feat_5')}</li>
              <li>{t('about_feat_6')}</li>
            </ul>
          </div>

          <div className="about-section">
            <h3>{t('about_tech_title')}</h3>
            <ul>
              <li>React, Vite</li>
              <li>Python, FastAPI, SQLite</li>
              <li>Хранилище знаний и синхронизация заметок</li>
              <li>Локальная языковая модель, RAG, семантические связи</li>
              <li>Трёхмерный граф знаний</li>
            </ul>
          </div>

          <div className="about-section">
            <h3>{t('about_contacts_title')}</h3>
            <p>{t('about_contacts_text')}</p>
          </div>

          <div className="about-actions">
            {authed ? (
              <Link to="/dashboard" className="btn about-action-btn">
                <LayoutDashboard size={18} /> {t('nav_dashboard')}
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn about-action-btn">
                  <LogIn size={18} /> {t('nav_login')}
                </Link>
                <Link to="/register" className="btn about-action-btn about-action-secondary">
                  <UserPlus size={18} /> {t('nav_register')}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
