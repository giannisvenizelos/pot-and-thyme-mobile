import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const audit = JSON.parse(await readFile('fixtures/staging/synthetic-coverage-audit.json', 'utf8'));
const document = await readFile('docs/STAGING_READINESS_GAPS.md', 'utf8');
const snapshotMatch = document.match(/```json readiness-audit\n([\s\S]*?)\n```/);

assert(snapshotMatch, 'Readiness document is missing its readiness-audit JSON snapshot.');
const snapshot = JSON.parse(snapshotMatch[1]);
const statuses = ['covered', 'partial', 'not-covered', 'blocked-unknown-semantics'];
const dependenciesByStatus = Object.fromEntries(statuses.map(status => [
  status,
  audit.dependencies.filter(dependency => dependency.status === status).map(dependency => dependency.id)
]));

assert.deepEqual(snapshot.counts, {
  total: audit.dependencies.length,
  ...Object.fromEntries(statuses.map(status => [status, dependenciesByStatus[status].length]))
}, 'Documented readiness counts drifted from the synthetic coverage audit.');
assert.deepEqual(snapshot.partial, dependenciesByStatus.partial, 'Documented partial dependency list drifted from the synthetic coverage audit.');
assert.deepEqual(snapshot['blocked-unknown-semantics'], dependenciesByStatus['blocked-unknown-semantics'], 'Documented blocked dependency list drifted from the synthetic coverage audit.');

console.log(`Verified readiness summary for ${audit.dependencies.length} tracked dependencies.`);
