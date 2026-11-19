import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
const system = Object.fromEntries(Object.entries(process.env).filter(([name]) => /^(path|pathext|systemroot|windir|comspec|temp|tmp|userprofile|appdata|localappdata|home)$/i.test(name)));
const base = { ...system, BETTER_AUTH_SECRET: 'synthetic-refusal-test-000000000000000000', BETTER_AUTH_URL: 'http://127.0.0.1:3000' };
test('review launcher refuses remote targets and connection query overrides before starting Next', () => {
  for (const url of ['postgresql://fixture:PRIVATE_MARKER@example.invalid/aoc_stage04_rehearsal_abc', 'postgresql://fixture:PRIVATE_MARKER@127.0.0.1/aoc_stage04_rehearsal_abc?host=example.invalid', 'postgresql://fixture:PRIVATE_MARKER@127.0.0.1/production']) {
    const result = spawnSync(process.execPath, ['scripts/dev-platform-review.mjs'], { encoding: 'utf8', env: { ...base, DATABASE_URL: url }, timeout: 10000 });
    assert.equal(result.status, 1); assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_MARKER|postgresql:\/\/|Starting|Ready/);
  }
});
test('synthetic owner seeder rejects mismatched operator/runtime databases without connecting or exposing credentials', () => {
  const result = spawnSync(process.execPath, ['scripts/seed-platform-review.mjs', '--confirm-database', 'aoc_stage04_rehearsal_abc'], { encoding: 'utf8', env: { ...base,
    DATABASE_URL: 'postgresql://runtime:PRIVATE_MARKER@127.0.0.1:1/aoc_stage04_rehearsal_abc',
    AGENCY_MIGRATION_DATABASE_URL: 'postgresql://operator:PRIVATE_MARKER@example.invalid/aoc_stage04_rehearsal_abc' }, timeout: 10000 });
  assert.equal(result.status, 1); assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_MARKER|postgresql:\/\/|ENOTFOUND|ECONNREFUSED/);
});
