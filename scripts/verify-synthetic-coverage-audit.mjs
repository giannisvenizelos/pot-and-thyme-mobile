import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const audit = JSON.parse(await readFile('fixtures/staging/synthetic-coverage-audit.json', 'utf8'));
const fixture = JSON.parse(await readFile(audit.fixture, 'utf8'));
const recipeManagementFixture = JSON.parse(await readFile('fixtures/staging/recipe-management-expectations.json', 'utf8'));
const repositoryFixture = JSON.parse(await readFile('fixtures/staging/repository-acceptance-expectations.json', 'utf8'));
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
const fixtureCases = new Set([
  ...fixture.cases.map(testCase => testCase.id),
  ...recipeManagementFixture.expectations.map(expectation => expectation.id),
  ...repositoryFixture.expectations.map(expectation => expectation.id)
]);

const repositoryDependencyIds = new Set([
  'postgrest:recipes', 'postgrest:recipe_ingredients', 'postgrest:recipe_steps',
  'postgrest:recipe_categories', 'postgrest:recipe_subcategories', 'postgrest:meal_plan',
  'postgrest:shopping_checks', 'auth:local-logout'
]);
const fullyCoveredRepositoryDependencyIds = new Set([
  'postgrest:recipe_ingredients', 'postgrest:recipe_steps', 'postgrest:recipe_categories',
  'postgrest:recipe_subcategories', 'auth:local-logout'
]);
assert.equal(repositoryFixture.syntheticOnly, true);
assert.equal(repositoryFixture.environment, 'offline');
assert.equal(repositoryFixture.productionVerified, false);
assert.deepEqual(repositoryFixture.prohibitedClaims.sort(), [
  'anonymous-permission', 'authenticated-permission', 'server-authorization', 'server-token-revocation'
]);

const repositoryExpectations = new Map(repositoryFixture.expectations.map(expectation => [expectation.id, expectation]));
assert.equal(repositoryExpectations.size, repositoryFixture.expectations.length, 'Repository expectation ids must be unique.');
const recipeIds = new Set(repositoryFixture.recipes.map(recipe => recipe.id));
const categories = new Map(repositoryFixture.categories.map(category => [category.id, category]));
const subcategories = new Map(repositoryFixture.subcategories.map(subcategory => [subcategory.id, subcategory]));
const forbiddenClaimFields = new Set(['actorRef', 'expect', 'authorization', 'permission', 'tokenRevoked', 'revokesToken']);
function assertNoServerClaimFields(value, expectationId) {
  if (!value || typeof value !== 'object') return;
  for (const [field, nested] of Object.entries(value)) {
    assert(!forbiddenClaimFields.has(field), `${expectationId} accidentally claims server authorization or revocation via ${field}.`);
    assertNoServerClaimFields(nested, expectationId);
  }
}

for (const expectation of repositoryFixture.expectations) {
  assert(repositoryDependencyIds.has(expectation.dependency), `${expectation.id} covers an out-of-scope dependency.`);
  assertNoServerClaimFields(expectation, expectation.id);
  assert(!/\b(?:allow|deny|denied|authorized|authorization|rls|policy enforced)\b/i.test(JSON.stringify(expectation)), `${expectation.id} accidentally claims server authorization behavior.`);
}
assert.deepEqual(new Set(repositoryFixture.expectations.map(item => item.dependency)), repositoryDependencyIds, 'Repository expectations must cover every scoped dependency exactly by dependency.');

for (const relationship of ['recipe_ingredients', 'recipe_steps']) {
  const expectation = repositoryFixture.expectations.find(item => item.relationship === relationship);
  assert(expectation, `${relationship} lacks embedded relationship coverage.`);
  assert.equal(expectation.behavior, 'embedded-read');
  assert.equal(expectation.orderBy, 'position', `${relationship} must cover position ordering.`);
  assert.equal(expectation.direction, 'asc');
  assert(recipeIds.has(expectation.recipeRef), `${expectation.id} has a broken recipe reference.`);
  const recipe = repositoryFixture.recipes.find(item => item.id === expectation.recipeRef);
  const rows = recipe[relationship];
  assert(rows.length > 1, `${expectation.id} needs enough rows to prove ordering.`);
  assert(rows.every(row => row.recipeRef === recipe.id), `${expectation.id} has a broken embedded recipe relationship.`);
  assert.deepEqual([...rows].sort((a, b) => a.position - b.position).map(row => row.id), expectation.expectedRefs, `${expectation.id} has stale ordering expectations.`);
}

