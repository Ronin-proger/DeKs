// vite proxy in dev; direct URL as fallback
export const API_BASE = import.meta.env.VITE_API_URL || '';

export const API_DIRECT = 'http://127.0.0.1:3001';

export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      credentials: 'include',
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function apiFetch(path, options = {}, timeoutMs = 15000) {
  const urls = API_BASE ? [`${API_BASE}${path}`] : [path];

  let lastError;
  for (const url of urls) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      return response;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

export async function parseApiResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data.detail || data.message || `Ошибка сервера (${response.status})`;
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return data;
}
