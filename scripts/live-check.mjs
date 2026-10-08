// Read-only check of the configured live backend. Does not submit mutations.
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const configContext = { window: {} };
vm.runInNewContext(await readFile('config.js', 'utf8'), configContext);
const { supabaseUrl, supabaseKey } = configContext.window.SQUAD_CONFIG;
const headers = { apikey:supabaseKey };
const state = await fetch(`${supabaseUrl}/rest/v1/squad_state?id=eq.squad&select=data,version`, {headers});
assert.equal(state.status,200);
const [row] = await state.json();
assert.equal(row.data.players.length,4); assert.equal(row.data.meetings.length,6);
const clock = await fetch(`${supabaseUrl}/rest/v1/rpc/squad_clock`, {headers});
assert.equal(clock.status,200); assert.ok(Number.isFinite(Date.parse(await clock.json())));
const roles = await fetch(`${supabaseUrl}/rest/v1/squad_admins?select=user_id`, {headers});
assert.ok([401,403].includes(roles.status));
await mkdir('.qa',{recursive:true});
const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge',headless:true});
const errors = [];
try {
  const page = await browser.newPage({viewport:{width:390,height:844},timezoneId:'America/New_York'});
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.SQUAD_TEST_URL || 'http://127.0.0.1:4173');
  await page.waitForFunction(()=>document.querySelector('#connection').textContent==='● Komandos duomenys atnaujinti');
  assert.deepEqual(await page.locator('.player-name').allTextContents(), row.data.players.map(p=>p.nick));
  await page.screenshot({path:'.qa/live-connected.png'});
  await page.locator('#open-settings').click();
  assert.equal(await page.locator('#login-form').isVisible(),true);
  assert.equal(await page.locator('#save-button').isDisabled(),true);
  assert.match(await page.locator('#mode-notice').textContent(),/organizatoriaus/);
  assert.deepEqual(errors,[]);
  console.log('PASS LIVE: 4 players, 6 meetings, server time, protected admin table, connected mobile page and locked anonymous editing');
} finally {await browser.close();}
