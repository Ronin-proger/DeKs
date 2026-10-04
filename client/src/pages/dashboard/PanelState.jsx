import React from 'react';

export default function PanelState({ text, actionLabel, onAction }) {
  return (
    <div className="panel-state">
      <p>{text}</p>
      {actionLabel && onAction ? (
        <button type="button" className="widget-btn" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
