import React from 'react';
import { FileText, Folder, Trash2, Upload } from 'lucide-react';
import PanelState from './PanelState';

export default function FilesPanel({
  mode = 'recent',
  files,
  status,
  t,
  onRetry,
  onOpen,
  onUpload,
  onDelete,
  uploading,
}) {
  if (status === 'loading') return <PanelState text={t('panel_loading')} />;
  if (status === 'error') {
    return <PanelState text={t('panel_error')} actionLabel={t('panel_retry')} onAction={onRetry} />;
  }

  const list = mode === 'recent' ? files.slice(0, 3) : files;

  if (mode === 'recent') {
    return (
      <div className="widget widget-files">
        <div className="widget-header">
          <span className="widget-title"><Folder size={16} /> {t('home_files_title')}</span>
        </div>
        {list.length === 0 ? (
          <PanelState text={t('home_files_empty')} actionLabel={t('home_files_add')} onAction={onOpen} />
        ) : (
          <>
            <div className="files-list">
              {list.map((file) => (
                <div key={file.id} className="file-item">
                  <FileText size={14} />
                  <span className="file-name">{file.originalName}</span>
                </div>
              ))}
            </div>
            <button type="button" className="widget-btn" onClick={onOpen}>{t('home_files_all')}</button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="docs-manager">
      <button type="button" className="primary-btn" onClick={onUpload} disabled={uploading}>
        <Upload size={16} /> {uploading ? t('panel_loading') : t('home_files_add')}
      </button>
      {list.length === 0 ? (
        <PanelState text={t('home_files_empty')} actionLabel={t('home_files_add')} onAction={onUpload} />
      ) : (
        <div className="files-list">
          {list.map((file) => (
            <div key={file.id} className="file-item">
              <FileText size={14} />
              <span className="file-name">{file.originalName}</span>
              <button type="button" className="task-delete" onClick={() => onDelete(file.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
