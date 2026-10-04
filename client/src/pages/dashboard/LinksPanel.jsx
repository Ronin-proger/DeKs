import React from 'react';
import { Globe, Plus, Trash2 } from 'lucide-react';
import PanelState from './PanelState';

export default function LinksPanel({
  links,
  status,
  t,
  onRetry,
  draft,
  onDraft,
  onAdd,
  onDelete,
  iconOptions,
}) {
  if (status === 'loading') return <PanelState text={t('panel_loading')} />;
  if (status === 'error') {
    return <PanelState text={t('panel_error')} actionLabel={t('panel_retry')} onAction={onRetry} />;
  }

  return (
    <div className="links-manager-v2">
      <div className="link-add-card">
        <div className="link-add-header">
          <Globe size={18} />
          <div>
            <h3>{t('links_new_title')}</h3>
            <p>{t('links_new_hint')}</p>
          </div>
        </div>
        <div className="link-form-grid">
          <input
            type="text"
            placeholder={t('links_name_placeholder')}
            value={draft.title}
            onChange={(e) => onDraft({ ...draft, title: e.target.value })}
          />
          <input
            type="url"
            placeholder="https://..."
            value={draft.url}
            onChange={(e) => onDraft({ ...draft, url: e.target.value })}
          />
        </div>
        {iconOptions ? (
          <div className="icon-picker">
            {iconOptions}
          </div>
        ) : null}
        <button type="button" className="primary-btn link-add-btn" onClick={onAdd}>
          <Plus size={16} /> {t('links_add')}
        </button>
      </div>
      {links.length === 0 ? (
        <PanelState text={t('home_links_empty')} actionLabel={t('links_add')} onAction={onAdd} />
      ) : (
        <div className="quick-links">
          {links.map((link) => (
            <div key={link.id} className="file-item">
              <a href={link.url} target="_blank" rel="noopener noreferrer">{link.title}</a>
              <button type="button" className="task-delete" onClick={() => onDelete(link.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
