import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import SalesLineChart from './SalesLineChart';
import './SalesLineChart.css';

export default function SalesChartEditor({
  draftPoints,
  onChange,
  onSave,
  saving,
  message,
  messageType,
}) {
  const { t } = useLanguage();

  const updatePoint = (index, field, value) => {
    onChange(draftPoints.map((p, i) => (
      i === index ? { ...p, [field]: value } : p
    )));
  };

  const addPoint = () => {
    onChange([...draftPoints, { label: '', value: 0 }]);
  };

  const removePoint = (index) => {
    if (draftPoints.length <= 1) return;
    onChange(draftPoints.filter((_, i) => i !== index));
  };

  return (
    <div className="sales-chart-editor">
      <p className="sales-chart-hint">{t('chart_edit_hint')}</p>

      <div className="sales-chart-preview">
        <SalesLineChart points={draftPoints} />
      </div>

      <div className="sales-points-table">
        <div className="sales-points-head">
          <span>{t('chart_point_label')}</span>
          <span>{t('chart_point_value')}</span>
          <span />
        </div>
        {draftPoints.map((point, index) => (
          <div key={index} className="sales-point-row">
            <input
              type="text"
              value={point.label}
              onChange={(e) => updatePoint(index, 'label', e.target.value)}
              placeholder={t('chart_point_label')}
              maxLength={24}
            />
            <input
              type="number"
              step="0.1"
              value={point.value}
              onChange={(e) => updatePoint(index, 'value', e.target.value)}
            />
            <button
              type="button"
              className="sales-point-remove"
              title={t('chart_remove_point')}
              disabled={draftPoints.length <= 1}
              onClick={() => removePoint(index)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {message && (
        <p className={`sales-chart-message ${messageType || ''}`}>{message}</p>
      )}

      <div className="sales-chart-actions">
        <button type="button" className="secondary-btn" onClick={addPoint}>
          <Plus size={16} /> {t('chart_add_point')}
        </button>
        <button type="button" className="primary-btn" onClick={onSave} disabled={saving}>
          {saving ? t('profile_saving') : t('chart_save')}
        </button>
      </div>
    </div>
  );
}
