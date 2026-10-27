import assert from 'node:assert/strict';
import test from 'node:test';
import { internalPanelPreviewData, resolveInternalPanelPreview } from '../../lib/internal-user-preview.js';

test('panel preview requires local development and an exact panel/workspace match', () => {
  assert.equal(resolveInternalPanelPreview({ debug_panel: 'team_directory' }, 'team', 'development', '127.0.0.1:3000')?.id,
    'team_directory');
  assert.equal(resolveInternalPanelPreview({ debug_panel: 'team_directory' }, 'team', 'development', 'localhost:3000')?.id,
    'team_directory');
  assert.equal(resolveInternalPanelPreview({ debug_panel: 'team_directory' }, 'team', 'production', 'localhost:3000'), null);
  assert.equal(resolveInternalPanelPreview({ debug_panel: 'team_directory' }, 'team', 'development', 'portal.example'), null);
  assert.equal(resolveInternalPanelPreview({ debug_panel: 'team_directory' }, 'personal', 'development', 'localhost'), null);
  assert.equal(resolveInternalPanelPreview({ debug_panel: ['team_directory'] }, 'team', 'development', 'localhost'), null);
  assert.equal(resolveInternalPanelPreview({ debug_panel: 'internal_access_manager' }, 'team', 'development', 'localhost'), null);
});

test('preview fixture has example-only accounts and no provider credentials', () => {
  const data = internalPanelPreviewData(new Date('2026-10-13T12:00:00Z'));
  assert.deepEqual(data.teamMembers.map(member => member.name), ['Alex Example', 'Taylor Example']);
  assert.equal(data.tasks[0].id, 'preview-1');
  assert.equal(data.tasks[0].href, undefined);
  assert.equal(data.connection.connected, false);
  assert.equal(data.workSummary.today.date, '2026-10-13');
});
