#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const candidate = process.argv[2];
if (!candidate || process.argv.length !== 3) throw new Error('Usage: node scripts/validate-local-baseline.mjs <candidate.sql>');
const root = resolve(new URL('..', import.meta.url).pathname);
const source = resolve(candidate);
assert.equal((await stat(source)).isFile(), true, 'Candidate must be a regular SQL file.');
for (const key of ['SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','SUPABASE_PROJECT_ID','POSTGRES_URL','DATABASE_URL']) {
  assert(!process.env[key], `${key} is set; refusing validation while remote-capable credentials/targets are present.`);
}
for (const marker of ['supabase/.temp/project-ref','supabase/.branches/_current_branch']) {
  try { await stat(join(root, marker)); throw new Error(`Linked-project state detected at ${marker}; refusing to run.`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

function run(command, args, options={}) {
  const stdin=options.input === undefined ? 'ignore' : 'pipe';
  const result = spawnSync(command, args, { encoding:'utf8', stdio:[stdin,'pipe','pipe'], ...options });
  if (result.error) throw new Error(`Unable to execute required local tool ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed:\n${result.stdout ?? ''}${result.stderr ?? ''}`);
  return result.stdout;
}
function localUrl(status) {
  const match = status.match(/^DB_URL="?([^"\n]+)"?$/m) || status.match(/^POSTGRES_URL="?([^"\n]+)"?$/m);
  assert(match, 'Local Supabase status did not provide a database URL.');
  const url = new URL(match[1]);
  assert(['127.0.0.1','localhost','::1'].includes(url.hostname), `Refusing non-local database host: ${url.hostname}`);
  return url.href;
}

const sql = await readFile(join(root,'scripts/sql/local-schema-fingerprint.sql'),'utf8');
const syntheticFixture=join(root,'test/fixtures/synthetic-baseline.sql');
const fingerprints=[];
for (let pass=1; pass<=2; pass++) {
  const dir=await mkdtemp(join(tmpdir(),`baseline-local-pass-${pass}-`));
  try {
    await mkdir(join(dir,'supabase/migrations'),{recursive:true});
    await cp(join(root,'supabase/config.toml'),join(dir,'supabase/config.toml'));
    await cp(source,join(dir,'supabase/migrations',`20261001000000_${basename(source)}`));
    run('supabase',['start','--workdir',dir],{cwd:dir});
    run('supabase',['db','reset','--local','--workdir',dir],{cwd:dir});
    const url=localUrl(run('supabase',['status','-o','env','--workdir',dir],{cwd:dir}));
    const output=run('psql',[url,'-X','-qAt','-v','ON_ERROR_STOP=1'],{cwd:dir,input:sql});
    const rows=output.split('\n').filter(line => line.trim());
    assert(rows.length > 0,'Fingerprint query returned no catalog rows; refusing to hash empty output.');
    if (source === syntheticFixture) {
      const objects=rows.map(row => JSON.parse(row));
      assert(objects.some(object => object.kind === 'schema' && object.schema === 'app_test'),
        'Synthetic fingerprint is missing schema app_test.');
      assert(objects.some(object => object.kind === 'relation' && object.schema === 'app_test' && object.name === 'notes'),
        'Synthetic fingerprint is missing relation app_test.notes.');
    }
    const canonical=rows.sort().join('\n')+'\n';
    const hash=createHash('sha256').update(canonical).digest('hex');
    fingerprints.push(hash);
    await writeFile(join(root,`.local-baseline-fingerprint-pass-${pass}.sha256`),`${hash}\n`);
  } finally {
    spawnSync('supabase',['stop','--no-backup','--workdir',dir],{cwd:dir,stdio:'ignore'});
    await rm(dir,{recursive:true,force:true});
  }
}
assert.equal(fingerprints[0],fingerprints[1],'Fresh local rebuild fingerprints differ.');
console.log(`Local rebuild fingerprints match: ${fingerprints[0]}`);
