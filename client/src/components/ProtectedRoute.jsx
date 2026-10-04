import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { apiFetch, parseApiResponse } from '../config/api';
import { clearDisplayUser, setDisplayUser } from '../utils/auth';

export default function ProtectedRoute({ children }) {
  const location = useLocation();
  const [status, setStatus] = useState('checking');

  useEffect(() => {
    let live = true;
    apiFetch('/api/me')
      .then(async (response) => {
        if (!live) return;
        if (!response.ok) {
          clearDisplayUser();
          setStatus('anon');
          return;
        }
        const data = await parseApiResponse(response);
        setDisplayUser(data.user);
        setStatus('ok');
      })
      .catch(() => {
        if (live) setStatus('anon');
      });
    return () => { live = false; };
  }, []);

  if (status === 'checking') return null;
  if (status === 'anon') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
