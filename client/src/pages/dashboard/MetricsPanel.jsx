import React from 'react';
import SalesChartEditor from '../../components/SalesChartEditor';
import PanelState from './PanelState';

export default function MetricsPanel({
  points,
  editing,
  onStart,
  draftPoints,
  onChange,
  onSave,
  saving,
  message,
  messageType,
  status,
  t,
  onRetry,
}) {
  if (status === 'loading') return <PanelState text={t('panel_loading')} />;
  if (status === 'error') {
    return <PanelState text={t('panel_error')} actionLabel={t('panel_retry')} onAction={onRetry} />;
  }
  if (!editing && points.length === 0) {
    return (
      <PanelState
        text={t('home_metrics_empty')}
        actionLabel={t('home_add_metric')}
        onAction={onStart}
      />
    );
  }
  return (
    <SalesChartEditor
      draftPoints={draftPoints}
      onChange={onChange}
      onSave={onSave}
      saving={saving}
      message={message}
      messageType={messageType}
    />
  );
}
