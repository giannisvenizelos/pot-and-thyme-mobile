import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const app = await readFile('shared/app1.js', 'utf8');
const ai = await readFile('shared/ai.js', 'utf8');

const catalogSchema = await readJson('contracts/catalog-response.schema.json');
const recipeSchema = await readJson('contracts/recipe-response.schema.json');
const aiSchema = await readJson('contracts/ai-fridge.schema.json');

assert.equal(catalogSchema.type, 'array');
assert.deepEqual(
  catalogSchema.items.required,
  ['id', 'title', 'meal', 'subcategory', 'prep_minutes', 'cook_minutes', 'created_at', 'created_by', 'recipe_origin', 'moderation_status', 'photo_url']
);
assert.equal(recipeSchema.type, 'array');
assert.deepEqual(recipeSchema.items.required, ['id', 'title', 'recipe_ingredients', 'recipe_steps']);
assert.deepEqual(aiSchema.$defs.request.required, ['text']);
assert.deepEqual(aiSchema.$defs.response.required, ['matches', 'ingredients', 'mode', 'usage', 'notice']);
assert.deepEqual(aiSchema.$defs.observedError.required, ['message']);

// These assertions keep the documented contracts tied to the recovered clients. A client
// change must update both the prose and machine-readable observation rather than silently
// widening a claimed server contract.
assert.match(app, /new URLSearchParams\(\{meal:canonicalMeal\(S\.tab\),limit:String\(PAGE_SIZE\)\}\)/);
assert.match(app, /fetch\('\/api\/catalog\?'\+p\.toString\(\)\)/);
assert.match(app, /fetch\('\/api\/recipe\?id='\+id\)/);
assert.match(app, /let x=d\?\.\[0\]/);
assert.match(app, /recipe_ingredients\?\.sort\(\(a,b\)=>a\.position-b\.position\)/);
assert.match(app, /recipe_steps\?\.sort\(\(a,b\)=>a\.position-b\.position\)/);
assert.match(ai, /fetch\('\/api\/ai-fridge',\{method:'POST'/);
assert.match(ai, /Authorization:'Bearer '\+S\.session\.access_token/);
assert.match(ai, /body:JSON\.stringify\(\{text\}\)/);
assert.match(ai, /if\(!r\.ok\)throw Error\(d\?\.message\|\|/);

console.log('API contract observations match the recovered Mobile client.');
