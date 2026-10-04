import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Users, Link2, FileText, Database, MessageCircle, 
  Bot, Calendar, Image, Search, User, Plus, 
  X, Upload, Eye, Clock, CheckCircle, Send,
  BookOpen, Bell, Settings, LogOut,
  Download, Trash2, Edit3, Globe, Code,
  BarChart3, TrendingUp, Layers, Activity,
  Zap, Home, Folder,
  RefreshCw, AlertCircle, Copy, ExternalLink,
  ChevronLeft, ChevronRight, Flag
} from 'lucide-react';
import './DashboardPage.css';
import SiteFooter from '../components/SiteFooter';
import { API_BASE, API_DIRECT, apiFetch, parseApiResponse } from '../config/api';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import { logout } from '../utils/auth';
import { searchDashboard, SEARCH_CATEGORY_KEYS } from '../utils/dashboardSearch';
import LanguageSwitcher from '../components/LanguageSwitcher';
import MarkdownMessage from '../components/MarkdownMessage';
import SalesLineChart, { computeSalesStats, formatSalesValue } from '../components/SalesLineChart';
import SalesChartEditor from '../components/SalesChartEditor';

const LINK_ICON_OPTIONS = [
  { id: 'link', Icon: Link2 },
  { id: 'palette', Icon: Image },
  { id: 'list', Icon: Layers },
  { id: 'file', Icon: FileText },
  { id: 'chat', Icon: MessageCircle },
  { id: 'chart', Icon: BarChart3 },
  { id: 'globe', Icon: Globe },
  { id: 'zap', Icon: Zap },
  { id: 'folder', Icon: Folder },
  { id: 'tool', Icon: Settings },
];

const LEGACY_LINK_ICONS = {
  '\u{1F517}': 'link',
  '\u{1F3A8}': 'palette',
  '\u{1F4CB}': 'list',
  '\u{1F4C4}': 'file',
  '\u{1F4AC}': 'chat',
  '\u{1F4CA}': 'chart',
  '\u{1F310}': 'globe',
  '\u26A1': 'zap',
  '\u{1F4C1}': 'folder',
  '\u{1F6E0}\uFE0F': 'tool',
};

const normalizeLinkIcon = (icon) => LEGACY_LINK_ICONS[icon] || icon || 'link';

const firstName = (fullName = '', fallback = '') => fullName.trim().split(/\s+/)[0] || fallback;

const LinkIconView = ({ icon, size = 16, className = '' }) => {
  const id = normalizeLinkIcon(icon);
  const option = LINK_ICON_OPTIONS.find((item) => item.id === id) || LINK_ICON_OPTIONS[0];
  const Icon = option.Icon;
  return <Icon size={size} className={className} />;
};

const pad2 = (n) => String(n).padStart(2, '0');
const toDateKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const buildMonthGrid = (year, month) => {
  const startPad = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startPad; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const resolveFileUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  return `${API_BASE || API_DIRECT}${url}`;
};

