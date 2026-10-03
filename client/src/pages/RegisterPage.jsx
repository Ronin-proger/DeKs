import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, parseApiResponse } from '../config/api';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';

function RegisterPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const { t } = useLanguage();

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (password !== confirmPassword) {
      toast.error(t('toast_passwords_mismatch'));
      return;
    }

    setLoading(true);

    try {
      const response = await apiFetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password }),
      });

      const data = await parseApiResponse(response);

      if (data.success) {
        toast.success(t('toast_register_ok'));
        setFullName('');
        setEmail('');
        setPassword('');
        setConfirmPassword('');
      } else {
        toast.error(data.message || t('toast_register_fail'));
      }
    } catch (error) {
      toast.error(error.message || t('toast_connection_error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-wrapper">
      <div className="login-left-half">
        <div className="login-container">
          <div className="logo">
            <h1>{t('register_title')}</h1>
            <p>{t('register_subtitle')}</p>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="input-group">
              <label>
                <i className="fas fa-user" style={{ marginRight: '6px' }}></i>
                {t('full_name')}
              </label>
              <input
                type="text"
                placeholder={t('auth_name_placeholder')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>

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
                minLength="6"
              />
            </div>

            <div className="input-group">
              <label>
                <i className="fas fa-check-circle" style={{ marginRight: '6px' }}></i>
                {t('confirm_password')}
              </label>
              <input
                type="password"
                placeholder={t('auth_password_placeholder')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength="6"
              />
            </div>

            <button type="submit" className="btn" disabled={loading}>
              <i className="fas fa-user-plus" style={{ marginRight: '8px' }}></i>
              {loading ? t('register_loading') : t('register_btn')}
            </button>
          </form>

          <div className="register-link">
            {t('have_account')} <Link to="/login">{t('login_link')}</Link>
          </div>
        </div>
      </div>

      <div className="login-right-half">
        <img src="/glavvterter.jpg" alt="" />
      </div>
    </div>
  );
}

export default RegisterPage;
