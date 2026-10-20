import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { makeDefaultData } from '../src/model.mjs';
const projectUrl='https://test-project.supabase.co';
const snapshot={schemaVersion:1,projectUrl,version:4,updatedAt:'2026-10-20T10:00:00Z',data:makeDefaultData()};
snapshot.data.players[0].nick='Backup Gintux';
snapshot.data.meetings[1].start='2026-11-13T16:00:00Z';
const live={data:structuredClone(snapshot.data),version:5};live.data.players[0].nick='Live Gintux';
const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'msedge',headless:true});
const errors=[];
async function setup({cache,online=false,late=false,invalid=false}={}) {
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-20T12:00:00Z')});
  if(cache) await page.addInitScript(({key,cache})=>localStorage.setItem(key,JSON.stringify(cache)),{key:'squad-v1-cache:'+projectUrl,cache});
  await page.route('**/config.js',r=>r.fulfill({contentType:'text/javascript',body:`window.SQUAD_CONFIG={supabaseUrl:'${projectUrl}',supabaseKey:'public-test'};`}));
  let release;
  const gate=new Promise(resolve=>release=resolve);
  await page.route('**/squad-snapshot.json',async r=>{
    if(late) await gate;
    await r.fulfill({json:invalid?{bad:true}:snapshot});
  });
  let connected=online;
  await page.route(projectUrl+'/**',r=>{
    if(!connected) return r.fulfill({status:503,json:{message:'Project unavailable'}});
    return r.fulfill({json:r.request().url().includes('squad_clock')?'2026-10-20T12:00:00Z':live});
  });
  await page.goto(process.env.SQUAD_TEST_URL||'http://127.0.0.1:4173');
  return {page,context,release,reconnect(){connected=true;}};
}
try {
  const a=await setup();
  await a.page.waitForFunction(()=>document.querySelector('.player-name').textContent==='Backup Gintux');
  assert.match(await a.page.locator('#connection').textContent(),/Atsarginis grafikas/);
  assert.match(await a.page.locator('#meeting-start').textContent(),/18:00/);
  const before=await a.page.locator('#seconds').textContent();
  await a.page.clock.fastForward(2000);
  assert.notEqual(await a.page.locator('#seconds').textContent(),before);
  await a.page.locator('#open-settings').click();
  assert.equal(await a.page.locator('#save-button').isDisabled(),true);
  a.reconnect();await a.page.evaluate(()=>window.dispatchEvent(new Event('online')));
  await a.page.waitForFunction(()=>document.querySelector('.player-name').textContent==='Live Gintux');
  assert.match(await a.page.locator('#connection').textContent(),/atnaujinti/);
  const b=await setup({cache:{data:live.data,version:5}});
  await b.page.waitForFunction(()=>document.querySelector('.player-name').textContent==='Live Gintux');
  await b.page.waitForFunction(()=>document.querySelector('#connection').textContent.includes('paskutiniai'));
  const c=await setup({online:true,late:true});
  await c.page.waitForFunction(()=>document.querySelector('.player-name').textContent==='Live Gintux');
  c.release();
  await c.page.waitForResponse('**/squad-snapshot.json');
  assert.equal(await c.page.locator('.player-name').first().textContent(),'Live Gintux');
  const d=await setup({invalid:true,cache:{data:live.data,version:5}});
  await d.page.waitForFunction(()=>document.querySelector('#connection').textContent.includes('paskutiniai'));
  assert.equal(await d.page.locator('.player-name').first().textContent(),'Live Gintux');
  assert.deepEqual(errors,[]);
  console.log('PASS fallback: fresh device, changed date, ticking countdown, locked writes, recovery, newer cache, delayed and invalid snapshots');
} finally {await browser.close();}