const loadStoredUser = () => {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const PARSER_HISTORY_KEY = 'parserHistory';

const loadParserHistory = () => {
  try {
    const raw = localStorage.getItem(PARSER_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveParserHistory = (entry) => {
  const prev = loadParserHistory();
  const next = [entry, ...prev.filter((item) => item.url !== entry.url)].slice(0, 5);
  localStorage.setItem(PARSER_HISTORY_KEY, JSON.stringify(next));
  return next;
};

function DashboardModal({ title, children, width = '520px', onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" style={{ maxWidth: width }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
}

const DashboardPage = () => {
  const navigate = useNavigate();
  const { t, months, weekdays, locale, lang } = useLanguage();
  const confirm = useConfirm();
  const toast = useToast();

  const formatNotifTime = useCallback((iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return t('time_just_now');
    if (min < 60) return t('time_mins_ago_short', { min });
    const hours = Math.floor(min / 60);
    if (hours < 24) return t('time_hours_ago_short', { hrs: hours });
    return new Date(iso).toLocaleDateString(locale);
  }, [t, locale]);

  const formatDate = useCallback((iso) => {
    if (!iso) return t('common_dash');
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(locale);
  }, [t, locale]);

  const shortName = useCallback((fullName = '') => {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return t('common_user');
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[1][0]}.`;
  }, [t]);
  
  const [activeModal, setActiveModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [files, setFiles] = useState([]);
  const [links, setLinks] = useState([]);
  const [events, setEvents] = useState([]);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkIcon, setNewLinkIcon] = useState('link');
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskDue, setNewTaskDue] = useState('');
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventNote, setNewEventNote] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [fileUploading, setFileUploading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [user, setUser] = useState(() => loadStoredUser());
  const [profileForm, setProfileForm] = useState({ position: '', birthDate: '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [profileMessageType, setProfileMessageType] = useState('');
  const fileInputRef = useRef(null);
  const avatarInputRef = useRef(null);
  const [parserUrl, setParserUrl] = useState('');
  const [parserMode, setParserMode] = useState('auto');
  const [parserLoading, setParserLoading] = useState(false);
  const [parserError, setParserError] = useState('');
  const [parserResult, setParserResult] = useState(null);
  const [parserTab, setParserTab] = useState('overview');
  const [parserHistory, setParserHistory] = useState(() => loadParserHistory());
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [chatNotifications, setChatNotifications] = useState([]);
  const [salesPoints, setSalesPoints] = useState([]);
  const [salesDraft, setSalesDraft] = useState([]);
  const [salesSaving, setSalesSaving] = useState(false);
  const [salesMessage, setSalesMessage] = useState('');
  const [salesMessageType, setSalesMessageType] = useState('');

  const salesStats = useMemo(() => computeSalesStats(salesPoints), [salesPoints]);

  useEffect(() => {
    setChatMessages((prev) => {
      const onlyGreeting = prev.length === 0
        || (prev.length === 1 && prev[0].role === 'assistant' && !prev.some((m) => m.role === 'user'));
      if (onlyGreeting) {
        return [{ role: 'assistant', content: t('ai_greeting') }];
      }
      return prev;
    });
  }, [lang, t]);

  useEffect(() => {
    if (!user?.id) {
      navigate('/login');
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user?.id) return undefined;

    let cancelled = false;

    const loadWorkspace = async () => {
      try {
        const response = await apiFetch(`/api/workspace/${user.id}`);
        const data = await parseApiResponse(response);
        if (cancelled) return;
        setLinks(data.links || []);
        setTasks(data.tasks || []);
        setEvents(data.events || []);
        setFiles(data.files || []);
        setSalesPoints(data.salesPoints || []);
      } catch {
        // keep empty lists on error
      }
    };

    loadWorkspace();
    return () => { cancelled = true; };
  }, [user?.id]);

  const reloadWorkspace = useCallback(async () => {
    if (!user?.id) return;
    try {
      const response = await apiFetch(`/api/workspace/${user.id}`);
      const data = await parseApiResponse(response);
      setLinks(data.links || []);
      setTasks(data.tasks || []);
      setEvents(data.events || []);
      setFiles(data.files || []);
      setSalesPoints(data.salesPoints || []);
    } catch {
      // ignore
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;

    let cancelled = false;

    const loadUnread = async () => {
      try {
        const response = await apiFetch(
          `/api/messenger/unread?userId=${Number(user.id)}`
        );
        const data = await parseApiResponse(response);
        if (cancelled || !data.success) return;
        setUnreadTotal(data.total || 0);
        setChatNotifications(data.notifications || []);
      } catch {
        // keep previous unread state on error
      }
    };

    loadUnread();
    const interval = setInterval(loadUnread, 6000);

    const onFocus = () => { loadUnread(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') loadUnread();
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [user?.id]);

  useEffect(() => {
    if (activeModal !== 'profile' || !user?.id) return;

    let cancelled = false;

    const loadProfile = async () => {
      setProfileLoading(true);
      setProfileMessage('');
      setProfileMessageType('');
      try {
        const response = await apiFetch(`/api/profile/${user.id}`);
        const data = await parseApiResponse(response);
        if (cancelled) return;
        if (data.success && data.user) {
          setUser(data.user);
          localStorage.setItem('user', JSON.stringify(data.user));
          setProfileForm({
            position: data.user.position || '',
            birthDate: data.user.birthDate || '',
          });
        }
      } catch (error) {
        if (!cancelled) {
          setProfileMessage(error.message || t('profile_load_fail'));
          setProfileMessageType('error');
          setProfileForm({
            position: user.position || '',
            birthDate: user.birthDate || '',
          });
        }
      } finally {
        if (!cancelled) setProfileLoading(false);
      }
    };

    loadProfile();
    return () => { cancelled = true; };
  }, [activeModal, user?.id]);

  const openModal = (name) => {
    if (name === 'imageModal') {
      setSalesDraft(salesPoints.map((p) => ({ label: p.label, value: p.value })));
      setSalesMessage('');
      setSalesMessageType('');
    }
    setActiveModal(name);
  };
  const closeModal = () => setActiveModal(null);

  const searchResults = useMemo(
    () => searchDashboard(searchQuery, { t, tasks, files, links, events, parserHistory }),
    [searchQuery, t, tasks, files, links, events, parserHistory]
  );

  const groupedSearchResults = useMemo(() => {
    const groups = new Map();
    for (const item of searchResults) {
      const key = item.category || 'features';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return groups;
  }, [searchResults]);

  const runSearchAction = useCallback((item) => {
    setSearchQuery('');
    setSearchOpen(false);

    if (item.kind === 'page') {
      if (item.tab) navigate(item.target, { state: { tab: item.tab } });
      else navigate(item.target);
      return;
    }
    if (item.kind === 'external' && item.target) {
      window.open(item.target, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.kind === 'event' && item.payload?.date) {
      setSelectedDate(item.payload.date);
    }
    if (item.kind === 'modal' && item.target === 'parser' && item.payload?.url) {
      setParserUrl(item.payload.url);
    }
    if (item.target) openModal(item.target);
  }, [navigate]);

  useEffect(() => {
    if (!searchOpen) return undefined;

    const onPointerDown = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setSearchOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [searchOpen]);

  const handleLogout = async () => {
    const ok = await confirm({
      message: t('dash_logout_confirm'),
      confirmText: t('nav_logout'),
    });
    if (ok) {
      logout();
      navigate('/login');
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) return;

    const birthDate = profileForm.birthDate?.trim() || null;

    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      setProfileMessage(t('profile_birth_invalid'));
      setProfileMessageType('error');
      return;
    }

    setProfileSaving(true);
    setProfileMessage('');
    try {
      const response = await apiFetch(`/api/profile/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position: profileForm.position.trim(),
          birthDate,
        }),
      });
      const data = await parseApiResponse(response);
      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
        setProfileForm({
          position: data.user.position || '',
          birthDate: data.user.birthDate || '',
        });
        setProfileMessage(t('profile_saved'));
        setProfileMessageType('success');
      }
    } catch (error) {
      setProfileMessage(error.message || t('profile_save_fail'));
      setProfileMessageType('error');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveSalesChart = async () => {
    if (!user?.id) return;

    const points = salesDraft
      .map((p) => ({ label: String(p.label || '').trim(), value: Number(p.value) }))
      .filter((p) => p.label);

    if (!points.length) {
      setSalesMessage(t('chart_save_fail'));
      setSalesMessageType('error');
      return;
    }

    setSalesSaving(true);
    setSalesMessage('');
    setSalesMessageType('');

    try {
      const response = await apiFetch(`/api/workspace/${user.id}/sales-chart`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points }),
      });
      const data = await parseApiResponse(response);
      if (data.success && data.salesPoints) {
        setSalesPoints(data.salesPoints);
        setSalesDraft(data.salesPoints.map((p) => ({ label: p.label, value: p.value })));
        setSalesMessage(t('chart_saved'));
        setSalesMessageType('success');
      }
    } catch (error) {
      setSalesMessage(error.message || t('chart_save_fail'));
      setSalesMessageType('error');
    } finally {
      setSalesSaving(false);
    }
  };

  const handleParse = async () => {
    if (!parserUrl.trim()) {
      setParserError(t('parser_url_required'));
      return;
    }

    setParserLoading(true);
    setParserError('');
    setParserResult(null);

    try {
      const response = await apiFetch('/api/parser/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: parserUrl.trim(),
          mode: parserMode,
        }),
      });
      const data = await parseApiResponse(response);
      if (data.success && data.data) {
        setParserResult(data.data);
        setParserTab('overview');
        setParserHistory(saveParserHistory({
          url: data.data.url,
          title: data.data.title || data.data.url,
          parsedAt: data.data.parsedAt,
        }));
      }
    } catch (error) {
      setParserError(error.message || t('parser_fail'));
    } finally {
      setParserLoading(false);
    }
  };

  const handleParserKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleParse();
    }
  };

  const handleCopyParserJson = async () => {
    if (!parserResult) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(parserResult, null, 2));
    } catch {
      setParserError(t('parser_copy_fail'));
    }
  };

  const handleDownloadParserJson = () => {
    if (!parserResult) return;
    const blob = new Blob([JSON.stringify(parserResult, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `parse-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setProfileMessage(t('profile_avatar_types'));
      setProfileMessageType('error');
      event.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setProfileMessage(t('profile_avatar_size'));
      setProfileMessageType('error');
      event.target.value = '';
      return;
    }

    setAvatarUploading(true);
    setProfileMessage('');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await apiFetch(`/api/profile/${user.id}/avatar`, {
        method: 'POST',
        body: formData,
      });
      const data = await parseApiResponse(response);
      if (data.success && data.user) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
        setProfileMessage(t('profile_avatar_ok'));
        setProfileMessageType('success');
      }
    } catch (error) {
      setProfileMessage(error.message || t('profile_avatar_fail'));
      setProfileMessageType('error');
    } finally {
      setAvatarUploading(false);
      event.target.value = '';
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;
    
    const userMsg = { role: 'user', content: chatInput };
    setChatMessages([...chatMessages, userMsg]);
    setChatInput('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: chatInput })
      });
      const data = await response.json();
      
      const botMsg = { 
        role: 'assistant', 
        content: data.success ? data.response : t('ai_error_prefix') + data.error
      };
      setChatMessages(prev => [...prev, botMsg]);
    } catch (error) {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: t('ai_connect_fail')
      }]);
    }
    setIsLoading(false);
  };

  const toggleTask = async (id) => {
    const task = tasks.find((item) => item.id === id);
    if (!task || !user?.id) return;
    const done = !task.done;
    setTasks((prev) => prev.map((item) => (item.id === id ? { ...item, done } : item)));
    try {
      await parseApiResponse(await apiFetch(`/api/workspace/${user.id}/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done }),
      }));
    } catch {
      setTasks((prev) => prev.map((item) => (item.id === id ? { ...item, done: !done } : item)));
    }
  };

  const deleteTask = async (id) => {
    if (!user?.id) return;
    setTasks((prev) => prev.filter((task) => task.id !== id));
    try {
      await parseApiResponse(await apiFetch(`/api/workspace/${user.id}/tasks/${id}`, { method: 'DELETE' }));
    } catch {
      const response = await apiFetch(`/api/workspace/${user.id}`);
      const data = await parseApiResponse(response);
      setTasks(data.tasks || []);
    }
  };

  const addTask = async () => {
    if (!newTaskText.trim() || !user?.id) return;
    try {
      const response = await apiFetch(`/api/workspace/${user.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: newTaskText.trim(),
          priority: newTaskPriority,
          dueDate: newTaskDue || null,
        }),
      });
      const data = await parseApiResponse(response);
      if (data.task) {
        setTasks((prev) => [data.task, ...prev]);
        setNewTaskText('');
        setNewTaskDue('');
        setNewTaskPriority('medium');
      }
    } catch (error) {
      toast.error(error.message || t('task_add_fail'));
    }
  };

  const addLink = async () => {
    if (!newLinkTitle.trim() || !newLinkUrl.trim() || !user?.id) return;
    try {
      const response = await apiFetch(`/api/workspace/${user.id}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newLinkTitle.trim(),
          url: newLinkUrl.trim(),
          icon: newLinkIcon,
        }),
      });
      const data = await parseApiResponse(response);
      if (data.link) {
        setLinks((prev) => [data.link, ...prev]);
        setNewLinkTitle('');
        setNewLinkUrl('');
        setNewLinkIcon('link');
      }
    } catch (error) {
      toast.error(error.message || t('link_add_fail'));
    }
  };

  const deleteLink = async (id) => {
    if (!user?.id) return;
    setLinks((prev) => prev.filter((link) => link.id !== id));
    try {
      await parseApiResponse(await apiFetch(`/api/workspace/${user.id}/links/${id}`, { method: 'DELETE' }));
    } catch {
      const response = await apiFetch(`/api/workspace/${user.id}`);
      const data = await parseApiResponse(response);
      setLinks(data.links || []);
    }
  };

  const addEvent = async () => {
    if (!newEventTitle.trim() || !selectedDate || !user?.id) return;
    try {
      const response = await apiFetch(`/api/workspace/${user.id}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newEventTitle.trim(),
          eventDate: selectedDate,
          note: newEventNote.trim() || null,
        }),
      });
      const data = await parseApiResponse(response);
      if (data.event) {
        setEvents((prev) => [...prev, data.event]);
        setNewEventTitle('');
        setNewEventNote('');
      }
    } catch (error) {
      toast.error(error.message || t('event_add_fail'));
    }
  };

  const deleteEvent = async (id) => {
    if (!user?.id) return;
    setEvents((prev) => prev.filter((event) => event.id !== id));
    try {
      await parseApiResponse(await apiFetch(`/api/workspace/${user.id}/events/${id}`, { method: 'DELETE' }));
    } catch {
      const response = await apiFetch(`/api/workspace/${user.id}`);
      const data = await parseApiResponse(response);
      setEvents(data.events || []);
    }
  };

  const uploadWorkspaceFiles = async (fileList) => {
    if (!user?.id || !fileList?.length) return;
    setFileUploading(true);
    try {
      const uploaded = [];
      for (const file of fileList) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await apiFetch(`/api/workspace/${user.id}/files`, {
          method: 'POST',
          body: formData,
        });
        const data = await parseApiResponse(response);
        if (data.file) uploaded.push(data.file);
      }
      if (uploaded.length) {
        setFiles((prev) => [...uploaded, ...prev]);
      }
    } catch (error) {
      toast.error(error.message || t('file_upload_fail'));
    } finally {
      setFileUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = (e) => {
    uploadWorkspaceFiles(Array.from(e.target.files || []));
  };

  const deleteWorkspaceFile = async (id) => {
    if (!user?.id) return;
    setFiles((prev) => prev.filter((file) => file.id !== id));
    try {
      await parseApiResponse(await apiFetch(`/api/workspace/${user.id}/files/${id}`, { method: 'DELETE' }));
    } catch {
      const response = await apiFetch(`/api/workspace/${user.id}`);
      const data = await parseApiResponse(response);
      setFiles(data.files || []);
    }
  };

  const shiftCalendarMonth = (delta) => {
    setCalendarMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
  };

  const todayKey = toDateKey(new Date());
  const monthGrid = buildMonthGrid(calendarMonth.getFullYear(), calendarMonth.getMonth());
  const miniGrid = buildMonthGrid(new Date().getFullYear(), new Date().getMonth());
  const eventsByDate = events.reduce((acc, event) => {
    acc[event.eventDate] = acc[event.eventDate] || [];
    acc[event.eventDate].push(event);
    return acc;
  }, {});
  const selectedEvents = eventsByDate[selectedDate] || [];
  const taskProgress = tasks.length
    ? Math.round((tasks.filter((task) => task.done).length / tasks.length) * 100)
    : 0;

  return (
    <div className="dashboard-page">
      <div className="dashboard-bg">
        <div className="bg-overlay"></div>
        <div className="bg-glow glow-1"></div>
        <div className="bg-glow glow-2"></div>
      </div>
      
      <div className="ios-window">
        <div className="dashboard-main">
          <nav className="left-nav">
            <div className="nav-logo">
              <div className="logo-circle">
                <Bot size={26} />
              </div>
              <div className="logo-text">
                <h3>DeKs</h3>
                <span>{t('dash_workspace')}</span>
              </div>
            </div>

            <div className="nav-group">
              <div className={`nav-item ${activeModal === null ? "active" : ""}`}>
                <Home size={20} />
                <span>{t('dash_home')}</span>
              </div>
              <div className="nav-item" onClick={() => openModal("team")}>
                <Users size={20} />
                <span>{t('dash_team')}</span>
              </div>
              <div className="nav-item" onClick={() => openModal("docs")}>
                <FileText size={20} />
                <span>{t('dash_docs')}</span>
              </div>
              <div className="nav-item" onClick={() => openModal("links")}>
                <Link2 size={20} />
                <span>{t('dash_links')}</span>
              </div>
              <div className="nav-item" onClick={() => openModal("parser")}>
                <Database size={20} />
                <span>{t('dash_parser')}</span>
              </div>
              <div className="nav-item" onClick={() => navigate("/messenger")}>
                <MessageCircle size={20} />
                <span>{t('dash_chat')}</span>
                {unreadTotal > 0 && (
                  <div className="nav-badge">
                    {unreadTotal > 99 ? '99+' : unreadTotal}
                  </div>
                )}
              </div>
              <div className="nav-item" onClick={() => navigate("/obsidian")}>
                <BookOpen size={20} />
                <span>{t('nav_obsidian')}</span>
              </div>
              <div className="nav-item" onClick={() => navigate('/chat')}>
                <Bot size={20} />
                <span>{t('dash_ai_bot')}</span>
              </div>
              <div className={`nav-item ${activeModal === 'settings' ? 'active' : ''}`} onClick={() => openModal("settings")}>
                <Settings size={20} />
                <span>{t('dash_settings')}</span>
              </div>
            </div>
          </nav>

          <div className="dashboard-center">
            <div className="dashboard-header">
              <div className="header-left">
                <span className="page-label">{t('dash_label')}</span>
                <h1>{t('dash_welcome', { name: firstName(user?.fullName, t('colleague')) })}</h1>
              </div>
              <div className="header-right">
                <div className="search-wrapper" ref={searchRef}>
                  <Search size={18} />
                  <input
                    placeholder={t('dash_search')}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSearchOpen(true);
                    }}
                    onFocus={() => setSearchOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setSearchOpen(false);
                        e.currentTarget.blur();
                      }
                      if (e.key === 'Enter' && searchResults[0]) {
                        e.preventDefault();
                        runSearchAction(searchResults[0]);
                      }
                    }}
                  />
                  {searchOpen && searchQuery.trim() && (
                    <div className="search-dropdown">
                      {searchResults.length === 0 ? (
                        <div className="search-empty">{t('search_no_results')}</div>
                      ) : (
                        [...groupedSearchResults.entries()].map(([category, items]) => (
                          <div key={category} className="search-group">
                            <div className="search-group-label">
                              {t(SEARCH_CATEGORY_KEYS[category] || SEARCH_CATEGORY_KEYS.features)}
                            </div>
                            {items.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className="search-result-item"
                                onClick={() => runSearchAction(item)}
                              >
                                <span className="search-result-title">{item.title}</span>
                                {item.subtitle && (
                                  <span className="search-result-sub">{item.subtitle}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <button className="icon-btn" onClick={() => openModal("notifications")}>
                  <Bell size={18} />
                  {unreadTotal > 0 && <span className="notif-dot"></span>}
                </button>
                <button className="icon-btn" onClick={() => navigate("/messenger")}>
                  <MessageCircle size={18} />
                </button>
                <div className="user-avatar" onClick={() => openModal("profile")} title={t('dash_profile')}>
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt="" className="user-avatar-img" />
                  ) : (
                    <User size={18} />
                  )}
                </div>
              </div>
            </div>

            <div className="widgets-grid">
              <div 
                className="widget widget-hero"
                style={{
                  backgroundImage: 'url(/analytics-hero.jpg)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat'
                }}
              >
                <div className="hero-content" style={{ background: 'rgba(0,0,0,0.4)' }}>
                  <div className="hero-text">
                    <span className="hero-badge">{t('dash_hero_badge')}</span>
                    <h2>{t('dash_hero_title')}</h2>
                    <p>{t('dash_hero_desc')}</p>
                    <button className="hero-btn" onClick={() => openModal('imageModal')}>
                      <TrendingUp size={16} /> {t('dash_hero_btn')}
                    </button>
                  </div>
                  <div className="hero-image">
                    <div className="hero-chart"></div>
                  </div>
                </div>
              </div>

         
              <div 
                className="widget widget-ai"
                style={{
                  backgroundImage: 'url(/assistant-hero.jpg)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat'
                }}
              >
                <div className="ai-content" style={{ background: 'rgba(0,0,0,0.6)' }}>
                  <div className="ai-header">
                    <span className="ai-badge">AI</span>
                    <span className="ai-status">{t('dash_ai_online')}</span>
                  </div>
                  <div className="ai-avatar">
                    <Bot size={32} />
                  </div>
                  <h3>{t('dash_ai_title')}</h3>
                  <p>{t('dash_ai_desc')}</p>
                  <button className="widget-btn" onClick={() => navigate('/chat')}>
                    <MessageCircle size={14} /> {t('dash_ai_open')}
                  </button>
                </div>
              </div>

              <div className="widget widget-tasks">
                <div className="widget-header">
                  <span className="widget-title">
                    <CheckCircle size={16} />
                    {t('dash_tasks')}
                  </span>
                  <span className="widget-badge">{t('dash_tasks_left', { count: tasks.filter(tk => !tk.done).length })}</span>
                </div>
                <div className="task-list">
                  {tasks.map(task => (
                    <div key={task.id} className={`task-item ${task.done ? 'done' : ''}`}>
                      <div className="task-left">
                        <input 
                          type="checkbox" 
                          checked={task.done} 
                          onChange={() => toggleTask(task.id)} 
                        />
                        <span
                          className="task-text"
                          onClick={() => toggleTask(task.id)}
                          onKeyDown={(e) => e.key === 'Enter' && toggleTask(task.id)}
                          role="button"
                          tabIndex={0}
                        >
                          {task.text}
                        </span>
                      </div>
                      <div className="task-right">
                        <span className={`priority-dot ${task.priority}`}></span>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="widget-btn" onClick={() => openModal('tasks')}>
                  <Plus size={14} /> {t('dash_add_task')}
                </button>
              </div>

              <div className="widget widget-graph">
                <div className="widget-header">
                  <span className="widget-title">
                    <BarChart3 size={16} />
                    {t('dash_graph_title')}
                  </span>
                  <button
                    type="button"
                    className="widget-action"
                    title={t('action_open')}
                    onClick={reloadWorkspace}
                  >
                    <RefreshCw size={14} />
                  </button>
                </div>
                <div className="graph-content">
                  <div 
                    className="graph-image"
                    style={{
      backgroundImage: 'url(/chart.jpg)',
      backgroundSize: 'contain',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat'
    }}
                  ></div>
                  <div className="graph-stats">
                    <div className="graph-stat">
                      <span className="graph-label">{t('dash_graph_revenue')}</span>
                      <span className="graph-value">
                        {t('chart_revenue_fmt', {
                          value: formatSalesValue(salesStats.last, locale),
                        })}
                      </span>
                    </div>
                    <div className="graph-stat">
                      <span className="graph-label">{t('dash_graph_growth')}</span>
                      <span className={`graph-value ${salesStats.growth < 0 ? 'negative' : ''}`}>
                        {salesStats.growth >= 0 ? '+' : ''}
                        {t('chart_growth_fmt', { value: salesStats.growth.toFixed(1) })}
                      </span>
                    </div>
                  </div>
                </div>
                <button className="widget-btn" onClick={() => openModal('imageModal')}>
                  <Eye size={14} /> {t('dash_graph_open')}
                </button>
              </div>

              {/* Links Card */}
              <div className="widget widget-links">
                <div className="widget-header">
                  <span className="widget-title">
                    <Link2 size={16} />
                    {t('dash_links_widget')}
                  </span>
                  <button className="widget-action" onClick={() => openModal('links')}>
                    <Plus size={14} />
                  </button>
                </div>
                <div className="quick-links">
                  {links.map(link => (
                    <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="quick-link">
                      <span className="quick-link-icon"><LinkIconView icon={link.icon} size={14} /></span>
                      {link.title}
                    </a>
                  ))}
                </div>
                <button className="widget-btn" onClick={() => openModal('links')}>
                  <Globe size={14} /> {t('dash_manage')}
                </button>
              </div>

              {/* Analytics Card */}
              <div className="widget widget-analytics">
                <div className="widget-header">
                  <span className="widget-title">
                    <Activity size={16} />
                    {t('dash_analytics_title')}
                  </span>
                </div>
                <div className="analytics-stats">
                  <div className="analytics-item">
                    <span className="analytics-label">{t('dash_analytics_active')}</span>
                    <span className="analytics-value">12</span>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: '60%' }}></div>
                    </div>
                  </div>
                  <div className="analytics-item">
                    <span className="analytics-label">{t('dash_analytics_done')}</span>
                    <span className="analytics-value">47</span>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: '85%' }}></div>
                    </div>
                  </div>
                  <div className="analytics-item">
                    <span className="analytics-label">{t('dash_analytics_in_progress')}</span>
                    <span className="analytics-value">8</span>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: '40%' }}></div>
                    </div>
                  </div>
                </div>
                <button className="widget-btn" onClick={() => navigate('/obsidian')}>
                  <BookOpen size={14} /> {t('dash_open_obsidian')}
                </button>
              </div>

              {/* Files Card */}
              <div className="widget widget-files">
                <div className="widget-header">
                  <span className="widget-title">
                    <Folder size={16} />
                    {t('dash_files')}
                  </span>
                  <button className="widget-action" onClick={() => openModal('docs')}>
                    <Upload size={14} />
                  </button>
                </div>
                <div className="files-list">
                  {files.slice(0, 3).map((file) => (
                    <div key={file.id} className="file-item">
                      <FileText size={14} />
                      <span className="file-name">{file.originalName}</span>
                      <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                  {files.length === 0 && (
                    <div className="files-empty">
                      <span>{t('dash_no_files')}</span>
                    </div>
                  )}
                </div>
                <button className="widget-btn" onClick={() => openModal('docs')}>
                  <FileText size={14} /> {t('dash_manage')}
                </button>
              </div>

              {/* Calendar Card */}
              <div className="widget widget-calendar">
                <div className="widget-header">
                  <span className="widget-title">
                    <Calendar size={16} />
                    {t('dash_calendar')}
                  </span>
                </div>
                <div className="calendar-mini">
                  <div className="calendar-days">
                    {weekdays.map((day) => (
                      <div key={day} className="calendar-day-header">{day}</div>
                    ))}
                    {miniGrid.map((day, idx) => {
                      if (!day) return <div key={`e-${idx}`} className="calendar-day empty" />;
                      const key = toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), day));
                      const hasEvents = (eventsByDate[key] || []).length > 0;
                      return (
                        <div
                          key={key}
                          className={`calendar-day ${key === todayKey ? 'today' : ''} ${hasEvents ? 'has-event' : ''}`}
                        >
                          {day}
                          {hasEvents && <span className="day-dot" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <button className="widget-btn" onClick={() => openModal('tracker')}>
                  <Calendar size={14} /> {t('dash_open_calendar')}
                </button>
              </div>
            </div>

            {/* Футер с пользователем и кнопкой "Выход" */}
            <div className="dashboard-footer">
              <div className="footer-right">
                <User size={14} />
                <span>{shortName(user?.fullName)}</span>
                <span className="role-badge">{user?.position || t('dash_employee_role')}</span>
                <button className="logout-btn" onClick={handleLogout} title={t('nav_logout')}>
                  <LogOut size={14} />
                  <span style={{ marginLeft: '4px' }}>{t('nav_logout')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SiteFooter внизу страницы */}
      <SiteFooter variant="minimal" className="dashboard-site-footer" />

      {/* Модальные окна */}
      {activeModal === 'team' && (
        <DashboardModal onClose={closeModal} title={t('team_title')}>
          <div className="team-grid">
            <div className="team-member">
              <div className="member-avatar"><User size={20} /></div>
              <div>
                <div className="member-name">{t('team_role_analytics')}</div>
                <div className="member-role">{t('team_role_analytics_desc')}</div>
              </div>
            </div>
            <div className="team-member">
              <div className="member-avatar"><User size={20} /></div>
              <div>
                <div className="member-name">{t('team_role_knowledge')}</div>
                <div className="member-role">{t('team_role_knowledge_desc')}</div>
              </div>
            </div>
            <div className="team-member">
              <div className="member-avatar"><User size={20} /></div>
              <div>
                <div className="member-name">{t('team_role_comms')}</div>
                <div className="member-role">{t('team_role_comms_desc')}</div>
              </div>
            </div>
          </div>
        </DashboardModal>
      )}

      {activeModal === 'links' && (
        <DashboardModal onClose={closeModal} title={t('links_modal_title')} width="640px">
          <div className="links-manager-v2">
            <div className="link-add-card">
              <div className="link-add-header">
                <Globe size={18} />
                <div>
                  <h3>{t('links_new_title')}</h3>
                  <p>{t('links_new_hint')}</p>
                </div>
              </div>
              <div className="icon-picker">
                {LINK_ICON_OPTIONS.map(({ id, Icon }) => (
                  <button
                    key={id}
                    type="button"
                    className={`icon-pick ${newLinkIcon === id ? 'active' : ''}`}
                    onClick={() => setNewLinkIcon(id)}
                    title={id}
                  >
                    <Icon size={16} />
                  </button>
                ))}
              </div>
              <div className="link-form-grid">
                <input
                  type="text"
                  placeholder={t('links_name_placeholder')}
                  value={newLinkTitle}
                  onChange={(e) => setNewLinkTitle(e.target.value)}
                />
                <input
                  type="url"
                  placeholder="https://..."
                  value={newLinkUrl}
                  onChange={(e) => setNewLinkUrl(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addLink()}
                />
              </div>
              <button type="button" className="primary-btn link-add-btn" onClick={addLink}>
                <Plus size={16} /> {t('links_add')}
              </button>
            </div>

            <div className="links-list-v2">
              {links.length === 0 && (
                <div className="workspace-empty">{t('links_empty')}</div>
              )}
              {links.map((link) => (
                <div key={link.id} className="link-card">
                  <span className="link-card-icon"><LinkIconView icon={link.icon} size={18} /></span>
                  <div className="link-card-body">
                    <strong>{link.title}</strong>
                    <span>{link.url}</span>
                    {link.authorName && (
                      <small className="shared-author">{t('shared_by', { name: link.authorName })}</small>
                    )}
                  </div>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" className="link-open" title={t('action_open')}>
                    <ExternalLink size={16} />
                  </a>
                  <button type="button" className="link-delete" onClick={() => deleteLink(link.id)} title={t('action_delete')}>
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </DashboardModal>
      )}

      {activeModal === 'docs' && (
        <DashboardModal onClose={closeModal} title={t('docs_modal_title')} width="640px">
          <div className="docs-manager-v2">
            <div className="link-add-card doc-upload-card">
              <div className="link-add-header">
                <Upload size={18} />
                <div>
                  <h3>{t('docs_upload_title')}</h3>
                  <p>{t('docs_upload_hint')}</p>
                </div>
              </div>

              <div
                className={`doc-dropzone ${fileUploading ? 'uploading' : ''}`}
                onClick={() => !fileUploading && fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  uploadWorkspaceFiles(Array.from(e.dataTransfer.files || []));
                }}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && !fileUploading) {
                    e.preventDefault();
                    fileInputRef.current?.click();
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="doc-dropzone-icon">
                  {fileUploading ? <RefreshCw size={28} className="doc-upload-spin" /> : <Upload size={28} />}
                </div>
                <p className="doc-dropzone-title">
                  {fileUploading ? t('docs_uploading') : t('docs_dropzone')}
                </p>
                <span className="doc-dropzone-hint">{t('docs_dropzone_hint')}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  hidden
                  onChange={handleFileUpload}
                  accept=".png,.pdf,.docx,.xlsx,.jpg,.jpeg,.txt,.md,.webp"
                />
              </div>

              <div className="doc-format-chips">
                {['PNG', 'PDF', 'DOCX', 'XLSX', 'TXT', 'MD'].map((ext) => (
                  <span key={ext} className="doc-format-chip">{ext}</span>
                ))}
                <span className="doc-format-limit">до 10 МБ</span>
              </div>
            </div>

            <div className="docs-list-v2">
              {files.length === 0 ? (
                <div className="workspace-empty">{t('docs_empty')}</div>
              ) : (
                files.map((file) => (
                  <div key={file.id} className="doc-card">
                    <span className="doc-card-icon"><FileText size={18} /></span>
                    <div className="doc-card-body">
                      <strong>{file.originalName}</strong>
                      <span>{(file.size / 1024).toFixed(1)} KB</span>
                      {file.authorName && (
                        <small className="shared-author">{t('shared_by', { name: file.authorName })}</small>
                      )}
                    </div>
                    <a
                      className="link-open"
                      href={resolveFileUrl(file.fileUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t('action_open')}
                    >
                      <Eye size={16} />
                    </a>
                    <a
                      className="link-open"
                      href={resolveFileUrl(file.fileUrl)}
                      download={file.originalName}
                      title={t('action_download')}
                    >
                      <Download size={16} />
                    </a>
                    <button
                      type="button"
                      className="link-delete"
                      onClick={() => deleteWorkspaceFile(file.id)}
                      title={t('action_delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </DashboardModal>
      )}

      {activeModal === 'parser' && (
        <DashboardModal onClose={closeModal} title={t('parser_title')} width="760px">
          <div className="parser-area">
            <p className="parser-desc">
              {t('parser_desc')}
            </p>

            <div className="parser-controls">
              <div className="parser-input-group">
                <input
                  type="url"
                  placeholder={t('parser_url_placeholder')}
                  className="parser-input"
                  value={parserUrl}
                  onChange={(e) => setParserUrl(e.target.value)}
                  onKeyDown={handleParserKeyDown}
                  disabled={parserLoading}
                />
                <button
                  type="button"
                  className="primary-btn"
                  onClick={handleParse}
                  disabled={parserLoading}
                >
                  {parserLoading ? t('parser_running') : t('parser_run')}
                </button>
              </div>

              <div className="parser-mode-row">
                <span className="parser-mode-label">{t('parser_mode_label')}</span>
                {[
                  { id: 'auto', label: t('parser_mode_auto') },
                  { id: 'links', label: t('parser_mode_links') },
                  { id: 'tables', label: t('parser_mode_tables') },
                  { id: 'text', label: t('parser_mode_text') },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`parser-mode-btn ${parserMode === item.id ? 'active' : ''}`}
                    onClick={() => setParserMode(item.id)}
                    disabled={parserLoading}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {parserHistory.length > 0 && (
              <div className="parser-history">
                <span className="parser-history-label">{t('parser_history')}</span>
                <div className="parser-history-list">
                  {parserHistory.map((item) => (
                    <button
                      key={item.url}
                      type="button"
                      className="parser-history-item"
                      onClick={() => setParserUrl(item.url)}
                      title={item.url}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {parserError && (
              <div className="parser-error">
                <AlertCircle size={16} />
                <span>{parserError}</span>
              </div>
            )}

            <div className="parser-preview">
              {!parserResult && !parserLoading && (
                <div className="parser-placeholder">
                  <Code size={24} />
                  <span>{t('parser_results_placeholder')}</span>
                </div>
              )}

              {parserLoading && (
                <div className="parser-placeholder">
                  <RefreshCw size={24} className="spin-icon" />
                  <span>{t('parser_loading_page')}</span>
                </div>
              )}

              {parserResult && !parserLoading && (
                <div className="parser-results">
                  <div className="parser-result-header">
                    <div>
                      <h3>{parserResult.title || t('parser_no_title')}</h3>
                      {parserResult.description && (
                        <p className="parser-result-desc">{parserResult.description}</p>
                      )}
                      <a
                        href={parserResult.finalUrl || parserResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="parser-result-link"
                      >
                        <ExternalLink size={14} />
                        {parserResult.finalUrl || parserResult.url}
                      </a>
                    </div>
                    <div className="parser-result-actions">
                      <button type="button" className="secondary-btn" onClick={handleCopyParserJson}>
                        <Copy size={14} /> {t('parser_copy')}
                      </button>
                      <button type="button" className="secondary-btn" onClick={handleDownloadParserJson}>
                        <Download size={14} /> {t('action_download')}
                      </button>
                    </div>
                  </div>

                  <div className="parser-stats">
                    <span>HTTP {parserResult.statusCode}</span>
                    <span>{parserResult.kind === 'json' ? 'JSON' : 'HTML'}</span>
                    <span>{t('parser_stats_links', { count: parserResult.stats?.links || 0 })}</span>
                    <span>{t('parser_stats_tables', { count: parserResult.stats?.tables || 0 })}</span>
                    <span>{t('parser_stats_headings', { count: parserResult.stats?.headings || 0 })}</span>
                  </div>

                  <div className="parser-tabs">
                    {[
                      { id: 'overview', label: t('parser_tab_overview') },
                      { id: 'links', label: t('parser_tab_links', { count: parserResult.links?.length || 0 }) },
                      { id: 'tables', label: t('parser_tab_tables', { count: parserResult.tables?.length || 0 }) },
                      { id: 'raw', label: t('parser_copy') },
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`parser-tab ${parserTab === tab.id ? 'active' : ''}`}
                        onClick={() => setParserTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="parser-tab-content">
                    {parserTab === 'overview' && (
                      <div className="parser-overview">
                        {parserResult.headings?.length > 0 && (
                          <div className="parser-block">
                            <h4>{t('parser_headings')}</h4>
                            <ul>
                              {parserResult.headings.map((heading, index) => (
                                <li key={`${heading.text}-${index}`} className={`heading-level-${heading.level}`}>
                                  H{heading.level}: {heading.text}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {parserResult.textPreview && (
                          <div className="parser-block">
                            <h4>{t('parser_text')}</h4>
                            <p className="parser-text-preview">{parserResult.textPreview}</p>
                          </div>
                        )}

                        {parserResult.images?.length > 0 && (
                          <div className="parser-block">
                            <h4>{t('parser_images', { count: parserResult.images.length })}</h4>
                            <div className="parser-images">
                              {parserResult.images.slice(0, 6).map((image) => (
                                <a
                                  key={image.src}
                                  href={image.src}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="parser-image-item"
                                >
                                  <img src={image.src} alt={image.alt || 'image'} loading="lazy" />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {parserTab === 'links' && (
                      <div className="parser-links-list">
                        {(parserResult.links || []).length === 0 ? (
                          <p className="parser-empty">{t('parser_no_links')}</p>
                        ) : (
                          parserResult.links.map((link) => (
                            <a
                              key={link.href}
                              href={link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="parser-link-item"
                            >
                              <strong>{link.text}</strong>
                              <span>{link.href}</span>
                            </a>
                          ))
                        )}
                      </div>
                    )}

                    {parserTab === 'tables' && (
                      <div className="parser-tables-wrap">
                        {(parserResult.tables || []).length === 0 ? (
                          <p className="parser-empty">{t('parser_no_tables')}</p>
                        ) : (
                          parserResult.tables.map((table, tableIndex) => (
                            <div key={`table-${tableIndex}`} className="parser-table-block">
                              <h4>{t('parser_table_n', { n: tableIndex + 1 })}</h4>
                              <div className="parser-table-scroll">
                                <table>
                                  <tbody>
                                    {table.map((row, rowIndex) => (
                                      <tr key={`row-${tableIndex}-${rowIndex}`}>
                                        {row.map((cell, cellIndex) => (
                                          <td key={`cell-${tableIndex}-${rowIndex}-${cellIndex}`}>{cell}</td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {parserTab === 'raw' && (
                      <pre className="parser-json">{JSON.stringify(parserResult, null, 2)}</pre>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </DashboardModal>
      )}

      {activeModal === 'tasks' && (
        <DashboardModal onClose={closeModal} title={t('tasks_modal_title')} width="620px">
          <div className="tasks-manager">
            <div className="task-add-card">
              <div className="task-add-header">
                <Flag size={18} />
                <div>
                  <h3>{t('tasks_new')}</h3>
                  <p>{t('tasks_new_hint')}</p>
                </div>
              </div>
              <textarea
                className="task-input"
                placeholder={t('tasks_placeholder')}
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                rows={3}
              />
              <div className="task-form-row">
                <label>
                  {t('tasks_priority')}
                  <select value={newTaskPriority} onChange={(e) => setNewTaskPriority(e.target.value)}>
                    <option value="low">{t('tasks_priority_low')}</option>
                    <option value="medium">{t('tasks_priority_medium')}</option>
                    <option value="high">{t('tasks_priority_high')}</option>
                  </select>
                </label>
                <label>
                  {t('tasks_due')}
                  <input type="date" value={newTaskDue} onChange={(e) => setNewTaskDue(e.target.value)} />
                </label>
              </div>
              <button type="button" className="primary-btn" onClick={addTask}>
                <Plus size={16} /> {t('tasks_add')}
              </button>
            </div>

            <div className="tasks-list-full">
              {tasks.length === 0 && (
                <div className="workspace-empty">{t('tasks_empty')}</div>
              )}
              {tasks.map((task) => (
                <div key={task.id} className={`task-row ${task.done ? 'done' : ''}`}>
                  <label className="task-check">
                    <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.id)} />
                    <span>{task.text}</span>
                  </label>
                  <div className="task-meta">
                    <span className={`priority-pill ${task.priority}`}>{task.priority}</span>
                    {task.dueDate && <span className="task-due">{formatDate(task.dueDate)}</span>}
                    {task.authorName && (
                      <span className="shared-author">{t('shared_by', { name: task.authorName })}</span>
                    )}
                    <button type="button" className="task-delete" onClick={() => deleteTask(task.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DashboardModal>
      )}

      {activeModal === 'tracker' && (
        <DashboardModal onClose={closeModal} title={t('calendar_title')} width="920px">
          <div className="tracker-area-v2">
            <div className="calendar-toolbar">
              <button type="button" className="cal-nav-btn" onClick={() => shiftCalendarMonth(-1)}>
                <ChevronLeft size={18} />
              </button>
              <h3>{months[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</h3>
              <button type="button" className="cal-nav-btn" onClick={() => shiftCalendarMonth(1)}>
                <ChevronRight size={18} />
              </button>
            </div>

            <div className="tracker-calendar-main">
              <div className="calendar-full">
                {weekdays.map((day) => (
                  <div key={day} className="calendar-header">{day}</div>
                ))}
                {monthGrid.map((day, idx) => {
                  if (!day) return <div key={`pad-${idx}`} className="calendar-day empty" />;
                  const key = toDateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day));
                  const dayEvents = eventsByDate[key] || [];
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`calendar-day selectable ${key === selectedDate ? 'selected' : ''} ${key === todayKey ? 'today' : ''}`}
                      onClick={() => setSelectedDate(key)}
                    >
                      <span className="day-num">{day}</span>
                      {dayEvents.length > 0 && (
                        <span className="day-events-count">{dayEvents.length}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="calendar-sidebar">
                <div className="calendar-selected-date">
                  <Calendar size={16} />
                  <span>{formatDate(selectedDate)}</span>
                </div>

                <div className="event-add-form">
                  <input
                    type="text"
                    placeholder={t('calendar_event_title')}
                    value={newEventTitle}
                    onChange={(e) => setNewEventTitle(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addEvent()}
                  />
                  <textarea
                    className="event-note-input"
                    placeholder={t('calendar_event_note')}
                    value={newEventNote}
                    onChange={(e) => setNewEventNote(e.target.value)}
                    rows={2}
                  />
                  <button type="button" className="primary-btn event-add-btn" onClick={addEvent}>
                    <Plus size={16} /> {t('tasks_add')}
                  </button>
                </div>

                <div className="events-list">
                  {selectedEvents.length === 0 && (
                    <div className="workspace-empty small">{t('calendar_no_events')}</div>
                  )}
                  {selectedEvents.map((event) => (
                    <div key={event.id} className="event-chip">
                      <span className="event-dot" style={{ background: event.color || '#818cf8' }} />
                      <div className="event-chip-body">
                        <strong>{event.title}</strong>
                        {event.note && <p className="event-note-text">{event.note}</p>}
                      </div>
                      <button type="button" onClick={() => deleteEvent(event.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="tracker-stats">
                  <div className="stat-item">
                    <span className="stat-label">{t('calendar_task_progress')}</span>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${taskProgress}%` }} />
                    </div>
                    <span className="stat-value">{taskProgress}%</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">{t('calendar_done')}</span>
                    <span className="stat-number">{tasks.filter((t) => t.done).length}/{tasks.length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DashboardModal>
      )}

      {activeModal === 'imageModal' && (
        <DashboardModal onClose={closeModal} title={t('chart_modal_title')} width="640px">
          <div className="image-modal-content">
            <p className="chart-title">{t('chart_subtitle')}</p>
            <SalesChartEditor
              draftPoints={salesDraft}
              onChange={setSalesDraft}
              onSave={handleSaveSalesChart}
              saving={salesSaving}
              message={salesMessage}
              messageType={salesMessageType}
            />
          </div>
        </DashboardModal>
      )}

      {activeModal === 'settings' && (
        <DashboardModal onClose={closeModal} title={t('settings_title')} width="440px">
          <div className="settings-panel">
            <div className="settings-section">
              <h3>{t('settings_language')}</h3>
              <p className="settings-hint">{t('settings_language_hint')}</p>
              <LanguageSwitcher />
            </div>
          </div>
        </DashboardModal>
      )}

      {activeModal === 'profile' && (
        <DashboardModal onClose={closeModal} title={t('profile_modal_title')} width="440px">
          <div className="profile-area">
            {profileLoading ? (
              <div className="profile-loading">{t('profile_loading')}</div>
            ) : (
              <>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  hidden
                  onChange={handleAvatarChange}
                />
                <button
                  type="button"
                  className="profile-avatar-btn"
                  onClick={() => avatarInputRef.current?.click()}
                  disabled={avatarUploading}
                >
                  <div className="profile-avatar">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt="" className="profile-avatar-img" />
                    ) : (
                      <User size={36} />
                    )}
                  </div>
                  <span className="profile-avatar-hint">
                    {avatarUploading ? t('profile_avatar_uploading') : t('profile_avatar_hint')}
                  </span>
                </button>

                <h3 className="profile-name">{user?.fullName || t('common_dash')}</h3>
                <p className="profile-email">{user?.email || t('common_dash')}</p>

                <div className="profile-form">
                  <label className="profile-field">
                    <span>{t('profile_position')}</span>
                    <input
                      type="text"
                      placeholder={t('profile_position_placeholder')}
                      value={profileForm.position}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, position: e.target.value }))}
                      maxLength={120}
                    />
                  </label>
                  <label className="profile-field">
                    <span>{t('profile_birthdate')}</span>
                    <input
                      type="date"
                      value={profileForm.birthDate}
                      onChange={(e) => setProfileForm((prev) => ({ ...prev, birthDate: e.target.value }))}
                      max={new Date().toISOString().slice(0, 10)}
                      min="1900-01-01"
                    />
                  </label>
                </div>

                <div className="profile-details">
                  <div className="detail-item">
                    <span className="detail-label">{t('profile_registered')}</span>
                    <span className="detail-value">{formatDate(user?.createdAt)}</span>
                  </div>
                </div>

                {profileMessage && (
                  <p className={`profile-message ${profileMessageType === 'success' ? 'success' : 'error'}`}>
                    {profileMessage}
                  </p>
                )}

                <div className="profile-actions">
                  <button
                    className="primary-btn"
                    onClick={handleSaveProfile}
                    disabled={profileSaving || avatarUploading}
                  >
                    <Edit3 size={16} /> {profileSaving ? t('profile_saving') : t('action_save')}
                  </button>
                  <button className="danger-btn" onClick={handleLogout}>
                    <LogOut size={16} /> {t('nav_logout')}
                  </button>
                </div>
              </>
            )}
          </div>
        </DashboardModal>
      )}

      {activeModal === 'notifications' && (
        <DashboardModal onClose={closeModal} title={t('notif_title')} width="460px">
          <div className="notifications-list">
            {chatNotifications.length === 0 ? (
              <p className="notifications-empty">{t('notif_empty')}</p>
            ) : (
              chatNotifications.map((item) => (
                <button
                  key={`${item.roomId}-${item.id}`}
                  type="button"
                  className="notif-item unread notif-item-btn"
                  onClick={() => {
                    closeModal();
                    navigate('/messenger');
                  }}
                >
                  <span className="notif-icon"></span>
                  <div>
                    <div className="notif-title">
                      {item.senderName}
                      {item.roomType === 'general' ? t('notif_general_chat') : ` · ${item.roomName}`}
                    </div>
                    <div className="notif-preview">{item.preview}</div>
                    <div className="notif-time">{formatNotifTime(item.createdAt)}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </DashboardModal>
      )}
    </div>
  );
};

export default DashboardPage;