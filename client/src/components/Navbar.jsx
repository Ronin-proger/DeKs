import React, { useEffect, useState } from 'react';

import { Link, NavLink, useNavigate } from 'react-router-dom';

import {

  LogOut,

  LayoutDashboard,

  Bot,

  BookOpen,

  MessageCircle,

  Info,

  Menu,

  X,

} from 'lucide-react';

import { getStoredUser, isAuthenticated, logout } from '../utils/auth';

import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmContext';

import LanguageSwitcher from './LanguageSwitcher';

import './Navbar.css';



function useMobileNav() {

  const [open, setOpen] = useState(false);



  useEffect(() => {

    document.body.classList.toggle('nav-menu-open', open);

    return () => document.body.classList.remove('nav-menu-open');

  }, [open]);



  useEffect(() => {

    const onResize = () => {

      if (window.innerWidth > 900) setOpen(false);

    };

    window.addEventListener('resize', onResize);

    return () => window.removeEventListener('resize', onResize);

  }, []);



  return {

    open,

    close: () => setOpen(false),

    toggle: () => setOpen((value) => !value),

  };

}



function NavBurger({ open, onToggle, t }) {

  return (

    <button

      type="button"

      className="nav-burger"

      onClick={onToggle}

      aria-expanded={open}

      aria-label={open ? t('nav_menu_close') : t('nav_menu_open')}

    >

      {open ? <X size={22} /> : <Menu size={22} />}

    </button>

  );

}



export function PublicNavbar() {

  const { t } = useLanguage();

  const { open, close, toggle } = useMobileNav();



  return (

    <header className="site-nav site-nav-public">

      <Link to="/about" className="nav-logo" onClick={close}>

        De<span>Ks</span>

      </Link>



      <NavBurger open={open} onToggle={toggle} t={t} />



      {open && <button type="button" className="nav-overlay" aria-label={t('nav_menu_close')} onClick={close} />}



      <nav className={`nav-links ${open ? 'is-open' : ''}`}>

        <NavLink to="/about" className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>

          <Info size={15} /> {t('nav_about')}

        </NavLink>

        <NavLink to="/login" className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>{t('nav_login')}</NavLink>

        <NavLink to="/register" className="nav-cta" onClick={close}>{t('nav_register')}</NavLink>

        <LanguageSwitcher compact />

      </nav>

    </header>

  );

}



export function AppNavbar() {

  const navigate = useNavigate();

  const user = getStoredUser();

  const { t } = useLanguage();
  const confirm = useConfirm();

  const { open, close, toggle } = useMobileNav();

  const handleLogout = async () => {
    const ok = await confirm({
      message: t('dash_logout_confirm'),
      confirmText: t('nav_logout'),
    });
    if (!ok) return;
    close();
    logout();
    navigate('/login');
  };



  return (

    <header className="site-nav site-nav-app">

      <Link to="/dashboard" className="nav-logo" onClick={close}>

        De<span>Ks</span>

      </Link>



      <NavBurger open={open} onToggle={toggle} t={t} />



      {open && <button type="button" className="nav-overlay" aria-label={t('nav_menu_close')} onClick={close} />}



      <nav className={`nav-links ${open ? 'is-open' : ''}`}>

        <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>

          <LayoutDashboard size={15} /> {t('nav_dashboard')}

        </NavLink>

        <NavLink to="/obsidian" className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>

          <BookOpen size={15} /> {t('nav_obsidian')}

        </NavLink>

        <NavLink to="/messenger" className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>

          <MessageCircle size={15} /> {t('nav_messenger')}

        </NavLink>

        <NavLink to="/about" className={({ isActive }) => isActive ? 'active' : ''} onClick={close}>

          <Info size={15} /> {t('nav_about')}

        </NavLink>

        <LanguageSwitcher compact />

      </nav>



      <div className="nav-user">

        <span className="nav-user-name">{user?.fullName?.split(' ')[0] || t('nav_user')}</span>

        <button type="button" className="nav-logout" onClick={handleLogout} title={t('nav_logout')}>

          <LogOut size={16} />

        </button>

      </div>

    </header>

  );

}

