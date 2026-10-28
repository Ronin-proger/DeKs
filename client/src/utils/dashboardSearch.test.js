import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSiteFeatures, searchDashboard } from './dashboardSearch.js';

test('buildSiteFeatures returns feature entries', () => {
  const t = (key) => key;
  const index = buildSiteFeatures(t);
  assert.ok(Array.isArray(index));
  assert.ok(index.some((item) => item.id === 'feat-obs-rag'));
});

test('searchDashboard matches keywords', () => {
  const t = (key) => key;
  const hits = searchDashboard('rag', { t });
  assert.ok(hits.length >= 1);
  assert.ok(hits.some((item) => item.id === 'feat-obs-rag'));
});
