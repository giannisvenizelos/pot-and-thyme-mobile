import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const fixturePath = 'fixtures/staging/recipe-management-expectations.json';
const source = await readFile(fixturePath, 'utf8');
const fixture = JSON.parse(source);
const historicalSql = await readFile('scripts/recipe-management.sql', 'utf8');
const requiredRpcs = ['recipe_management_access', 'can_manage_recipe', 'save_recipe', 'set_recipe_photo', 'delete_recipe', 'restore_recipe'];

assert.equal(fixture.syntheticOnly, true);
assert.equal(fixture.evidence.path, 'scripts/recipe-management.sql');
assert.equal(fixture.evidence.classification, 'historical-repository-evidence');
assert.equal(fixture.evidence.productionVerified, false);
assert.match(fixture.evidence.disclaimer, /do not assert current production or staging behavior/i);

const actors = new Map(fixture.actors.map(actor => [actor.id, actor]));
const resources = new Map(fixture.resources.map(resource => [resource.id, resource]));
assert.equal(actors.size, fixture.actors.length, 'Actor ids must be unique.');
assert.equal(resources.size, fixture.resources.length, 'Resource ids must be unique.');
for (const id of [...actors.keys(), ...resources.keys()]) assert.match(id, /^(?:syn-rm-[a-z0-9-]+|anonymous)$/);
for (const resource of fixture.resources) {
  if (resource.creatorRef) assert(actors.has(resource.creatorRef), `${resource.id} has a broken creatorRef.`);
  if (resource.ownerRef) assert(actors.has(resource.ownerRef), `${resource.id} has a broken ownerRef.`);
  if (resource.recipeRef) assert(resources.get(resource.recipeRef)?.type === 'recipe', `${resource.id} has a broken recipeRef.`);
}

assert(Array.isArray(fixture.expectations) && fixture.expectations.length > 0);
const ids = new Set();
const signatures = new Map();
for (const expectation of fixture.expectations) {
  assert(!ids.has(expectation.id), `Duplicate expectation id: ${expectation.id}.`);
  ids.add(expectation.id);
  assert.match(expectation.id, /^syn-rm-[a-z0-9-]+$/);
  assert(requiredRpcs.includes(expectation.rpc), `${expectation.id} names an unapproved RPC.`);
  assert.match(historicalSql, new RegExp(`function\\s+public\\.${expectation.rpc}\\s*\\(`, 'i'), `${expectation.rpc} is missing from historical evidence.`);
  assert(actors.has(expectation.actorRef), `${expectation.id} has a broken actorRef.`);
  if (expectation.resourceRef !== null) assert(resources.has(expectation.resourceRef), `${expectation.id} has a broken resourceRef.`);
  if (expectation.objectRef !== undefined && expectation.objectRef !== null) {
    assert.equal(resources.get(expectation.objectRef)?.type, 'storage-object', `${expectation.id} has a broken objectRef.`);
  }
  const signature = [expectation.rpc, expectation.actorRef, expectation.resourceRef, expectation.objectRef, expectation.operation].join('|');
  assert(!signatures.has(signature), `${expectation.id} duplicates or contradicts ${signatures.get(signature)}.`);
  signatures.set(signature, expectation.id);
}

for (const rpc of requiredRpcs) {
  const cases = fixture.expectations.filter(item => item.rpc === rpc);
  assert(cases.length > 0, `${rpc} lacks expectations.`);
  assert(cases.some(item => ['allow', 'return-true'].includes(item.expect)), `${rpc} lacks a positive expectation.`);
  assert(cases.some(item => ['authorization-error', 'execute-denied', 'return-false', 'path-validation-error'].includes(item.expect)), `${rpc} lacks a negative expectation.`);
  assert(cases.some(item => item.actorRef === 'anonymous' && item.expect === 'execute-denied'), `${rpc} lacks its historical anonymous execute denial.`);
}

assert(!/(?:password|secret|access[_-]?token|service[_-]?role|api[_-]?key)/i.test(source), 'Expectations must not contain credentials.');
assert(!/productionVerified\s*"?\s*:\s*true/i.test(source), 'Expectations must never claim production verification.');
console.log(`Verified ${fixture.expectations.length} historical-source-derived recipe-management expectations entirely offline.`);
