import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { apiFetch, parseApiResponse } from '../config/api';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useLanguage();

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!email.includes('@')) {
      toast.error(t('toast_invalid_email'));
      return;
    }

    if (!password.trim()) {
      toast.error(t('toast_enter_password'));
      return;
    }

    setIsLoading(true);

    try {
      const response = await apiFetch('/api/check-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          password: password.trim(),
        }),
      });

      const data = await parseApiResponse(response);

      if (data.success) {
        localStorage.setItem('user', JSON.stringify(data.user));
        toast.success(t('toast_welcome'));
        setTimeout(() => navigate('/dashboard'), 400);
      } else {
        toast.error(data.message || t('toast_wrong_credentials'));
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        toast.error(t('toast_server_down'));
      } else {
        toast.error(error.message || t('toast_connection_error'));
      }
      console.error('Login error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-left-half">
        <div className="login-container">
          <div className="logo">
            <h1>{t('login_title')}</h1>
            <p>{t('login_subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>
                <i className="fas fa-envelope" style={{ marginRight: '6px' }}></i>
                {t('email')}
              </label>
              <input
                type="email"
                placeholder={t('auth_email_placeholder')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <div className="input-group">
              <label>
                <i className="fas fa-lock" style={{ marginRight: '6px' }}></i>
                {t('password')}
              </label>
              <input
                type="password"
                placeholder={t('auth_password_placeholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>

            <button type="submit" className="btn" disabled={isLoading}>
              <i className="fas fa-sign-in-alt" style={{ marginRight: '8px' }}></i>
              {isLoading ? t('login_loading') : t('login_btn')}
            </button>
          </form>

          <div className="register-link">
            {t('no_account')} <Link to="/register">{t('register_link')}</Link>
          </div>
        </div>
      </div>

      <div className="login-right-half">
        <img src="/portal-hero.jpg" alt="" />
      </div>
    </div>
  );
};

export default LoginPage;