const categoryExpectation = repositoryExpectations.get('repo-taxonomy-categories-display-order');
assert.equal(categoryExpectation.orderBy, 'display_order', 'Category coverage must require display_order.');
assert.deepEqual([...categories.values()].sort((a, b) => a.display_order - b.display_order).map(row => row.id), categoryExpectation.expectedRefs);
const subcategoryExpectation = repositoryExpectations.get('repo-taxonomy-subcategories-reference-and-order');
assert.equal(subcategoryExpectation.parentRefField, 'categoryRef', 'Subcategory coverage must require its category relationship.');
assert.equal(subcategoryExpectation.orderBy, 'display_order', 'Subcategory coverage must require display_order.');
for (const row of subcategories.values()) assert(categories.has(row.categoryRef), `${row.id} has a broken category reference.`);
for (const [categoryRef, expectedRefs] of Object.entries(subcategoryExpectation.expectedRefsByCategory)) {
  assert(categories.has(categoryRef), `${subcategoryExpectation.id} references a missing category.`);
  assert.deepEqual([...subcategories.values()].filter(row => row.categoryRef === categoryRef).sort((a, b) => a.display_order - b.display_order).map(row => row.id), expectedRefs);
}

const clientAppSource = await readFile('shared/app1.js', 'utf8');
const clientHouseholdSource = await readFile('shared/app2.js', 'utf8');
const catalogFallback = repositoryExpectations.get('repo-recipes-catalog-fallback-query');
assert.equal(catalogFallback.resourcePath, '/rest/v1/recipes');
assert.deepEqual(catalogFallback.select, ['id', 'title', 'meal', 'subcategory', 'prep_minutes', 'cook_minutes', 'created_at', 'created_by', 'recipe_origin', 'moderation_status', 'photo_url']);
assert.deepEqual(catalogFallback.filters, {meal: 'eq.<canonical meal>', subcategory: 'eq.<subcategory>', title: 'ilike.*<sanitized search>*'});
assert.deepEqual(catalogFallback.pagination, {limitField: 'limit', cursorField: 'id', cursorOperator: 'gt'});
assert.deepEqual(catalogFallback.order, {field: 'created_at', direction: 'desc'});
for (const fragment of [
  "select:'id,title,meal,subcategory,prep_minutes,cook_minutes,created_at,created_by,recipe_origin,moderation_status,photo_url'",
  "order:'created_at.desc'", "q.set('meal','eq.'+canonicalMeal(S.tab))", "q.set('subcategory','eq.'+S.cat)",
  "q.set('title','ilike.*'+S.search.trim().replace(/[,*()]/g,' ')+'*')", "q.set('id','gt.'+S.cursor)"
]) assert(clientAppSource.includes(fragment), `Catalog fallback query shape is stale: ${fragment}`);

const detailFallback = repositoryExpectations.get('repo-recipes-detail-fallback-query');
assert.deepEqual(detailFallback.select, ['*', 'recipe_ingredients(*)', 'recipe_steps(*)']);
assert.deepEqual(detailFallback.filters, {id: 'eq.<recipe id>'});
assert.equal(detailFallback.limit, 1);
for (const relationship of ['recipe_ingredients', 'recipe_steps']) {
  assert.deepEqual(detailFallback.embeddedClientOrder[relationship], {field: 'position', direction: 'asc'});
  assert(clientAppSource.includes(`${relationship}?.sort((a,b)=>a.position-b.position)`), `Embedded ${relationship} ordering is stale.`);
}
assert(clientAppSource.includes("api('/rest/v1/recipes?select=*,recipe_ingredients(*),recipe_steps(*)&id=eq.'+id+'&limit=1')"), 'Recipe detail fallback query shape is stale.');

