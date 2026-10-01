import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const plan = await readFile('docs/STAGING_REBUILD_PREPARATION.md', 'utf8');
const guard = await readFile('scripts/verify-staging-migrations.sh', 'utf8');
const migrationFiles = await readdir('supabase/migrations');
const normalizedPlan = plan.replace(/\s+/g, ' ');

for (const marker of [
  '27 recorded migrations',
  '20260821120417',
  '20260916184458',
  'zero recorded migrations',
  'solo-maintainer review',
  'Pass A',
  'Pass B',
  'static offline structural validation',
  'SECURITY DEFINER',
  'synthetic',
  '/api/ai-fridge'
]) {
  assert(normalizedPlan.includes(marker), `Staging preparation plan is missing required marker: ${marker}`);
}

assert.match(guard, /TARGET_PROJECT_REF.*STAGING_PROJECT_REF/);
assert.match(guard, /linked_ref.*STAGING_PROJECT_REF/);
assert.match(guard, /db push --linked --dry-run/);
assert.match(guard, /BLOCKED: no reviewed schema baseline exists/);
assert.match(guard, /Fresh-database apply and deterministic fingerprint validation: passed/);
assert.equal(
  migrationFiles.filter((name) => name.endsWith('.sql')).length,
  0,
  'Executable migrations are forbidden until the reviewed baseline is authorized.'
);

function runGuard(cwd, target) {
  const result = spawnSync('bash', [resolve('scripts/verify-staging-migrations.sh')], {
    cwd,
    env: {
      ...process.env,
      TARGET_PROJECT_REF: target,
      STAGING_VERIFICATION_CONFIRMED: 'yes'
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  assert.notEqual(result.status, 0, 'The staging guard unexpectedly allowed remote inspection.');
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

const sandbox = await mkdtemp(join(tmpdir(), 'staging-guard-'));
try {
  await mkdir(join(sandbox, 'supabase/migrations'), { recursive: true });
  await mkdir(join(sandbox, 'supabase/.temp'), { recursive: true });
  const candidate = '-- inert test fixture; never executed\n';
  await writeFile(join(sandbox, 'supabase/migrations/20261001000000_baseline.sql'), candidate);
  await writeFile(join(sandbox, 'supabase/.temp/project-ref'), 'vjtvjdhwdwwyjfomxfqs\n');
  await writeFile(join(sandbox, 'supabase/migrations/REVIEW_ATTESTATION.md'), [
    'Pass A: approved',
    'Pass B: approved',
    'Static offline structural validation: passed',
    'Encrypted source SHA-256: ' + 'a'.repeat(64),
    // Deliberately omit the unimplemented future-validation passing attestation.
    'Sanitized candidate SHA-256: placeholder',
    ''
  ].join('\n'));

  assert.match(
    runGuard(sandbox, 'vjtvjdhwdwwyjfomxfqs'),
    /fresh-database apply and deterministic fingerprint validation is not implemented or has not passed/,
    'Pass A/Pass B and static validation must not unlock staging inspection.'
  );
  assert.match(
    runGuard(sandbox, 'ccvdkbdnykfhenhqkicm'),
    /Refusing to inspect or apply migrations against production/,
    'Production must remain blocked before any remote command.'
  );
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

console.log('Staging preparation inventory and fail-closed safeguards are consistent.');
