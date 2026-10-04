const matchQuery = (q, ...parts) => {
  const hay = parts.filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
};

export function buildSiteFeatures(t) {
  return [
    { id: 'feat-messenger', title: t('nav_messenger'), subtitle: t('dash_chat'), category: 'features', keywords: 'мессенджер чат сообщения messenger chat', kind: 'page', target: '/messenger' },
    { id: 'feat-obsidian', title: t('nav_obsidian'), subtitle: 'NeuroVault', category: 'features', keywords: 'obsidian neurovault заметки vault синхронизация', kind: 'page', target: '/obsidian' },
    { id: 'feat-ai-chat', title: t('nav_ai_chat'), subtitle: t('home_knowledge_title'), category: 'features', keywords: 'вопрос по заметкам источники база знаний', kind: 'page', target: '/obsidian' },
    { id: 'feat-dashboard', title: t('nav_dashboard'), subtitle: t('dash_home'), category: 'features', keywords: 'дашборд главная dashboard home', kind: 'page', target: '/dashboard' },
    { id: 'feat-about', title: t('nav_about'), subtitle: '', category: 'features', keywords: 'о проекте about', kind: 'page', target: '/about' },
    { id: 'feat-team', title: t('dash_team'), subtitle: '', category: 'features', keywords: 'команда team разработчики', kind: 'modal', target: 'team' },
    { id: 'feat-docs', title: t('dash_docs'), subtitle: t('dash_files'), category: 'features', keywords: 'документы файлы upload загрузка docs files', kind: 'modal', target: 'docs' },
    { id: 'feat-links', title: t('dash_links'), subtitle: t('dash_links_widget'), category: 'features', keywords: 'ссылки быстрые links', kind: 'modal', target: 'links' },
    { id: 'feat-notes', title: t('nav_obsidian'), subtitle: t('demo_notes_label'), category: 'features', keywords: 'база знаний заметки obsidian', kind: 'page', target: '/obsidian' },
    { id: 'feat-tasks', title: t('dash_tasks'), subtitle: t('tasks_modal_title'), category: 'features', keywords: 'задачи todo tasks приоритет', kind: 'modal', target: 'tasks' },
    { id: 'feat-calendar', title: t('dash_calendar'), subtitle: t('calendar_title'), category: 'features', keywords: 'календарь события calendar events', kind: 'modal', target: 'tracker' },
    { id: 'feat-settings', title: t('dash_settings'), subtitle: t('settings_language'), category: 'features', keywords: 'настройки язык localization lang settings sazlamalar', kind: 'modal', target: 'settings' },
    { id: 'feat-profile', title: t('dash_profile'), subtitle: '', category: 'features', keywords: 'профиль аватар profile avatar', kind: 'modal', target: 'profile' },
    { id: 'feat-notifications', title: t('search_notifications'), subtitle: '', category: 'features', keywords: 'уведомления notifications bell колокольчик', kind: 'modal', target: 'notifications' },
    { id: 'feat-chart', title: t('search_chart'), subtitle: t('dash_hero_badge'), category: 'features', keywords: 'график отчёт аналитика chart sales', kind: 'modal', target: 'imageModal' },
    { id: 'feat-obs-graph', title: t('search_obs_graph'), subtitle: t('nav_obsidian'), category: 'features', keywords: 'граф знаний связи ollama semantic graph', kind: 'page', target: '/obsidian', tab: 'graph' },
    { id: 'feat-obs-rag', title: t('search_obs_rag'), subtitle: t('nav_obsidian'), category: 'features', keywords: 'rag чат заметки obsidian chat', kind: 'page', target: '/obsidian', tab: 'chat' },
    { id: 'feat-obs-agent', title: t('search_obs_agent'), subtitle: t('nav_obsidian'), category: 'features', keywords: 'ai агент agent анализ vault', kind: 'page', target: '/obsidian', tab: 'agent' },
    { id: 'feat-obs-analytics', title: t('search_obs_analytics'), subtitle: t('nav_obsidian'), category: 'features', keywords: 'аналитика метрики synergy риск', kind: 'page', target: '/obsidian', tab: 'analytics' },
    { id: 'feat-obs-ideas', title: t('search_obs_ideas'), subtitle: t('nav_obsidian'), category: 'features', keywords: 'идеи ideas brainstorm', kind: 'page', target: '/obsidian', tab: 'ideas' },
  ];
}

export function searchDashboard(query, { t, tasks = [], files = [], links = [], events = [], parserHistory = [] }) {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const results = [];

  for (const item of buildSiteFeatures(t)) {
    if (matchQuery(q, item.title, item.subtitle, item.keywords)) {
      results.push(item);
    }
  }

  for (const task of tasks) {
    if (matchQuery(q, task.text, task.priority, task.dueDate)) {
      results.push({
        id: `task-${task.id}`,
        title: task.text,
        subtitle: task.dueDate ? `${t('tasks_due')}: ${task.dueDate}` : t('dash_tasks'),
        category: 'tasks',
        kind: 'modal',
        target: 'tasks',
      });
    }
  }

  for (const file of files) {
    if (matchQuery(q, file.originalName, file.mimeType)) {
      results.push({
        id: `file-${file.id}`,
        title: file.originalName,
        subtitle: t('dash_files'),
        category: 'files',
        kind: 'modal',
        target: 'docs',
      });
    }
  }

  for (const link of links) {
    if (matchQuery(q, link.title, link.url)) {
      results.push({
        id: `link-${link.id}`,
        title: link.title || link.url,
        subtitle: link.url,
        category: 'links',
        kind: 'external',
        target: link.url,
      });
    }
  }

  for (const event of events) {
    if (matchQuery(q, event.title, event.note, event.date)) {
      results.push({
        id: `event-${event.id}`,
        title: event.title,
        subtitle: event.date,
        category: 'events',
        kind: 'event',
        target: 'tracker',
        payload: { date: event.date },
      });
    }
  }

  return results.slice(0, 14);
}

export const SEARCH_CATEGORY_KEYS = {
  features: 'search_cat_features',
  tasks: 'search_cat_tasks',
  files: 'search_cat_files',
  links: 'search_cat_links',
  events: 'search_cat_events',
  parser: 'search_cat_parser',
};
