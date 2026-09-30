import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fixturePath = 'fixtures/staging/synthetic-fixtures.json';
const source = await readFile(fixturePath, 'utf8');
const fixture = JSON.parse(source);
const catalogContract = JSON.parse(await readFile('contracts/catalog-response.schema.json', 'utf8'));
const recipeContract = JSON.parse(await readFile('contracts/recipe-response.schema.json', 'utf8'));

const requiredCategories = [
  'household-isolation',
  'rpc-only-write',
  'security-definer-rpc',
  'realtime-isolation',
  'storage-isolation'
];
const resourceCollections = {
  household: 'households',
  user: 'users',
  recipe: 'recipes',
  ingredient: 'ingredients',
  mealPlan: 'mealPlans',
  shoppingItem: 'shoppingItems',
  storageObject: 'storageObjects'
};
const entityCollections = [...Object.values(resourceCollections), 'rpcPaths'];
const entities = entityCollections.flatMap(name => {
  assert(Array.isArray(fixture[name]), `Missing fixture collection: ${name}.`);
  return fixture[name];
});
const ids = entities.map(entity => entity.id);

assert.equal(fixture.syntheticOnly, true, 'Fixture must be explicitly synthetic-only.');
assert.equal(fixture.fixtureSet, 'synthetic-staging-v2');
assert.equal(fixture.households.length, 2, 'Exactly two isolated fixture households are required.');
assert.deepEqual(fixture.coverage.requiredCategories, requiredCategories, 'Required coverage categories must not drift.');
assert(catalogContract.items.properties.id.type.includes('string'), 'Catalog contract must permit logical string recipe ids.');
assert(recipeContract.items.properties.id.type.includes('string'), 'Recipe contract must permit logical string recipe ids.');

assert.equal(new Set(ids).size, ids.length, 'Every deterministic fixture identifier must be unique.');
for (const id of ids) assert.match(id, /^syn-[a-z0-9-]+$/, `Non-synthetic identifier: ${id}`);

const assertUnique = (values, label) =>
  assert.equal(new Set(values).size, values.length, `Duplicate ${label} values are forbidden.`);
assertUnique(fixture.users.map(user => user.email.toLowerCase()), 'email');
assertUnique(fixture.storageObjects.map(object => object.path), 'Storage path');
assertUnique(fixture.rpcPaths.map(path => path.name), 'RPC name');

const byId = new Map(entities.map(entity => [entity.id, entity]));
const resourceTypeById = new Map();
for (const [resourceType, collection] of Object.entries(resourceCollections)) {
  for (const entity of fixture[collection]) resourceTypeById.set(entity.id, resourceType);
}
const households = new Set(fixture.households.map(item => item.id));
const users = new Map(fixture.users.map(item => [item.id, item]));
const recipes = new Map(fixture.recipes.map(item => [item.id, item]));
const rpcPaths = new Map(fixture.rpcPaths.map(item => [item.id, item]));

for (const user of fixture.users) {
  assert.match(user.email, /^[a-z0-9.]+@example\.invalid$/, `${user.id} must use a reserved fictional email.`);
  assert(households.has(user.householdRef), `${user.id} references an unknown household.`);
}
for (const recipe of fixture.recipes) {
  assert(users.has(recipe.ownerRef), `${recipe.id} references an unknown owner.`);
  assert(households.has(recipe.householdRef), `${recipe.id} references an unknown household.`);
  assert.equal(users.get(recipe.ownerRef).householdRef, recipe.householdRef, `${recipe.id} owner must belong to its household.`);
  assert(['public', 'household'].includes(recipe.visibility), `${recipe.id} has an invalid visibility.`);
}
for (const ingredient of fixture.ingredients) assert(recipes.has(ingredient.recipeRef), `${ingredient.id} references an unknown recipe.`);
for (const recipe of fixture.recipes) {
  const positions = fixture.ingredients.filter(item => item.recipeRef === recipe.id).map(item => item.position);
  assert(positions.length > 0, `${recipe.id} must have at least one ingredient.`);
  assertUnique(positions, `${recipe.id} ingredient position`);
}
for (const plan of fixture.mealPlans) {
  assert(households.has(plan.householdRef), `${plan.id} references an unknown household.`);
  assert(recipes.has(plan.recipeRef), `${plan.id} references an unknown recipe.`);
  assert.equal(recipes.get(plan.recipeRef).householdRef, plan.householdRef, `${plan.id} crosses fixture households.`);
}
for (const item of fixture.shoppingItems) assert(households.has(item.householdRef), `${item.id} references an unknown household.`);
for (const object of fixture.storageObjects) {
  assert.match(object.path, /^synthetic\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9.-]+$/, `${object.id} has a non-synthetic Storage path.`);
  assert(users.has(object.ownerRef), `${object.id} references an unknown owner.`);
  assert(households.has(object.householdRef), `${object.id} references an unknown household.`);
  assert.equal(users.get(object.ownerRef).householdRef, object.householdRef, `${object.id} owner must belong to its household.`);
}
for (const rpc of fixture.rpcPaths) {
  assert.equal(rpc.securityMode, 'definer', `${rpc.id} must describe a SECURITY DEFINER path.`);
  assert(fixture.coverage.householdScopedResourceTypes.includes(rpc.resourceType), `${rpc.id} has an unknown scoped resource type.`);
}

