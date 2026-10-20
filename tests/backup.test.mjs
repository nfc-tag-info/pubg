import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeDefaultData } from '../src/model.mjs';
import { validateSnapshot } from '../src/snapshot.mjs';
import { exportSnapshot } from '../scripts/backup.mjs';
const config = {supabaseUrl:'https://test-project.supabase.co',supabaseKey:'test-public'};
test('backup preserves last good data on downtime, invalid data or version rollback', async () => {
  const dir = await mkdtemp(join(tmpdir(),'squad-backup-'));
  const path = join(dir,'snapshot.json');
  const row = {data:makeDefaultData(),version:4,updated_at:'2026-10-20T10:00:00Z'};
  try {
    await exportSnapshot(config,path,async(url,options)=>{
      assert.equal(url.searchParams.get('select'),'data,version,updated_at');
      assert.equal(options.headers.apikey,'test-public');
      assert.equal(options.method,undefined); // Read only.
      return Response.json([row]);
    });
    const good = await readFile(path,'utf8');
    assert.equal(validateSnapshot(JSON.parse(good),config.supabaseUrl).version,4);
    for (const response of [new Response('',{status:503}), Response.json([]),
      Response.json([{...row,data:{}}]),Response.json([{...row,version:3}])]) {
      await assert.rejects(exportSnapshot(config,path,async()=>response));
      assert.equal(await readFile(path,'utf8'),good);
    }
    await exportSnapshot(config,path,async()=>Response.json([row]));
    assert.equal(await readFile(path,'utf8'),good, 'Unchanged data must not create timestamp-only commits');
    assert.throws(()=>validateSnapshot(JSON.parse(good),'https://wrong-project.supabase.co'));
  } finally { await rm(dir,{recursive:true,force:true}); }
});