const householdIds = new Set(repositoryFixture.households.map(household => household.id));
for (const expectation of repositoryFixture.expectations.filter(item => item.householdRef)) {
  assert(householdIds.has(expectation.householdRef), `${expectation.id} has a broken household reference.`);
}
for (const [id, responseField] of [['repo-meal-plan-bootstrap-read', 'plan'], ['repo-shopping-checks-bootstrap-read', 'shopping']]) {
  const expectation = repositoryExpectations.get(id);
  assert.equal(expectation.responseField, responseField);
  assert(clientHouseholdSource.includes(`S.${responseField}=b.${responseField}||[]`), `${id} has a stale bootstrap response field.`);
}
for (const [id, bodyField, sourceFragment] of [
  ['repo-meal-plan-date-update', 'plan_date', "api('/rest/v1/meal_plan?id=eq.'+encodeURIComponent(id),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({plan_date:newDate})})"],
  ['repo-meal-plan-servings-update', 'servings', "api('/rest/v1/meal_plan?id=eq.'+id,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({servings:Math.max(.5,n)})})"]
]) {
  const expectation = repositoryExpectations.get(id);
  assert.equal(expectation.method, 'PATCH');
  assert.deepEqual(expectation.filters, {id: 'eq.<meal plan id>'});
  assert.deepEqual(expectation.bodyFields, [bodyField]);
  assert.equal(expectation.prefer, 'return=minimal');
  assert(clientHouseholdSource.includes(sourceFragment), `${id} request shape is stale.`);
}
const shoppingUpsert = repositoryExpectations.get('repo-shopping-checks-upsert');
assert.equal(shoppingUpsert.method, 'POST');
assert.deepEqual(shoppingUpsert.onConflict, ['household_id', 'item_key']);
assert.deepEqual(shoppingUpsert.bodyFields, ['household_id', 'item_key', 'checked', 'updated_by']);
assert.equal(shoppingUpsert.prefer, 'resolution=merge-duplicates,return=minimal');
assert(clientHouseholdSource.includes("api('/rest/v1/shopping_checks?on_conflict=household_id,item_key',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({household_id:S.house.id,item_key:k,checked:v,updated_by:S.session.user.id})})"), 'Shopping check upsert query shape is stale.');

const logout = repositoryExpectations.get('repo-auth-local-logout-effects');
assert.equal(logout.removesSessionFromMemory, true);
assert.deepEqual(logout.removedStorageKeys, ['pot_session_v4', 'pot_session_v3']);
assert.equal(logout.closesRealtimeConnection, true);
assert.equal(logout.clearsRealtimeHandle, true);
assert.equal(logout.clearsRealtimeHeartbeat, true);
assert.equal(logout.serverTokenRevocation, 'not-claimed');
const clientSessionSource = clientAppSource;
const clientRealtimeSource = clientHouseholdSource;
const clientLogoutSource = await readFile('apps/mobile/mobile.js', 'utf8');
for (const key of logout.removedStorageKeys) assert(clientSessionSource.includes(`localStorage.removeItem('${key}')`), `Logout key ${key} is not supported by tracked client code.`);
assert(clientSessionSource.includes('S.session=x'), 'Tracked client no longer clears its in-memory session through saveSession.');
assert(clientLogoutSource.includes('disconnectRealtime(); saveSession(null)'), 'Tracked logout no longer performs Realtime shutdown before local session cleanup.');
assert(clientRealtimeSource.includes('S.rt.close()') && clientRealtimeSource.includes('S.rt=null'), 'Tracked Realtime shutdown no longer closes and clears the connection.');
assert(clientRealtimeSource.includes('clearInterval(S.rtHeartbeat)') && clientRealtimeSource.includes('S.rtHeartbeat=null'), 'Tracked Realtime shutdown no longer clears its heartbeat.');

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
  if (dependency.evidence === 'scripts/recipe-management.sql') {
    assert.equal(dependency.coverageProvenance, 'historical-source-derived-expectation', `${dependency.id} lacks historical provenance.`);
    assert.equal(dependency.productionVerified, false, `${dependency.id} must not claim production verification.`);
    for (const caseId of dependency.fixtureExpectationIds) {
      assert(recipeManagementFixture.expectations.some(item => item.id === caseId && item.rpc === dependency.name), `${dependency.id} links an expectation from the wrong RPC.`);
    }
  }
  if (repositoryDependencyIds.has(dependency.id)) {
    assert.equal(dependency.status, fullyCoveredRepositoryDependencyIds.has(dependency.id) ? 'covered' : 'partial', `${dependency.id} has unsupported repository-only coverage status.`);
    assert.equal(dependency.coverageProvenance, 'tracked-client-derived-expectation', `${dependency.id} lacks client-derived provenance.`);
    assert.equal(dependency.productionVerified, false, `${dependency.id} must not claim production verification.`);
    const linkedRepositoryExpectations = dependency.fixtureExpectationIds.filter(caseId => repositoryExpectations.has(caseId));
    assert(linkedRepositoryExpectations.length > 0, `${dependency.id} must link its repository-only expectation.`);
    for (const caseId of linkedRepositoryExpectations) assert.equal(repositoryExpectations.get(caseId).dependency, dependency.id, `${dependency.id} links an expectation for a different dependency.`);
  }
  if (dependency.semantics === 'unknown') assert.notEqual(dependency.status, 'covered', `${dependency.id} has unknown semantics and cannot be fully covered.`);
  if (['not-covered', 'blocked-unknown-semantics'].includes(dependency.status)) assert.equal(dependency.fixtureExpectationIds.length, 0, `${dependency.id} claims no coverage but links expectations.`);
}
console.log(`Verified repository-only coverage classifications for ${audit.dependencies.length} tracked dependencies.`);
