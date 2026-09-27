import assert from 'node:assert/strict';

const baseValue = process.env.STAGING_API_BASE_URL;
if (!baseValue) {
  console.log('SKIP staging API integration: STAGING_API_BASE_URL is not configured.');
  process.exit(0);
}

assert.equal(
  process.env.STAGING_CONFIRM_SYNTHETIC_DATA,
  'true',
  'Refusing to run without STAGING_CONFIRM_SYNTHETIC_DATA=true.'
);

const base = new URL(baseValue);
assert.equal(base.protocol, 'https:', 'Staging API must use HTTPS.');
const forbiddenHosts = new Set([
  'pot-and-thyme-test.vercel.app',
  'pot-and-thyme-test-mobile.vercel.app',
  'pot-and-thyme-mobile.vercel.app',
  'ccvdkbdnykfhenhqkicm.supabase.co'
]);
assert(!forbiddenHosts.has(base.hostname), `Refusing known production/current host ${base.hostname}.`);
assert(!base.username && !base.password, 'Credentials must not be embedded in the staging URL.');

const recipeId = process.env.STAGING_SYNTHETIC_RECIPE_ID;
const token = process.env.STAGING_SYNTHETIC_ACCESS_TOKEN;
assert.match(recipeId || '', /^\d+$/, 'A numeric synthetic staging recipe id is required.');
assert(token, 'A short-lived access token for a fictional staging user is required.');

async function json(path, options) {
  const response = await fetch(new URL(path, base), {
    ...options,
    signal: AbortSignal.timeout(10_000)
  });
  const body = await response.json();
  assert(response.ok, `${path} returned HTTP ${response.status}: ${body?.message || 'unknown error'}`);
  return body;
}

const catalog = await json('/api/catalog?meal=&limit=10');
assert(Array.isArray(catalog), 'Catalog response must be an array.');

const recipe = await json(`/api/recipe?id=${encodeURIComponent(recipeId)}`);
assert(Array.isArray(recipe) && recipe.length > 0, 'Recipe response must be a non-empty array.');
assert(Array.isArray(recipe[0].recipe_ingredients), 'Recipe must embed recipe_ingredients.');
assert(Array.isArray(recipe[0].recipe_steps), 'Recipe must embed recipe_steps.');

const fridge = await json('/api/ai-fridge', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`
  },
  body: JSON.stringify({ text: 'synthetic tomato, synthetic rice' })
});
assert(Array.isArray(fridge.matches), 'AI fridge matches must be an array.');
assert(Array.isArray(fridge.ingredients), 'AI fridge ingredients must be an array.');
assert(['ai', 'local'].includes(fridge.mode), 'AI fridge mode must be ai or local.');

console.log('Staging API integration contracts passed with synthetic fixtures.');
