// Runs only in GitHub Actions. The short-lived token never enters site files.
import { readFile } from 'node:fs/promises';
import { validateSnapshot } from '../src/snapshot.mjs';
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
if (!token || repo !== 'nfc-tag-info/pubg') throw new Error('Expected the authorized GitHub Actions repository');
const content = await readFile('squad-snapshot.json','utf8');
const snapshot = JSON.parse(content);
validateSnapshot(snapshot, 'https://elydoynuodcpdzaufcnp.supabase.co');
const endpoint = `https://api.github.com/repos/${repo}`;
async function api(path, options = {}) {
  const response = await fetch(endpoint + path, {...options, signal:AbortSignal.timeout(30000),
    headers:{Accept:'application/vnd.github+json','Content-Type':'application/json',Authorization:`Bearer ${token}`,'X-GitHub-Api-Version':'2022-11-28',...options.headers}});
  if (!response.ok) throw new Error(`GitHub ${path}: HTTP ${response.status}`);
  return response.json();
}
const current = await api('/contents/squad-snapshot.json?ref=main');
const previous = validateSnapshot(JSON.parse(Buffer.from(current.content,'base64').toString('utf8')),snapshot.projectUrl);
if (previous.version > snapshot.version) throw new Error('A newer snapshot was published by another run');
if (Buffer.from(current.content,'base64').toString('utf8') !== content) {
  await api('/contents/squad-snapshot.json', {method:'PUT',body:JSON.stringify({
    message:`Update public squad snapshot to v${snapshot.version}`,branch:'main',sha:current.sha,
    content:Buffer.from(content).toString('base64')})});
  console.log(`Committed snapshot v${snapshot.version}`);
} else console.log('Snapshot unchanged; no commit needed');

// GITHUB_TOKEN commits do not automatically start a Pages build. Explicitly
// request one if the served backup differs; also recovers a previous failed build.
const publicResponse = await fetch(`https://nfc-tag-info.github.io/pubg/squad-snapshot.json?t=${Date.now()}`, {signal:AbortSignal.timeout(20000),cache:'no-store'});
if (!publicResponse.ok || await publicResponse.text() !== content) {
  await api('/pages/builds', {method:'POST'});
  console.log('Requested GitHub Pages rebuild for the backup');
} else console.log('Published backup is current');