assert(Array.isArray(fixture.cases) && fixture.cases.length > 0, 'Acceptance cases are required.');
assertUnique(fixture.cases.map(testCase => testCase.id), 'case id');
assertUnique([...ids, ...fixture.cases.map(testCase => testCase.id)], 'identifier');
const caseSignatures = new Map();
for (const testCase of fixture.cases) {
  assert.match(testCase.id, /^syn-case-[a-z0-9-]+$/, `Non-synthetic case identifier: ${testCase.id}`);
  assert(requiredCategories.includes(testCase.category) || testCase.category === 'recipe-visibility', `${testCase.id} has an unknown category.`);
  assert(['table', 'rpc', 'realtime', 'storage'].includes(testCase.surface), `${testCase.id} has an unknown surface.`);
  assert(testCase.actorRef === 'anonymous' || users.has(testCase.actorRef), `${testCase.id} has an unknown actor.`);
  assert(byId.has(testCase.resourceRef), `${testCase.id} has an unknown resource.`);
  assert.equal(resourceTypeById.get(testCase.resourceRef), testCase.resourceType, `${testCase.id} resource type does not match its reference.`);
  assert(['allow', 'deny'].includes(testCase.expect), `${testCase.id} has an invalid expectation.`);
  if (testCase.surface === 'rpc') {
    assert(rpcPaths.has(testCase.pathRef), `${testCase.id} has an unknown RPC path.`);
    assert.equal(rpcPaths.get(testCase.pathRef).resourceType, testCase.resourceType, `${testCase.id} uses an RPC for another resource type.`);
  } else {
    assert.equal(testCase.pathRef, undefined, `${testCase.id} has an unexpected RPC path.`);
  }

  const signature = [testCase.surface, testCase.pathRef ?? '', testCase.actorRef, testCase.action, testCase.resourceType, testCase.resourceRef].join('|');
  const previous = caseSignatures.get(signature);
  assert(!previous, `${testCase.id} duplicates or contradicts ${previous?.id}.`);
  caseSignatures.set(signature, testCase);
}

const casesFor = criteria => fixture.cases.filter(testCase =>
  Object.entries(criteria).every(([key, value]) => testCase[key] === value));
const requireCase = (criteria, message) => assert(casesFor(criteria).length > 0, message);

for (const category of requiredCategories) {
  requireCase({ category }, `Missing required coverage category: ${category}.`);
}

const crudActions = ['read', 'insert', 'update', 'delete'];
for (const resourceType of fixture.coverage.householdScopedResourceTypes) {
  assert(resourceCollections[resourceType], `Unknown household-scoped resource type: ${resourceType}.`);
  for (const action of crudActions) {
    const matches = casesFor({ category: 'household-isolation', resourceType, action, expect: 'deny' });
    assert(matches.length > 0, `Missing cross-household ${action} denial for ${resourceType}.`);
    for (const testCase of matches) {
      const actor = users.get(testCase.actorRef);
      const resource = byId.get(testCase.resourceRef);
      assert(actor, `${testCase.id} cross-household actor must be authenticated.`);
      assert.notEqual(actor.householdRef, resource.householdRef, `${testCase.id} is not actually cross-household.`);
    }
  }
}

for (const [resourceType, actions] of Object.entries(fixture.coverage.rpcOnlyWrites)) {
  assert(fixture.coverage.householdScopedResourceTypes.includes(resourceType), `RPC-only resource ${resourceType} is not household-scoped.`);
  assert.deepEqual([...actions].sort(), ['delete', 'insert', 'update'], `${resourceType} must declare every write action as RPC-only.`);
  for (const action of actions) {
    requireCase(
      { category: 'rpc-only-write', surface: 'table', resourceType, action, expect: 'deny' },
      `Missing direct-table ${action} denial for ${resourceType}.`
    );
  }
}

