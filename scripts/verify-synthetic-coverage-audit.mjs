import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const audit = JSON.parse(await readFile('fixtures/staging/synthetic-coverage-audit.json', 'utf8'));
const fixture = JSON.parse(await readFile(audit.fixture, 'utf8'));
const requiredDependencyIds = [
  'rpc:get_app_bootstrap', 'rpc:create_household', 'rpc:join_household', 'rpc:remove_meal_plan_item',
  'rpc:create_community_recipe', 'rpc:moderate_community_recipe', 'rpc:edit_pending_community_recipe',
  'rpc:update_my_display_name', 'rpc:delete_my_account', 'rpc:export_my_data',
  'rpc:get_current_legal_versions', 'rpc:recipe_management_access', 'rpc:can_manage_recipe',
  'rpc:save_recipe', 'rpc:set_recipe_photo', 'rpc:delete_recipe', 'rpc:restore_recipe',
  'api:GET:/api/catalog', 'api:GET:/api/recipe', 'api:POST:/api/ai-fridge',
  'postgrest:recipes', 'postgrest:recipe_ingredients', 'postgrest:recipe_steps',
  'postgrest:recipe_categories', 'postgrest:recipe_subcategories', 'postgrest:meal_plan',
  'postgrest:shopping_checks', 'realtime:meal_plan', 'realtime:shopping_checks',
  'storage:upload', 'storage:read', 'storage:sign', 'storage:delete',
  'auth:password-sign-in', 'auth:sign-up', 'auth:refresh', 'auth:update-password', 'auth:local-logout'
].sort();
const statuses = new Set(['covered', 'partial', 'not-covered', 'blocked-unknown-semantics']);
const fixtureCases = new Set(fixture.cases.map(testCase => testCase.id));

assert.equal(audit.basis, 'tracked-repository-evidence-only');
assert.equal(audit.scope, 'test-plan-coverage');
assert.match(audit.disclaimer, /does not prove production or staging behavior/i);
assert.deepEqual(Object.keys(audit.statuses).sort(), [...statuses].sort());
assert(Array.isArray(audit.dependencies), 'Audit dependencies must be an array.');
const ids = audit.dependencies.map(dependency => dependency.id);
assert.equal(new Set(ids).size, ids.length, 'Audit dependency ids must be unique.');
assert.deepEqual([...ids].sort(), requiredDependencyIds, 'A documented dependency disappeared from or was added without updating the audit verifier.');

const evidenceCache = new Map();
for (const dependency of audit.dependencies) {
  assert(statuses.has(dependency.status), `${dependency.id} has an invalid status.`);
  assert(['documented', 'partial', 'unknown'].includes(dependency.semantics), `${dependency.id} has invalid semantics.`);
  assert(Array.isArray(dependency.fixtureExpectationIds), `${dependency.id} lacks fixture expectation ids.`);
  assert(dependency.note, `${dependency.id} needs an audit note.`);
  if (!evidenceCache.has(dependency.evidence)) evidenceCache.set(dependency.evidence, await readFile(dependency.evidence, 'utf8'));
  const evidenceNeedle = dependency.name.replace(/^public\./, '').replace(/^Email\//, '').replace(/^Αλλαγή /, 'Αλλαγή ');
  assert(evidenceCache.get(dependency.evidence).toLowerCase().includes(evidenceNeedle.toLowerCase()), `${dependency.id} is absent from its claimed evidence.`);
  for (const caseId of dependency.fixtureExpectationIds) assert(fixtureCases.has(caseId), `${dependency.id} references missing fixture expectation ${caseId}.`);
  if (dependency.status === 'covered') assert(dependency.fixtureExpectationIds.length > 0, `${dependency.id} is falsely fully covered without an expectation.`);
  if (dependency.semantics === 'unknown') assert.notEqual(dependency.status, 'covered', `${dependency.id} has unknown semantics and cannot be fully covered.`);
  if (['not-covered', 'blocked-unknown-semantics'].includes(dependency.status)) assert.equal(dependency.fixtureExpectationIds.length, 0, `${dependency.id} claims no coverage but links expectations.`);
}
console.log(`Verified repository-only coverage classifications for ${audit.dependencies.length} tracked dependencies.`);
