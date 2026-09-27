import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const recovery = readFileSync('docs/SUPABASE_SCHEMA_RECOVERY.md', 'utf8');
const exporter = readFileSync('scripts/export-supabase-schema.sh', 'utf8');
const catalog = readFileSync('scripts/sql/catalog-metadata.sql', 'utf8');
const security = readFileSync('scripts/sql/security-metadata.sql', 'utf8');

assert.match(recovery, /blocked at preparation/);
assert.match(recovery, /Do not copy the historical recipe script/);
assert.match(exporter, /default_transaction_read_only=on/);
assert.match(exporter, /--schema-only/);
assert.doesNotMatch(exporter, /\b(db push|migration up|INSERT|UPDATE|DELETE)\b/i);
assert.match(catalog, /pg_get_functiondef/);
assert.match(catalog, /pg_get_constraintdef/);
assert.match(security, /pg_policies/);
assert.match(security, /pg_publication_rel/);
assert.match(security, /storage\.buckets/);
assert.ok(existsSync('supabase/migrations/README.md'));

console.log('Schema recovery preparation is internally consistent and read-only guarded.');
