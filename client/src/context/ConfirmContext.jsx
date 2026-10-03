import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from './LanguageContext';
import './ConfirmDialog.css';

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);
  const { t } = useLanguage();

  const confirm = useCallback((options) => new Promise((resolve) => {
    resolveRef.current = resolve;
    setDialog({
      title: options.title ?? t('confirm_title'),
      message: options.message ?? '',
      confirmText: options.confirmText ?? t('action_confirm'),
      cancelText: options.cancelText ?? t('action_cancel'),
      variant: options.variant ?? 'default',
    });
  }), [t]);

  const close = useCallback((result) => {
    setDialog(null);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    resolve?.(result);
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') close(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialog, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div
          className="confirm-overlay"
          role="presentation"
          onClick={() => close(false)}
        >
          <div
            className={`confirm-dialog confirm-${dialog.variant}`}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-message"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-icon-wrap">
              <AlertTriangle size={22} />
            </div>
            <h2 id="confirm-dialog-title" className="confirm-title">{dialog.title}</h2>
            <p id="confirm-dialog-message" className="confirm-message">{dialog.message}</p>
            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-btn confirm-btn-cancel"
                onClick={() => close(false)}
              >
                {dialog.cancelText}
              </button>
              <button
                type="button"
                className="confirm-btn confirm-btn-ok"
                autoFocus
                onClick={() => close(true)}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within ConfirmProvider');
  return ctx;
}
