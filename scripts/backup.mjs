// Public data only. A failed export never replaces the last valid snapshot.
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';
import { validateSnapshot } from '../src/snapshot.mjs';

export async function exportSnapshot(config, output = 'squad-snapshot.json', request = fetch) {
  const url = new URL('/rest/v1/squad_state?id=eq.squad&select=data,version,updated_at', config.supabaseUrl);
  if (url.protocol !== 'https:') throw new Error('HTTPS is required');
  const response = await request(url, {headers:{apikey:config.supabaseKey}, signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(`Snapshot request failed: HTTP ${response.status}`);
  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error('Expected one squad record');
  const row = rows[0];
  const snapshot = validateSnapshot({schemaVersion:1, projectUrl:config.supabaseUrl,
    version:row.version, updatedAt:row.updated_at, data:row.data}, config.supabaseUrl);
  let previous;
  try { previous = validateSnapshot(JSON.parse(await readFile(output,'utf8')), config.supabaseUrl); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (previous && previous.version > snapshot.version) throw new Error('Refusing to replace a newer snapshot');
  const content = JSON.stringify(snapshot, null, 2) + '\n';
  await mkdir(dirname(resolve(output)), {recursive:true});
  await writeFile(output + '.tmp', content);
  await rename(output + '.tmp', output);
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const context = {window:{}};
  vm.runInNewContext(await readFile('config.js','utf8'), context);
  const snapshot = await exportSnapshot(context.window.SQUAD_CONFIG);
  console.log(`Validated public snapshot v${snapshot.version}: ${snapshot.data.meetings.length} meetings`);
}