for (const rpc of fixture.rpcPaths) {
  const cases = casesFor({ category: 'security-definer-rpc', surface: 'rpc', pathRef: rpc.id });
  assert(cases.some(testCase => testCase.expect === 'allow'), `${rpc.id} lacks an authorized actor case.`);
  assert(cases.some(testCase => testCase.expect === 'deny'), `${rpc.id} lacks an unauthorized actor case.`);
  for (const testCase of cases) {
    const actor = users.get(testCase.actorRef);
    const sameHousehold = actor && actor.householdRef === byId.get(testCase.resourceRef).householdRef;
    assert.equal(testCase.expect, sameHousehold ? 'allow' : 'deny', `${testCase.id} contradicts RPC household authorization.`);
  }
}

const realtimeCases = casesFor({ category: 'realtime-isolation', surface: 'realtime', action: 'receive' });
assert(realtimeCases.some(testCase => testCase.expect === 'allow'), 'Realtime needs a same-household delivery expectation.');
assert(realtimeCases.some(testCase => testCase.expect === 'deny'), 'Realtime needs a cross-household non-delivery expectation.');
for (const testCase of realtimeCases) {
  const actor = users.get(testCase.actorRef);
  const sameHousehold = actor && actor.householdRef === byId.get(testCase.resourceRef).householdRef;
  assert.equal(testCase.expect, sameHousehold ? 'allow' : 'deny', `${testCase.id} contradicts Realtime household isolation.`);
}
for (const subscriberHousehold of households) {
  for (const eventHousehold of households) {
    if (subscriberHousehold === eventHousehold) continue;
    assert(realtimeCases.some(testCase =>
      testCase.expect === 'deny' &&
      users.get(testCase.actorRef)?.householdRef === subscriberHousehold &&
      byId.get(testCase.resourceRef).householdRef === eventHousehold
    ), `Realtime lacks non-delivery from ${eventHousehold} to ${subscriberHousehold}.`);
  }
}

const storageActions = ['upload', 'read', 'sign', 'delete'];
for (const action of storageActions) {
  const actionCases = casesFor({ category: 'storage-isolation', surface: 'storage', action });
  assert(actionCases.some(testCase => testCase.expect === 'allow' && users.get(testCase.actorRef)?.id === byId.get(testCase.resourceRef).ownerRef), `Storage ${action} lacks a same-owner allow case.`);
  assert(actionCases.some(testCase => {
    const actor = users.get(testCase.actorRef);
    const object = byId.get(testCase.resourceRef);
    return testCase.expect === 'deny' && actor?.householdRef === object.householdRef && actor.id !== object.ownerRef;
  }), `Storage ${action} lacks an other-user denial case.`);
  assert(actionCases.some(testCase => {
    const actor = users.get(testCase.actorRef);
    return testCase.expect === 'deny' && actor?.householdRef !== byId.get(testCase.resourceRef).householdRef;
  }), `Storage ${action} lacks an other-household denial case.`);
  for (const testCase of actionCases) {
    const isOwner = users.get(testCase.actorRef)?.id === byId.get(testCase.resourceRef).ownerRef;
    assert.equal(testCase.expect, isOwner ? 'allow' : 'deny', `${testCase.id} contradicts Storage ownership isolation.`);
  }
}

for (const testCase of casesFor({ category: 'recipe-visibility' })) {
  const recipe = recipes.get(testCase.resourceRef);
  const actor = users.get(testCase.actorRef);
  const expected = recipe.visibility === 'public' || actor?.householdRef === recipe.householdRef ? 'allow' : 'deny';
  assert.equal(testCase.expect, expected, `${testCase.id} contradicts recipe visibility.`);
}

const forbiddenProductionMarkers = [
  'ccvdkbdnykfhenhqkicm',
  'pot-and-thyme-test.vercel.app',
  'pot-and-thyme-test-mobile.vercel.app',
  'pot-and-thyme-mobile.vercel.app',
  'supabase.co'
];
for (const marker of forbiddenProductionMarkers) {
  assert(!source.toLowerCase().includes(marker), `Fixture contains a production project reference: ${marker}`);
}
assert(!/(?:password|secret|access[_-]?token|service[_-]?role|api[_-]?key)/i.test(source), 'Fixture must not contain credentials or credential-shaped keys.');

console.log(`Verified ${fixture.cases.length} synthetic acceptance expectations entirely offline.`);
