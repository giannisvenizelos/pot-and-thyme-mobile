import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const plan = await readFile('docs/STAGING_REBUILD_PREPARATION.md', 'utf8');
const guard = await readFile('scripts/verify-staging-migrations.sh', 'utf8');
const migrationFiles = await readdir('supabase/migrations');

for (const marker of [
  '27 recorded migrations',
  '20260821120417',
  '20260916184458',
  'zero recorded migrations',
  'solo-maintainer review',
  'Pass A',
  'Pass B',
  'automated structural validation',
  'SECURITY DEFINER',
  'synthetic',
  '/api/ai-fridge'
]) {
  assert(plan.includes(marker), `Staging preparation plan is missing required marker: ${marker}`);
}

assert.match(guard, /TARGET_PROJECT_REF.*STAGING_PROJECT_REF/);
assert.match(guard, /linked_ref.*STAGING_PROJECT_REF/);
assert.match(guard, /db push --linked --dry-run/);
assert.match(guard, /BLOCKED: no reviewed schema baseline exists/);
assert.equal(
  migrationFiles.filter((name) => name.endsWith('.sql')).length,
  0,
  'Executable migrations are forbidden until the reviewed baseline is authorized.'
);

console.log('Staging preparation inventory and fail-closed safeguards are consistent.');
