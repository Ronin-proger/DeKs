import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Activity, Network, MessageCircle, FileText,
  RefreshCw, AlertTriangle, TrendingUp, Users, Zap, ArrowLeft,
  Plus, Search, X, Trash2, ExternalLink, BarChart3, Link2,
  FolderOpen, Tag, Clock, BookOpen, ChevronRight, Bot,
} from 'lucide-react';
import { apiFetch, parseApiResponse } from '../config/api';
import { useToast } from '../context/ToastContext';
import { useLanguage } from '../context/LanguageContext';
import { useConfirm } from '../context/ConfirmContext';
import './ObsidianPage.css';

const KnowledgeGraph3D = lazy(() => import('../components/KnowledgeGraph3D'));

function encodeVaultPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function noteLabel(path, t) {
  const name = path.split('/').pop()?.replace(/\.md$/i, '') || path;
  if (/^[a-z0-9]{1,14}$/i.test(name)) return t('obs_note_unnamed', { name });
  return name.replace(/-/g, ' ');
}

function formatDate(iso, locale, t) {
  if (!iso) return t('common_dash');
  try {
    return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  } catch {
    return t('common_dash');
  }
}

function formatSyncAgo(iso, t) {
  if (!iso) return t('time_never');
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('time_just_now');
  if (mins < 60) return t('time_mins_ago', { min: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('time_hours_ago', { hrs });
  return t('time_days_ago', { days: Math.floor(hrs / 24) });
}

function renderPlainText(text) {
  const lines = (text || '').split('\n');
  const blocks = [];
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="plain-text-list">
        {listItems.map((item, idx) => <li key={idx}>{item}</li>)}
      </ul>
    );
    listItems = [];
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (trimmed.startsWith('- ')) {
      listItems.push(trimmed.slice(2));
      return;
    }
    flushList();
    blocks.push(<p key={`p-${index}`}>{trimmed}</p>);
  });
  flushList();
  return blocks;
}

function vaultFileName(title) {
  const trimmed = title.trim();
  let base = trimmed.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  if (!base) base = `note-${Date.now()}`;
  if (!base.toLowerCase().endsWith('.md')) base = `${base}.md`;
  return base;
}

