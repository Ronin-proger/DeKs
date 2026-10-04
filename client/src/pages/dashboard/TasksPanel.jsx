import React from 'react';
import { CheckCircle, Flag, Plus, Trash2 } from 'lucide-react';
import PanelState from './PanelState';

export default function TasksPanel({
  mode = 'today',
  tasks,
  todayKey,
  status,
  t,
  onRetry,
  onOpen,
  onToggle,
  onDelete,
  onAdd,
  draft,
  onDraft,
}) {
  if (status === 'loading') {
    return <PanelState text={t('panel_loading')} />;
  }
  if (status === 'error') {
    return <PanelState text={t('panel_error')} actionLabel={t('panel_retry')} onAction={onRetry} />;
  }

  const visible = mode === 'today'
    ? tasks.filter((task) => !task.done && (!task.dueDate || task.dueDate <= todayKey))
    : tasks;

  if (mode === 'today') {
    return (
      <div className="widget widget-tasks">
        <div className="widget-header">
          <span className="widget-title"><CheckCircle size={16} /> {t('home_tasks_title')}</span>
        </div>
        {visible.length === 0 ? (
          <PanelState text={t('home_tasks_empty')} actionLabel={t('home_tasks_add')} onAction={onOpen} />
        ) : (
          <>
            <div className="task-list">
              {visible.slice(0, 4).map((task) => (
                <div key={task.id} className="task-item">
                  <div className="task-left">
                    <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} />
                    <span className="task-text">{task.text}</span>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="widget-btn" onClick={onOpen}>{t('home_tasks_all')}</button>
          </>
        )}
      </div>
    );
  }

  return (
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
          value={draft.text}
          onChange={(e) => onDraft({ ...draft, text: e.target.value })}
          rows={3}
        />
        <div className="task-form-row">
          <label>
            {t('tasks_priority')}
            <select value={draft.priority} onChange={(e) => onDraft({ ...draft, priority: e.target.value })}>
              <option value="low">{t('tasks_priority_low')}</option>
              <option value="medium">{t('tasks_priority_medium')}</option>
              <option value="high">{t('tasks_priority_high')}</option>
            </select>
          </label>
          <label>
            {t('tasks_due')}
            <input type="date" value={draft.due} onChange={(e) => onDraft({ ...draft, due: e.target.value })} />
          </label>
        </div>
        <button type="button" className="primary-btn" onClick={onAdd}>
          <Plus size={16} /> {t('tasks_add')}
        </button>
      </div>
      {visible.length === 0 ? (
        <PanelState text={t('home_tasks_empty')} />
      ) : (
        <div className="tasks-list-full">
          {visible.map((task) => (
            <div key={task.id} className={`task-row ${task.done ? 'done' : ''}`}>
              <label className="task-check">
                <input type="checkbox" checked={task.done} onChange={() => onToggle(task.id)} />
                <span>{task.text}</span>
              </label>
              <div className="task-meta">
                <span className={`priority-pill ${task.priority}`}>{task.priority}</span>
                {task.dueDate && <span className="task-due">{task.dueDate}</span>}
                <button type="button" className="task-delete" onClick={() => onDelete(task.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
