import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import { PublicLayout, AppLayout, FullscreenLayout } from './components/PageLayout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AboutPage from './pages/AboutPage';
import ChatPage from './pages/ChatPage';
import MessengerPage from './pages/MessengerPage';
import NotFoundPage from './pages/NotFoundPage';
import DashboardPage from './pages/DashboardPage';
import ObsidianPage from './pages/ObsidianPage';
import { isAuthenticated } from './utils/auth';
import './App.css';

function RootRedirect() {
  return <Navigate to="/login" replace />;
}

function AboutRoute() {
  return isAuthenticated()
    ? <AppLayout><AboutPage /></AppLayout>
    : <PublicLayout><AboutPage /></PublicLayout>;
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />

      <Route path="/login" element={<PublicLayout noScroll><LoginPage /></PublicLayout>} />
      <Route path="/register" element={<PublicLayout noScroll><RegisterPage /></PublicLayout>} />
      <Route path="/about" element={<AboutRoute />} />

      <Route path="/dashboard" element={
        <ProtectedRoute>
          <FullscreenLayout><DashboardPage /></FullscreenLayout>
        </ProtectedRoute>
      } />
      <Route path="/obsidian" element={
        <ProtectedRoute>
          <FullscreenLayout><ObsidianPage /></FullscreenLayout>
        </ProtectedRoute>
      } />
      <Route path="/chat" element={
        <ProtectedRoute>
          <FullscreenLayout><ChatPage /></FullscreenLayout>
        </ProtectedRoute>
      } />
      <Route path="/messenger" element={
        <ProtectedRoute>
          <AppLayout><MessengerPage /></AppLayout>
        </ProtectedRoute>
      } />

      <Route path="/home" element={<Navigate to="/login" replace />} />
      <Route path="/intelligence" element={<Navigate to="/obsidian" replace />} />
      <Route path="*" element={<PublicLayout><NotFoundPage /></PublicLayout>} />
    </Routes>
  );
}

export default App;
