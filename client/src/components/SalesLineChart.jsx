import React, { useMemo } from 'react';
import './SalesLineChart.css';

const VB_W = 320;
const VB_H = 140;

export function computeSalesStats(points) {
  const list = (points || []).filter((p) => p?.label != null);
  if (!list.length) return { last: 0, growth: 0, total: 0 };
  const values = list.map((p) => Number(p.value) || 0);
  const total = values.reduce((a, b) => a + b, 0);
  const first = values[0];
  const last = values[values.length - 1];
  const growth = first ? ((last - first) / Math.abs(first)) * 100 : 0;
  return { last, growth, total };
}

export function formatSalesValue(value, locale) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number(value) || 0);
}

export default function SalesLineChart({ points = [], compact = false, className = '' }) {
  const pad = compact
    ? { top: 10, right: 10, bottom: 18, left: 28 }
    : { top: 14, right: 14, bottom: 30, left: 40 };

  const layout = useMemo(() => {
    const list = (points || []).filter((p) => p?.label != null);
    if (!list.length) return null;

    const values = list.map((p) => Number(p.value) || 0);
    let minV = Math.min(...values);
    let maxV = Math.max(...values);
    if (minV === maxV) {
      minV -= 1;
      maxV += 1;
    }
    const range = maxV - minV;
    const innerW = VB_W - pad.left - pad.right;
    const innerH = VB_H - pad.top - pad.bottom;

    const nodes = list.map((p, i) => {
      const x = pad.left + (list.length === 1 ? innerW / 2 : (i / (list.length - 1)) * innerW);
      const v = Number(p.value) || 0;
      const y = pad.top + (1 - (v - minV) / range) * innerH;
      return { x, y, label: p.label, value: v };
    });

    const yTicks = [minV, minV + range / 2, maxV];

    return {
      nodes,
      polyline: nodes.map((n) => `${n.x},${n.y}`).join(' '),
      yTicks,
      innerH,
    };
  }, [points, pad.left, pad.right, pad.top, pad.bottom]);

  if (!layout) {
    return <div className={`sales-line-chart empty ${className}`.trim()} />;
  }

  const { nodes, polyline, yTicks, innerH } = layout;

  return (
    <svg
      className={`sales-line-chart ${compact ? 'compact' : ''} ${className}`.trim()}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
    >
      {yTicks.map((tick, i) => {
        const y = pad.top + (1 - i / (yTicks.length - 1)) * innerH;
        return (
          <g key={`${tick}-${i}`}>
            <line
              x1={pad.left}
              y1={y}
              x2={VB_W - pad.right}
              y2={y}
              className="sales-grid-line"
            />
            <text x={pad.left - 4} y={y + 3} className="sales-axis-label" textAnchor="end">
              {tick % 1 === 0 ? tick.toFixed(0) : tick.toFixed(1)}
            </text>
          </g>
        );
      })}

      <polyline points={polyline} className="sales-line" />
      {nodes.map((node, i) => (
        <g key={`${node.label}-${i}`}>
          <circle cx={node.x} cy={node.y} r={compact ? 2.5 : 4} className="sales-dot" />
          {!compact && (
            <text x={node.x} y={VB_H - 6} className="sales-x-label" textAnchor="middle">
              {node.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
