import { apiFetch } from '../config/api';

const DISPLAY_KEY = 'user';

export function getStoredUser() {
  return getDisplayUser();
}

export function getDisplayUser() {
  try {
    const raw = localStorage.getItem(DISPLAY_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setDisplayUser(user) {
  if (!user) {
    localStorage.removeItem(DISPLAY_KEY);
    return;
  }
  localStorage.setItem(DISPLAY_KEY, JSON.stringify({
    fullName: user.fullName || '',
    position: user.position || '',
    avatarUrl: user.avatarUrl || null,
  }));
}

export function clearDisplayUser() {
  localStorage.removeItem(DISPLAY_KEY);
}

export function isAuthenticated() {
  return Boolean(getDisplayUser()?.fullName);
}

export function logout() {
  clearDisplayUser();
  apiFetch('/api/logout', { method: 'POST' }).catch(() => {});
}
