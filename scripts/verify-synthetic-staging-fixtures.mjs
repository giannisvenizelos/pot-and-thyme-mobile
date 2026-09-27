import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const path = 'fixtures/staging/synthetic-fixtures.json';
const source = await readFile(path, 'utf8');
const fixture = JSON.parse(source);
const catalogContract = JSON.parse(await readFile('contracts/catalog-response.schema.json', 'utf8'));
const recipeContract = JSON.parse(await readFile('contracts/recipe-response.schema.json', 'utf8'));

assert.equal(fixture.syntheticOnly, true);
assert.equal(fixture.fixtureSet, 'synthetic-staging-v1');
assert.equal(fixture.households.length, 2, 'Exactly two isolated fixture households are required.');
assert(catalogContract.items.properties.id.type.includes('string'), 'Catalog contract must permit logical string recipe ids.');
assert(recipeContract.items.properties.id.type.includes('string'), 'Recipe contract must permit logical string recipe ids.');

const collections = ['households', 'users', 'recipes', 'ingredients', 'mealPlans', 'shoppingItems', 'cases'];
const entities = collections.flatMap(name => fixture[name]);
const ids = entities.map(entity => entity.id);
assert.equal(new Set(ids).size, ids.length, 'Every deterministic fixture identifier must be unique.');
for (const id of ids) assert.match(id, /^syn-[a-z0-9-]+$/, `Non-synthetic identifier: ${id}`);

const byId = new Map(entities.map(entity => [entity.id, entity]));
const households = new Set(fixture.households.map(item => item.id));
const users = new Map(fixture.users.map(item => [item.id, item]));
const recipes = new Map(fixture.recipes.map(item => [item.id, item]));

for (const user of fixture.users) {
  assert.match(user.email, /^[a-z0-9.]+@example\.invalid$/);
  assert(households.has(user.householdRef), `${user.id} references an unknown household.`);
}
for (const recipe of fixture.recipes) {
  assert(users.has(recipe.ownerRef), `${recipe.id} references an unknown owner.`);
  assert(households.has(recipe.householdRef), `${recipe.id} references an unknown household.`);
  assert.equal(users.get(recipe.ownerRef).householdRef, recipe.householdRef, `${recipe.id} owner must belong to its household.`);
  assert(['public', 'household'].includes(recipe.visibility));
}
for (const ingredient of fixture.ingredients) assert(recipes.has(ingredient.recipeRef), `${ingredient.id} references an unknown recipe.`);
for (const recipe of fixture.recipes) {
  const positions = fixture.ingredients.filter(item => item.recipeRef === recipe.id).map(item => item.position);
  assert(positions.length > 0, `${recipe.id} must have at least one ingredient.`);
  assert.equal(new Set(positions).size, positions.length, `${recipe.id} has duplicate ingredient positions.`);
}
for (const plan of fixture.mealPlans) {
  assert(households.has(plan.householdRef), `${plan.id} references an unknown household.`);
  assert(recipes.has(plan.recipeRef), `${plan.id} references an unknown recipe.`);
  assert.equal(recipes.get(plan.recipeRef).householdRef, plan.householdRef, `${plan.id} crosses fixture households.`);
}
for (const item of fixture.shoppingItems) assert(households.has(item.householdRef), `${item.id} references an unknown household.`);

for (const testCase of fixture.cases) {
  assert(testCase.actorRef === 'anonymous' || users.has(testCase.actorRef), `${testCase.id} has an unknown actor.`);
  assert(byId.has(testCase.resourceRef), `${testCase.id} has an unknown resource.`);
  assert(['allow', 'deny'].includes(testCase.expect));
}
for (const testCase of fixture.cases.filter(item => item.reason === 'cross-household isolation')) {
  const actorHousehold = users.get(testCase.actorRef).householdRef;
  const resourceHousehold = byId.get(testCase.resourceRef).householdRef;
  assert.notEqual(actorHousehold, resourceHousehold, `${testCase.id} is not actually cross-household.`);
  assert.equal(testCase.expect, 'deny');
}
for (const testCase of fixture.cases.filter(item => item.resourceType === 'recipe')) {
  const visibility = recipes.get(testCase.resourceRef).visibility;
  assert.equal(testCase.expect, visibility === 'public' ? 'allow' : 'deny', `${testCase.id} contradicts recipe visibility.`);
}
assert(fixture.cases.some(item => item.expect === 'allow' && item.reason === 'public recipe visibility'));
assert(fixture.cases.some(item => item.expect === 'deny' && item.reason === 'household-only recipe visibility'));
assert(fixture.cases.some(item => item.expect === 'deny' && item.reason === 'cross-household isolation'));

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

console.log('Synthetic staging fixtures are offline-safe and internally consistent.');