function ActivityChart({ data, t }) {
  const max = Math.max(...(data || []).map((d) => d.edits), 1);
  return (
    <div className="activity-chart">
      {(data || []).map((item) => (
        <div key={item.week} className="activity-bar-col" title={t('obs_activity_edits', { label: item.label, edits: item.edits })}>
          <div className="activity-bar-track">
            <div
              className="activity-bar-fill"
              style={{ height: `${Math.max((item.edits / max) * 100, item.edits ? 8 : 2)}%` }}
            />
          </div>
          <span className="activity-bar-label">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ObsidianPage() {
  const location = useLocation();
  const { t, locale } = useLanguage();
  const confirm = useConfirm();
  const [tab, setTab] = useState('dashboard');
  const [notes, setNotes] = useState([]);
  const [indexedNotes, setIndexedNotes] = useState({});
  const [noteSearch, setNoteSearch] = useState('');
  const [loadingNotes, setLoadingNotes] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [obsidianUrl, setObsidianUrl] = useState('');
  const [connectionMessage, setConnectionMessage] = useState('');
  const [serverOnline, setServerOnline] = useState(true);
  const [selectedNote, setSelectedNote] = useState(null);
  const [noteContent, setNoteContent] = useState('');
  const [noteAnalysis, setNoteAnalysis] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newNoteName, setNewNoteName] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');
  const [creationStatus, setCreationStatus] = useState('');

  const [status, setStatus] = useState(null);
  const [metrics, setMetrics] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [graph, setGraph] = useState(null);
  const [landscape, setLandscape] = useState([]);
  const [aiSummary, setAiSummary] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [ideas, setIdeas] = useState([]);
  const [semanticLinks, setSemanticLinks] = useState([]);
  const [discoveringLinks, setDiscoveringLinks] = useState(false);
  const [agentReport, setAgentReport] = useState('');
  const [agentMeta, setAgentMeta] = useState(null);
  const [agentRunning, setAgentRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  const tabs = useMemo(() => [
    { id: 'dashboard', label: t('obs_tab_dashboard'), icon: BarChart3 },
    { id: 'agent', label: t('obs_tab_agent'), icon: Bot },
    { id: 'analytics', label: t('obs_tab_analytics'), icon: TrendingUp },
    { id: 'graph', label: t('obs_tab_graph'), icon: Network },
    { id: 'chat', label: t('obs_tab_chat'), icon: MessageCircle },
    { id: 'ideas', label: t('obs_tab_ideas'), icon: Zap },
  ], [t]);

  const ragSuggestions = useMemo(() => [
    t('obs_rag_suggest_1'),
    t('obs_rag_suggest_2'),
    t('obs_rag_suggest_3'),
  ], [t]);

  useEffect(() => {
    const nextTab = location.state?.tab;
    if (nextTab) setTab(nextTab);
  }, [location.state?.tab]);

  const checkConnection = async () => {
    try {
      const response = await apiFetch('/api/obsidian/status');
      const data = await parseApiResponse(response);
      setServerOnline(true);
      setIsConnected(Boolean(data.connected));
      setObsidianUrl(data.url || '');
      setConnectionMessage(data.message || '');
      return data.connected;
    } catch {
      setServerOnline(false);
      setIsConnected(false);
      setConnectionMessage(t('obs_server_down'));
      return false;
    }
  };

  const fetchIndexedNotes = useCallback(async () => {
    try {
      const response = await apiFetch('/api/intelligence/notes');
      const data = await parseApiResponse(response);
      if (data.success && data.notes) {
        const map = {};
        data.notes.forEach((n) => { map[n.path] = n; });
        setIndexedNotes(map);
      }
    } catch {
      setIndexedNotes({});
    }
  }, []);

  const fetchNotes = useCallback(async () => {
    setLoadingNotes(true);
    setError('');
    try {
      const response = await apiFetch('/api/obsidian/vault');
      const data = await parseApiResponse(response);
      const fileList = (data.files || []).filter((file) => file.endsWith('.md'));
      const paths = new Set(fileList.map((rawPath) => rawPath.replace(/\\/g, '/')));
      try {
        const indexedResponse = await apiFetch('/api/intelligence/notes');
        const indexedData = await parseApiResponse(indexedResponse);
        (indexedData.notes || []).forEach((note) => {
          if (note.path) paths.add(note.path);
        });
      } catch {
        // vault list is enough
      }
      setNotes(
        Array.from(paths).map((path) => ({
          path,
          displayTitle: noteLabel(path, t),
        }))
      );
      setServerOnline(true);
      await fetchIndexedNotes();
    } catch (err) {
      setNotes([]);
      setServerOnline(false);
      setError(err.message || t('obs_load_fail'));
    } finally {
      setLoadingNotes(false);
    }
  }, [fetchIndexedNotes, t]);

  const loadIntelligence = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [statusRes, metricsRes, analyticsRes, graphRes, landscapeRes, semanticRes, agentRes] = await Promise.all([
        apiFetch('/api/intelligence/status'),
        apiFetch('/api/intelligence/metrics'),
        apiFetch('/api/intelligence/analytics'),
        apiFetch('/api/intelligence/graph'),
        apiFetch('/api/intelligence/landscape'),
        apiFetch('/api/intelligence/links/semantic'),
        apiFetch('/api/intelligence/agent/report'),
      ]);
      setStatus(await parseApiResponse(statusRes));
      const metricsData = await parseApiResponse(metricsRes);
      if (metricsData.success) setMetrics(metricsData.metrics);
      const analyticsData = await parseApiResponse(analyticsRes);
      if (analyticsData.success) setAnalytics(analyticsData.analytics);
      const graphData = await parseApiResponse(graphRes);
      if (graphData.success) setGraph(graphData.graph);
      const landscapeData = await parseApiResponse(landscapeRes);
      if (landscapeData.success) setLandscape(landscapeData.points || []);
      const semanticData = await parseApiResponse(semanticRes);
      if (semanticData.success) setSemanticLinks(semanticData.links || []);
      const agentData = await parseApiResponse(agentRes);
      if (agentData.success && agentData.report) {
        setAgentReport(agentData.report);
        setAgentMeta({ updatedAt: agentData.updatedAt, discovered: agentData.discovered });
      }
      await fetchIndexedNotes();
    } catch (err) {
      setError(err.message || t('obs_analytics_fail'));
    } finally {
      setLoading(false);
    }
  }, [fetchIndexedNotes, t]);

  useEffect(() => {
    checkConnection();
    fetchNotes();
    loadIntelligence();
  }, [fetchNotes, loadIntelligence]);

  const handleSync = async () => {
    setSyncing(true);
    setError('');
    try {
      const response = await apiFetch('/api/intelligence/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      });
      const data = await parseApiResponse(response);
      await Promise.all([fetchNotes(), loadIntelligence()]);
      if (selectedNote) loadNoteAnalysis(selectedNote);
      toast.success(
        data.pushedToVault > 0
          ? t('obs_sync_pushed', { count: data.pushedToVault })
          : (data.linkDiscoveryQueued ? t('obs_sync_ok') : t('obs_sync_notes_ok', { count: data.notesCount ?? 0 }))
      );
      if (data.enrichmentQueued || data.linkDiscoveryQueued) {
        setTimeout(() => loadIntelligence(), 10000);
      }
    } catch (err) {
      setError(err.message || t('obs_sync_fail'));
    } finally {
      setSyncing(false);
    }
  };

  const loadNoteAnalysis = async (path) => {
    try {
      const response = await apiFetch(`/api/intelligence/notes/analysis?path=${encodeURIComponent(path)}`);
      const data = await parseApiResponse(response);
      if (data.success) setNoteAnalysis(data.analysis);
      else setNoteAnalysis(null);
    } catch {
      setNoteAnalysis(null);
    }
  };

  const readNote = async (note) => {
    const path = typeof note === 'string' ? note : note.path;
    setSelectedNote(path);
    setNoteAnalysis(null);
    try {
      const response = await apiFetch(`/api/obsidian/vault/${encodeVaultPath(path)}`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || `HTTP ${response.status}`);
      }
      setNoteContent(await response.text());
      loadNoteAnalysis(path);
    } catch (err) {
      setError(err.message || t('obs_read_fail'));
    }
  };

  const createNote = async (e) => {
    e.preventDefault();
    if (!newNoteName.trim()) return;
    setCreationStatus(t('obs_creating'));
    try {
      const fileName = vaultFileName(newNoteName);
      const body = newNoteContent || t('obs_created_default_body', { title: newNoteName });
      const response = await apiFetch(`/api/obsidian/vault/${encodeVaultPath(fileName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/markdown' },
        body,
      });
      const data = await parseApiResponse(response);
      const displayName = fileName.replace(/\.md$/i, '');
      if (data.obsidianSynced) {
        toast.success(t('obs_created_toast_obsidian', { name: displayName }));
      } else if (data.vaultSaved) {
        toast.info(t('obs_created_toast_vault', { name: displayName }));
      } else {
        toast.success(t('obs_created'));
      }
      if (!data.obsidianSynced && data.obsidianMessage) {
        toast.info(t('obs_created_obsidian_hint'));
      }
      setCreationStatus(t('obs_created'));
      setNewNoteName('');
      setNewNoteContent('');
      setShowCreateModal(false);
      await fetchNotes();
      await fetchIndexedNotes();
      await loadIntelligence();
      if (data.path) readNote({ path: data.path });
    } catch (err) {
      setCreationStatus(`${t('obs_error_prefix')}${err.message}`);
      toast.error(err.message || t('obs_create_fail'));
    }
  };

  const deleteNote = async (note) => {
    const path = typeof note === 'string' ? note : note.path;
    const label = typeof note === 'object' ? note.displayTitle : noteLabel(path, t);
    const ok = await confirm({
      message: t('obs_delete_confirm', { name: label }),
      confirmText: t('action_delete'),
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const response = await apiFetch(`/api/obsidian/vault/${encodeVaultPath(path)}`, {
        method: 'DELETE',
      });
      await parseApiResponse(response);
      if (selectedNote === path) {
        setSelectedNote(null);
        setNoteContent('');
        setNoteAnalysis(null);
      }
      await fetchNotes();
      await loadIntelligence();
    } catch (err) {
      setError(err.message || t('obs_delete_fail'));
    }
  };

  const handleAiInsights = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/intelligence/insights/ai', { method: 'POST' }, 120000);
      const data = await parseApiResponse(response);
      setAiSummary(data.summary || '');
      if (data.metrics) setMetrics(data.metrics);
      setTab('analytics');
    } catch (err) {
      setError(err.message || t('obs_ai_fail'));
    } finally {
      setLoading(false);
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const question = chatInput.trim();
    setChatInput('');
    setChatMessages((prev) => [...prev, { role: 'user', content: question }]);
    setChatLoading(true);
    try {
      const response = await apiFetch(
        '/api/intelligence/rag',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: question }),
        },
        120000,
      );
      const data = await parseApiResponse(response);
      setChatMessages((prev) => [
        ...prev,
        { role: 'assistant', content: data.answer, sources: data.sources || [] },
      ]);
    } catch (err) {
      const message = err?.name === 'AbortError'
        ? t('obs_rag_timeout')
        : (err.message || t('obs_rag_fail'));
      setChatMessages((prev) => [...prev, { role: 'assistant', content: `${t('obs_error_prefix')}${message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleRunAgent = async () => {
    setAgentRunning(true);
    setError('');
    try {
      const response = await apiFetch('/api/intelligence/agent/analyze', { method: 'POST' }, 180000);
      const data = await parseApiResponse(response);
      setAgentReport(data.report || '');
      setAgentMeta({ discovered: data.discoveredLinks, stats: data.stats });
      if (data.semanticLinks) setSemanticLinks(data.semanticLinks);
      await loadIntelligence();
      setTab('agent');
      toast.success(t('obs_agent_ok', { count: data.discoveredLinks || 0 }));
    } catch (err) {
      toast.error(err.message || t('obs_ollama_fail'));
      setError(err.message || t('obs_agent_fail'));
    } finally {
      setAgentRunning(false);
    }
  };

  const handleDiscoverLinks = async () => {
    setDiscoveringLinks(true);
    setError('');
    try {
      const response = await apiFetch('/api/intelligence/links/discover', { method: 'POST' });
      const data = await parseApiResponse(response);
      setSemanticLinks(data.links || []);
      await loadIntelligence();
      setTab('graph');
      const count = data.discovered ?? 0;
      if (count > 0) {
        toast.success(t('obs_links_found', { count }));
      } else {
        toast.info(data.message || t('obs_links_none'));
      }
    } catch (err) {
      setError(err.message || t('obs_links_fail'));
    } finally {
      setDiscoveringLinks(false);
    }
  };

  const handleIdeas = async () => {
    setLoading(true);
    try {
      const response = await apiFetch('/api/intelligence/ideas', { method: 'POST' }, 120000);
      const data = await parseApiResponse(response);
      setIdeas(data.ideas || []);
      setTab('ideas');
    } catch (err) {
      setError(err.message || t('obs_ideas_fail'));
    } finally {
      setLoading(false);
    }
  };

  const enrichedNotes = useMemo(() => notes.map((note) => {
    const meta = indexedNotes[note.path];
    return {
      ...note,
      displayTitle: meta?.displayTitle || noteLabel(note.path, t),
      wordCount: meta?.wordCount,
      preview: meta?.preview,
      folder: meta?.folder,
      updatedAt: meta?.updatedAt,
      indexed: Boolean(meta),
    };
  }), [notes, indexedNotes, t]);

  const filteredNotes = enrichedNotes.filter((note) => {
    const query = noteSearch.toLowerCase();
    return (
      note.path.toLowerCase().includes(query)
      || note.displayTitle.toLowerCase().includes(query)
      || (note.folder || '').toLowerCase().includes(query)
    );
  });

  const synergy = metrics?.synergyCoefficient ?? 0;
  const risk = metrics?.risks?.composite ?? 0;
  const summary = analytics?.summary;

  const renderNoteViewer = () => (
    <div className="note-viewer-layout">
      <div className="note-viewer-main">
        <div className="viewer-header">
          <h3>
            {enrichedNotes.find((n) => n.path === selectedNote)?.displayTitle || noteLabel(selectedNote, t)}
          </h3>
          <div className="viewer-actions">
            <button type="button" className="viewer-btn" onClick={() => { setSelectedNote(null); setNoteAnalysis(null); }}>
              <X size={14} /> {t('action_close')}
            </button>
          </div>
        </div>
        <div className="viewer-content">
          <pre>{noteContent || t('obs_empty_note')}</pre>
        </div>
      </div>
      <aside className="note-analysis-panel">
        <h4><BookOpen size={14} /> {t('obs_analysis_title')}</h4>
        {noteAnalysis ? (
          <>
            <div className="analysis-stat-grid">
              <div className="analysis-stat"><span>{t('obs_stat_words')}</span><strong>{noteAnalysis.wordCount}</strong></div>
              <div className="analysis-stat"><span>{t('obs_stat_out')}</span><strong>{noteAnalysis.outgoingLinks?.length || 0}</strong></div>
              <div className="analysis-stat"><span>{t('obs_stat_in')}</span><strong>{noteAnalysis.incomingLinks?.length || 0}</strong></div>
              <div className="analysis-stat"><span>{t('obs_stat_domain')}</span><strong className="small">{noteAnalysis.domain}</strong></div>
            </div>
            {noteAnalysis.isOrphan && (
              <div className="analysis-alert warning"><AlertTriangle size={12} /> {t('obs_isolated')}</div>
            )}
            {noteAnalysis.tags?.length > 0 && (
              <div className="analysis-section">
                <span className="analysis-label"><Tag size={12} /> {t('obs_tags')}</span>
                <div className="tag-chips">
                  {noteAnalysis.tags.map((tag) => <span key={tag} className="tag-chip">{tag}</span>)}
                </div>
              </div>
            )}
            {noteAnalysis.outgoingLinks?.length > 0 && (
              <div className="analysis-section">
                <span className="analysis-label"><Link2 size={12} /> {t('obs_links_to')}</span>
                <div className="link-list-mini">
                  {noteAnalysis.outgoingLinks.map((l) => (
                    <button key={l.path} type="button" className="link-mini-btn" onClick={() => readNote(l.path)}>
                      {l.title || noteLabel(l.path, t)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {noteAnalysis.incomingLinks?.length > 0 && (
              <div className="analysis-section">
                <span className="analysis-label"><Link2 size={12} /> {t('obs_linked_from')}</span>
                <div className="link-list-mini">
                  {noteAnalysis.incomingLinks.map((l) => (
                    <button key={l.path} type="button" className="link-mini-btn" onClick={() => readNote(l.path)}>
                      {noteLabel(l.path, t)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="analysis-meta">
              <Clock size={11} /> {t('obs_updated', { date: formatDate(noteAnalysis.updatedAt, locale, t) })}
            </div>
          </>
        ) : (
          <p className="muted">{t('obs_sync_hint')}</p>
        )}
      </aside>
    </div>
  );

  const renderDashboard = () => (
    <div className="dashboard-grid">
      <section className="intel-panel dashboard-hero">
        <div className="dashboard-hero-left">
          <div className="dashboard-hero-icon">
            <FileText size={28} />
          </div>
          <div>
            <h2>{t('obs_vault_state')}</h2>
            <p className="muted">
              {summary
                ? t('obs_vault_summary', {
                  notes: summary.notesTotal,
                  words: summary.wordsTotal?.toLocaleString(locale),
                  links: summary.linksTotal,
                })
                : t('obs_vault_sync_hint')}
            </p>
            {status?.lastSyncAt && (
              <p className="sync-meta"><RefreshCw size={11} /> {t('obs_sync_meta', { ago: formatSyncAgo(status.lastSyncAt, t) })}</p>
            )}
          </div>
        </div>
        <div className="quick-actions">
          <button type="button" className="intel-btn primary" onClick={handleSync} disabled={syncing}>
            {syncing ? t('obs_syncing') : t('obs_sync_btn')}
          </button>
          <button type="button" className="intel-btn secondary" onClick={handleAiInsights} disabled={loading}>
            <Bot size={13} /> {t('obs_ai_overview')}
          </button>
          <button type="button" className="intel-btn secondary" onClick={handleRunAgent} disabled={agentRunning}>
            <Bot size={13} /> {agentRunning ? t('obs_agent_running') : t('obs_agent_btn')}
          </button>
          <button type="button" className="intel-btn secondary" onClick={handleDiscoverLinks} disabled={discoveringLinks}>
            <Link2 size={13} /> {t('obs_ai_links')}
          </button>
          <button type="button" className="intel-btn secondary" onClick={handleIdeas} disabled={loading}>
            <Zap size={13} /> {t('obs_ideas_btn')}
          </button>
        </div>
      </section>

      <section className="intel-panel">
        <h2><Activity size={18} /> {t('obs_activity_title')}</h2>
        {analytics?.activity?.length ? <ActivityChart data={analytics.activity} t={t} /> : <p className="muted">{t('obs_no_data')}</p>}
      </section>

      <section className="intel-panel">
        <h2><FolderOpen size={18} /> {t('obs_folders_title')}</h2>
        <div className="folder-bars">
          {(analytics?.folders || []).map((f) => {
            const pct = summary ? (f.count / summary.notesTotal) * 100 : 0;
            return (
              <div key={f.name} className="folder-bar-item">
                <div className="folder-bar-head">
                  <span>{f.name}</span>
                  <strong>{f.count}</strong>
                </div>
                <div className="heat-bar"><div className="heat-fill folder-fill" style={{ width: `${pct}%` }} /></div>
              </div>
            );
          })}
          {!analytics?.folders?.length && <p className="muted">{t('obs_no_data')}</p>}
        </div>
      </section>

      <section className="intel-panel">
        <h2><Network size={18} /> {t('obs_hubs_title')}</h2>
        <div className="hub-list">
          {(analytics?.hubs || []).map((hub, i) => (
            <button key={hub.path} type="button" className="hub-item" onClick={() => readNote(hub.path)}>
              <span className="hub-rank">№{i + 1}</span>
              <div className="hub-info">
                <strong>{hub.title}</strong>
                <small>{t('obs_hubs_meta', { out: hub.outgoing, in: hub.incoming })}</small>
              </div>
              <ChevronRight size={14} />
            </button>
          ))}
          {!analytics?.hubs?.length && <p className="muted">{t('obs_no_links_short')}</p>}
        </div>
      </section>

      <section className="intel-panel">
        <h2><Clock size={18} /> {t('obs_recent_title')}</h2>
        <div className="recent-list">
          {(analytics?.recent || []).map((item) => (
            <button key={item.path} type="button" className="recent-item" onClick={() => readNote(item.path)}>
              <span>{item.title}</span>
              <small>{formatDate(item.updatedAt, locale, t)}</small>
            </button>
          ))}
          {!analytics?.recent?.length && <p className="muted">{t('obs_no_data')}</p>}
        </div>
      </section>

      <section className="intel-panel">
        <h2><Tag size={18} /> {t('obs_tags_title')}</h2>
        <div className="tag-cloud">
          {(analytics?.tags || []).map((tag) => (
            <span key={tag.name} className="tag-cloud-item" style={{ fontSize: `${11 + Math.min(tag.count * 2, 8)}px` }}>
              {tag.name} <em>{tag.count}</em>
            </span>
          ))}
          {!analytics?.tags?.length && <p className="muted">{t('obs_tags_empty')}</p>}
        </div>
      </section>

      {(analytics?.orphans?.length > 0 || analytics?.stale?.length > 0) && (
        <section className="intel-panel wide alerts-panel">
          <h2><AlertTriangle size={18} /> {t('obs_attention_title')}</h2>
          <div className="alerts-grid">
            {analytics.orphans?.length > 0 && (
              <div className="alert-block">
                <h3>{t('obs_orphans_title', { count: analytics.orphans.length })}</h3>
                <p className="alert-hint">{t('obs_orphans_hint')}</p>
                {analytics.orphans.slice(0, 5).map((o) => (
                  <button key={o.path} type="button" className="alert-link" onClick={() => readNote(o.path)}>
                    {o.title} <small>{o.wordCount}{t('obs_words_short')}{o.hasSemanticLink ? t('obs_has_ollama_link') : ''}</small>
                  </button>
                ))}
              </div>
            )}
            {analytics.stale?.length > 0 && (
              <div className="alert-block">
                <h3>{t('obs_stale_title', { count: analytics.stale.length })}</h3>
                {analytics.stale.slice(0, 5).map((s) => (
                  <button key={s.path} type="button" className="alert-link" onClick={() => readNote(s.path)}>
                    {s.title} <small>{formatDate(s.updatedAt, locale, t)}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );

  return (
    <div className="obsidian-page">
      <div className="obsidian-bg" />
      <div className="obsidian-window obsidian-window-wide obsidian-layout-v2">
        <header className="obsidian-status-bar">
          <Link to="/dashboard" className="back-btn">
            <ArrowLeft size={16} /> {t('obs_back')}
          </Link>
          <div className="obsidian-title">
            <FileText size={18} />
            <span>База знаний</span>
            <span className="demo-notes-label">{t('demo_notes_label')}</span>
          </div>
          <div className="obsidian-status">
            <span className={serverOnline ? 'status-online' : 'status-error'}>
              <i className="status-dot" /> {serverOnline ? t('obs_server_online') : t('obs_server_offline')}
            </span>
            <span className={isConnected ? 'status-online' : 'status-error'} title={connectionMessage || ''}>
              <i className="status-dot" />
              {isConnected
                ? t('obs_connected', { url: obsidianUrl || 'ok' })
                : t('obs_not_connected', { message: connectionMessage ? `: ${connectionMessage}` : '' })}
            </span>
          </div>
          <div className="obsidian-toolbar">
            <button type="button" className="intel-btn secondary" onClick={loadIntelligence} disabled={loading} title={t('obs_refresh_title')}>
              <RefreshCw size={14} className={loading ? 'spin' : ''} />
            </button>
          </div>
        </header>

        {error && <div className="intel-error obsidian-error">{error}</div>}

        <div className="kpi-strip">
          <div className="intel-metric-card">
            <Network size={14} />
            <span className="label">{t('obs_kpi_synergy')}</span>
            <strong>{synergy}%</strong>
          </div>
          <div className="intel-metric-card">
            <AlertTriangle size={14} />
            <span className="label">{t('obs_kpi_risk')}</span>
            <strong>{Math.round(risk * 100)}%</strong>
          </div>
          <div className="intel-metric-card">
            <FileText size={14} />
            <span className="label">{t('obs_kpi_notes')}</span>
            <strong>{status?.notesCount ?? notes.length}</strong>
          </div>
          <div className="intel-metric-card">
            <Link2 size={14} />
            <span className="label">{t('obs_kpi_links')}</span>
            <strong>{status?.linksCount ?? 0}</strong>
          </div>
        </div>

        <div className="obsidian-body">
          <aside className="obsidian-sidebar obsidian-sidebar-v2">
            <div className="control-panel">
              <div className="control-panel-head">
                <BarChart3 size={14} />
                <span>{t('obs_control_panel')}</span>
              </div>
              <div className="control-stats">
                <div className="control-stat">
                  <span>{t('obs_index')}</span>
                  <strong>{status?.notesCount ?? t('common_dash')}</strong>
                </div>
                <div className="control-stat">
                  <span>{t('obs_links')}</span>
                  <strong>{status?.linksCount ?? t('common_dash')}</strong>
                </div>
              </div>
              {status?.lastSyncAt && (
                <p className="control-sync"><Clock size={11} /> {formatSyncAgo(status.lastSyncAt, t)}</p>
              )}
              <button type="button" className="control-sync-btn" onClick={handleSync} disabled={syncing}>
                <RefreshCw size={12} className={syncing ? 'spin' : ''} />
                {syncing ? t('obs_syncing') : t('obs_sync_btn')}
              </button>
            </div>

            <div className="sidebar-header">
              <div className="search-wrapper">
                <Search size={14} />
                <input
                  placeholder={t('obs_search_placeholder')}
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                />
              </div>
              <button type="button" className="create-btn" onClick={() => setShowCreateModal(true)} title={t('obs_new_note')}>
                <Plus size={16} />
              </button>
            </div>

            <div className="note-list">
              {loadingNotes ? (
                <div className="loading-spinner">{t('common_loading')}</div>
              ) : filteredNotes.length === 0 ? (
                <div className="empty-notes">
                  <p>{t('obs_no_notes')}</p>
                  <span>{t('obs_empty_notes_hint')}</span>
                </div>
              ) : (
                filteredNotes.map((note) => (
                  <div
                    key={note.path}
                    className={`note-item ${selectedNote === note.path ? 'active' : ''}`}
                    onClick={() => readNote(note)}
                  >
                    <FileText size={16} className="note-icon" />
                    <div className="note-info">
                      <div className="note-name">{note.displayTitle}</div>
                      <div className="note-meta">
                        {note.folder && <span className="note-folder">{note.folder}</span>}
                        {note.wordCount != null && <span>{note.wordCount}{t('obs_words_short')}</span>}
                        {note.updatedAt && <span>{formatDate(note.updatedAt, locale, t)}</span>}
                        {!note.indexed && <span className="note-unindexed">{t('obs_not_indexed')}</span>}
                      </div>
                      {note.preview && <div className="note-preview">{note.preview}</div>}
                    </div>
                    <button
                      type="button"
                      className="open-obsidian-btn"
                      onClick={(e) => { e.stopPropagation(); deleteNote(note); }}
                      title={t('action_delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </aside>

          <div className="obsidian-main">
            {selectedNote ? (
              renderNoteViewer()
            ) : (
              <>
                <nav className="intel-tabs obsidian-tabs">
                  {tabs.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={tab === item.id ? 'active' : ''}
                        onClick={() => setTab(item.id)}
                      >
                        <Icon size={13} />
                        {item.label}
                      </button>
                    );
                  })}
                </nav>

                <main className="intel-content obsidian-intel-scroll">
                  {tab === 'dashboard' && renderDashboard()}

                  {tab === 'agent' && (
                    <section className="intel-panel agent-panel wide">
                      <div className="panel-head-row">
                        <h2><Bot size={18} /> {t('obs_agent_panel_title')}</h2>
                        <button type="button" className="intel-btn primary" onClick={handleRunAgent} disabled={agentRunning}>
                          <Bot size={13} className={agentRunning ? 'spin' : ''} />
                          {agentRunning ? t('obs_agent_running_full') : t('obs_agent_run_full')}
                        </button>
                      </div>
                      <p className="muted">
                        {t('obs_agent_desc')}
                        {agentMeta?.updatedAt && t('obs_agent_last_report', { ago: formatSyncAgo(agentMeta.updatedAt, t) })}
                      </p>
                      <div className="agent-actions">
                        <button type="button" className="intel-btn secondary" onClick={handleDiscoverLinks} disabled={discoveringLinks}>
                          <Link2 size={13} /> {t('obs_links_only')}
                        </button>
                        <button type="button" className="intel-btn secondary" onClick={() => setTab('graph')}>
                          <Network size={13} /> {t('obs_open_graph')}
                        </button>
                        <button type="button" className="intel-btn secondary" onClick={() => setTab('chat')}>
                          <MessageCircle size={13} /> {t('obs_tab_chat')}
                        </button>
                      </div>
                      {agentReport ? (
                        <div className="ai-summary agent-report">{renderPlainText(agentReport)}</div>
                      ) : (
                        <div className="agent-empty">
                          <Bot size={40} />
                          <p>{t('obs_agent_empty_hint')}</p>
                        </div>
                      )}
                    </section>
                  )}

                  {tab === 'analytics' && (
                    <div className="intel-grid">
                      <section className="intel-panel">
                        <h2><TrendingUp size={18} /> {t('obs_note_load_title')}</h2>
                        {metrics?.noteLoad ? (
                          <>
                            <div className="note-load-summary">
                              <div className="note-load-overall">
                                <span>{t('obs_activity_2w')}</span>
                                <strong>{metrics.noteLoad.overall}%</strong>
                              </div>
                              <small className="muted">
                                {t('obs_note_load_summary', {
                                  recent: metrics.noteLoad.recentNotes,
                                  total: metrics.noteLoad.totalNotes,
                                  avg: metrics.noteLoad.avgWords,
                                  density: metrics.noteLoad.linkDensity,
                                })}
                              </small>
                            </div>
                            {(metrics.noteLoad.folders || []).map((item) => (
                              <div key={item.folder} className="project-heat-item">
                                <div className="project-heat-head">
                                  <span>{item.folder}</span>
                                  <strong style={{ color: '#a5b4fc' }}>{item.load}%</strong>
                                </div>
                                <div className="heat-bar">
                                  <div
                                    className="heat-fill"
                                    style={{
                                      width: `${Math.min(item.load, 100)}%`,
                                      background: 'linear-gradient(90deg,#6366f1,#a5b4fc)',
                                    }}
                                  />
                                </div>
                                <small className="muted">{t('obs_folder_load_meta', { notes: item.notes, edits: item.recentEdits })}</small>
                              </div>
                            ))}
                          </>
                        ) : (
                          <p className="muted">{t('obs_vault_sync_hint')}</p>
                        )}
                      </section>

                      <section className="intel-panel">
                        <h2><Users size={18} /> {t('obs_experts_title')}</h2>
                        <div className="experts-list">
                          {(metrics?.experts || []).map((expert, index) => (
                            <button key={expert.path} type="button" className="expert-item clickable" onClick={() => readNote(expert.path)}>
                              <span className="expert-rank">№{index + 1}</span>
                              <div>
                                <strong>{expert.title}</strong>
                                <small>{t('obs_expert_meta', { citations: expert.citations, score: expert.score })}</small>
                              </div>
                            </button>
                          ))}
                        </div>
                      </section>

                      <section className="intel-panel">
                        <h2><AlertTriangle size={18} /> {t('obs_risks_title')}</h2>
                        {metrics?.risks ? (
                          <div className="risk-grid">
                            <div className="risk-item"><span>{t('obs_risk_stagnation')}</span><strong>{Math.round((metrics.risks.stagnationRisk || 0) * 100)}%</strong></div>
                            <div className="risk-item"><span>{t('obs_risk_flight')}</span><strong>{Math.round(metrics.risks.knowledgeFlightRisk * 100)}%</strong></div>
                            <div className="risk-item"><span>{t('obs_risk_composite')}</span><strong>{Math.round(metrics.risks.composite * 100)}%</strong></div>
                          </div>
                        ) : <p className="muted">{t('obs_no_data')}</p>}
                      </section>

                      <section className="intel-panel wide">
                        <div className="panel-head-row">
                          <h2><Bot size={18} /> {t('obs_ai_overview')}</h2>
                          <button type="button" className="intel-btn secondary" onClick={handleAiInsights}>{t('obs_generate')}</button>
                        </div>
                        {aiSummary ? <div className="ai-summary">{renderPlainText(aiSummary)}</div> : <p className="muted">{t('obs_ai_overview_hint')}</p>}
                      </section>

                      <section className="intel-panel wide landscape-panel">
                        <h2>{t('obs_landscape_title')}</h2>
                        <svg viewBox="-450 -350 900 700" className="landscape-svg">
                          {landscape.map((point) => (
                            <g key={point.id} transform={`translate(${point.x}, ${point.y})`}>
                              <circle r={6 + Math.min(point.density || 0, 200) / 30} fill="rgba(129,140,248,0.55)" stroke="rgba(199,210,254,0.8)" />
                              <title>{point.label}</title>
                            </g>
                          ))}
                        </svg>
                      </section>
                    </div>
                  )}

                  {tab === 'graph' && (
                    <section className="intel-panel graph-panel">
                      <div className="panel-head-row">
                        <h2><Network size={18} /> {t('obs_graph_title')}</h2>
                        <button
                          type="button"
                          className="intel-btn primary"
                          onClick={handleDiscoverLinks}
                          disabled={discoveringLinks || loading}
                        >
                          <Bot size={13} className={discoveringLinks ? 'spin' : ''} />
                          {discoveringLinks ? t('obs_ollama_analyzing') : t('obs_find_links')}
                        </button>
                      </div>
                      <p className="muted graph-hint">
                        {t('obs_graph_stats', {
                          nodes: graph?.nodes?.length || 0,
                          edges: graph?.edges?.length || 0,
                          semantic: semanticLinks.length,
                        })}
                      </p>
                      <div className="graph-controls-hint">
                        <span>{t('obs_graph_lmb_rotate')}</span>
                        <span>{t('obs_graph_wheel_zoom')}</span>
                        <span>{t('obs_graph_rmb')}</span>
                        <span>{t('obs_graph_click')}</span>
                      </div>
                      <div className="graph-legend">
                        <span><i className="legend-dot wiki" /> {t('obs_legend_wikilink')}</span>
                        <span><i className="legend-dot semantic" /> {t('obs_legend_semantic')}</span>
                        <span><i className="legend-dot new" /> {t('obs_legend_new')}</span>
                      </div>
                      <div className="graph-3d-host">
                        {graph?.nodes?.length ? (
                          <Suspense fallback={<div className="graph-3d-loading">{t('obs_graph_loading')}</div>}>
                            <KnowledgeGraph3D graph={graph} onNodeClick={readNote} wordsSuffix={t('obs_words_short')} />
                          </Suspense>
                        ) : (
                          <p className="muted overlay-msg graph-empty-msg">{t('obs_graph_sync_hint')}</p>
                        )}
                      </div>
                      {semanticLinks.length > 0 && (
                        <div className="semantic-links-list">
                          <h3><Link2 size={14} /> {t('obs_semantic_links_title')}</h3>
                          {semanticLinks.map((link) => (
                            <div key={`${link.source_path}-${link.target_path}`} className="semantic-link-item">
                              <button type="button" className="link-mini-btn" onClick={() => readNote(link.source_path)}>
                                {link.source_title || noteLabel(link.source_path, t)}
                              </button>
                              <span className="semantic-arrow">{t('obs_semantic_link_word')}</span>
                              <button type="button" className="link-mini-btn" onClick={() => readNote(link.target_path)}>
                                {link.target_title || noteLabel(link.target_path, t)}
                              </button>
                              <small>{link.reason} ({Math.round((link.strength || 0) * 100)}%)</small>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                  )}

                  {tab === 'chat' && (
                    <section className="intel-panel chat-panel">
                      <h2><MessageCircle size={18} /> {t('obs_rag_title')}</h2>
                      <div className="chat-suggestions">
                        {ragSuggestions.map((q) => (
                          <button key={q} type="button" className="chat-suggestion" onClick={() => setChatInput(q)}>{q}</button>
                        ))}
                      </div>
                      <div className="chat-log">
                        {chatMessages.length === 0 && (
                          <p className="muted chat-empty">{t('obs_rag_empty')}</p>
                        )}
                        {chatMessages.map((msg, index) => (
                          <div key={index} className={`chat-bubble ${msg.role}`}>
                            <div className="chat-text">
                              {msg.role === 'assistant' ? renderPlainText(msg.content) : <p>{msg.content}</p>}
                            </div>
                            {msg.sources?.length > 0 && (
                              <div className="chat-sources">
                                {msg.sources.map((src) => (
                                  <button key={src.path} type="button" className="chat-source-link" onClick={() => readNote(src.path)}>
                                    {src.title || noteLabel(src.path, t)}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="chat-input-row">
                        <input
                          value={chatInput}
                          onChange={(e) => setChatInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !chatLoading && handleChat()}
                          placeholder={t('obs_rag_placeholder')}
                          disabled={chatLoading}
                        />
                        <button type="button" className="intel-btn primary" onClick={handleChat} disabled={chatLoading}>
                          {chatLoading ? t('obs_rag_thinking') : t('obs_rag_ask')}
                        </button>
                      </div>
                    </section>
                  )}

                  {tab === 'ideas' && (
                    <section className="intel-panel">
                      <div className="panel-head-row">
                        <h2><Zap size={18} /> {t('obs_ideas_title')}</h2>
                        <button type="button" className="intel-btn primary" onClick={handleIdeas} disabled={loading}>{t('obs_ideas_find')}</button>
                      </div>
                      <p className="muted">{t('obs_ideas_desc')}</p>
                      <div className="ideas-list">
                        {ideas.map((idea, index) => (
                          <article key={index} className="idea-card">
                            <div className="idea-text">{renderPlainText(idea.text)}</div>
                            <div className="idea-sources">{idea.sources?.map((src) => <span key={src}>{src}</span>)}</div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}
                </main>
              </>
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('obs_new_note_title')}</h2>
              <button type="button" className="close-btn" onClick={() => setShowCreateModal(false)} title={t('action_close')}><X size={18} /></button>
            </div>
            <form className="modal-body" onSubmit={createNote}>
              <div className="input-group">
                <label>{t('obs_field_name')}</label>
                <input value={newNoteName} onChange={(e) => setNewNoteName(e.target.value)} required />
              </div>
              <div className="input-group">
                <label>{t('obs_field_content')}</label>
                <textarea rows={5} value={newNoteContent} onChange={(e) => setNewNoteContent(e.target.value)} />
              </div>
              <button type="submit" className="primary-btn" disabled={!serverOnline}>
                <ExternalLink size={14} /> {creationStatus || t('obs_create_note')}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ObsidianPage;
