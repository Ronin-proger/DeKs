import React, { useEffect, useState } from 'react';
import { MessageCircle, User, X } from 'lucide-react';
import { API_BASE, API_DIRECT, apiFetch, parseApiResponse } from '../config/api';
import { useLanguage } from '../context/LanguageContext';
import './UserProfileModal.css';

function resolveFileUrl(url) {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE || API_DIRECT}${url}`;
}

function formatProfileDate(iso, locale, fallback) {
  if (!iso) return fallback;
  try {
    return new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return fallback;
  }
}

export default function UserProfileModal({ userId, currentUserId, onClose, onMessage }) {
  const { t, locale } = useLanguage();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return undefined;

    let cancelled = false;
    setLoading(true);
    setError('');
    setProfile(null);

    (async () => {
      try {
        const response = await apiFetch(`/api/profile/${userId}`);
        const data = await parseApiResponse(response);
        if (cancelled) return;
        if (data.success && data.user) {
          setProfile(data.user);
        } else {
          setError(t('profile_load_fail'));
        }
      } catch (err) {
        if (!cancelled) setError(err.message || t('profile_load_fail'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId, t]);

  if (!userId) return null;

  const isSelf = Number(userId) === Number(currentUserId);
  const empty = t('profile_not_set');

  return (
    <div className="user-profile-overlay" onClick={onClose} role="presentation">
      <div
        className="user-profile-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-profile-title"
      >
        <header className="user-profile-header">
          <h2 id="user-profile-title">{t('profile_view_title')}</h2>
          <button type="button" className="user-profile-close" onClick={onClose} aria-label={t('action_close')}>
            <X size={20} />
          </button>
        </header>

        <div className="user-profile-body">
          {loading ? (
            <p className="user-profile-status">{t('profile_loading')}</p>
          ) : error ? (
            <p className="user-profile-status error">{error}</p>
          ) : profile ? (
            <>
              <div className="user-profile-avatar">
                {profile.avatarUrl ? (
                  <img src={resolveFileUrl(profile.avatarUrl)} alt="" />
                ) : (
                  <User size={40} />
                )}
              </div>

              <h3 className="user-profile-name">{profile.fullName || t('common_dash')}</h3>
              <p className="user-profile-email">{profile.email || t('common_dash')}</p>

              <dl className="user-profile-details">
                <div className="user-profile-row">
                  <dt>{t('profile_position')}</dt>
                  <dd>{profile.position?.trim() || empty}</dd>
                </div>
                <div className="user-profile-row">
                  <dt>{t('profile_birthdate')}</dt>
                  <dd>
                    {profile.birthDate
                      ? formatProfileDate(profile.birthDate, locale, empty)
                      : empty}
                  </dd>
                </div>
                <div className="user-profile-row">
                  <dt>{t('profile_registered')}</dt>
                  <dd>{formatProfileDate(profile.createdAt, locale, empty)}</dd>
                </div>
              </dl>

              {!isSelf && onMessage && (
                <button
                  type="button"
                  className="user-profile-message-btn"
                  onClick={() => onMessage(profile)}
                >
                  <MessageCircle size={16} /> {t('profile_write_message')}
                </button>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
