import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root=resolve(new URL('..',import.meta.url).pathname);
const validator=join(root,'scripts/validate-local-baseline.mjs');
function validate(path,env={}) { return spawnSync(process.execPath,[validator,path],{cwd:root,encoding:'utf8',env:{...process.env,...env}}); }
const fixture=join(root,'test/fixtures/synthetic-baseline.sql');
const first=validate(fixture);
assert.equal(first.status,0,first.stderr);
const originalHash=(await readFile(join(root,'.local-baseline-fingerprint-pass-1.sha256'),'utf8')).trim();
assert.equal(originalHash,(await readFile(join(root,'.local-baseline-fingerprint-pass-2.sha256'),'utf8')).trim());
const dir=await mkdtemp(join(tmpdir(),'changed-baseline-'));
try {
  const changed=join(dir,'changed.sql');
  await cp(fixture,changed);
  await writeFile(changed,(await readFile(changed,'utf8'))+'alter table app_test.notes add column changed boolean not null default false;\n');
  const second=validate(changed);
  assert.equal(second.status,0,second.stderr);
  const changedHash=(await readFile(join(root,'.local-baseline-fingerprint-pass-1.sha256'),'utf8')).trim();
  assert.notEqual(changedHash,originalHash,'A schema change must alter the fingerprint.');
  const blocked=validate(fixture,{DATABASE_URL:'postgresql://remote.invalid/db'});
  assert.notEqual(blocked.status,0,'A remote target environment must be rejected.');
  assert.match(blocked.stderr,/refusing validation while remote-capable credentials\/targets are present/);
  const linkedMarker=join(root,'supabase/.temp/project-ref');
  try {
    await mkdir(join(root,'supabase/.temp'),{recursive:true});
    await writeFile(linkedMarker,'synthetic-linked-ref\n');
    const linked=validate(fixture);
    assert.notEqual(linked.status,0,'Linked-project state must be rejected.');
    assert.match(linked.stderr,/Linked-project state detected/);
  } finally { await rm(linkedMarker,{force:true}); }
} finally { await rm(dir,{recursive:true,force:true}); }
console.log('Synthetic candidate applies reproducibly, changes are detected, and remote targets are blocked.');
