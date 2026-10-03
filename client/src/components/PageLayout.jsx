import React from 'react';
import { PublicNavbar, AppNavbar } from './Navbar';
import SiteFooter from './SiteFooter';
import './PageLayout.css';

export function PublicLayout({ children, footer = true, noScroll = false }) {
  return (
    <div className={`page-layout page-layout-public${noScroll ? ' page-layout-fixed' : ''}`}>
      <PublicNavbar />
      <main className="page-layout-main">{children}</main>
      {footer && <SiteFooter />}
    </div>
  );
}

export function AppLayout({ children, footer = true, minimalFooter = false }) {
  return (
    <div className="page-layout page-layout-app">
      <AppNavbar />
      <main className="page-layout-main">{children}</main>
      {footer && <SiteFooter variant={minimalFooter ? 'minimal' : 'default'} />}
    </div>
  );
}

export function FullscreenLayout({ children }) {
  return <div className="page-layout page-layout-full">{children}</div>;
}
