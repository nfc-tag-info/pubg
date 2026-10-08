// Browser integration with a simulated Supabase API. Database authorization is
// separately exercised against PostgreSQL by database-check.mjs.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { makeDefaultData } from '../src/model.mjs';
const browser = await chromium.launch({channel:process.env.BROWSER_CHANNEL || 'msedge',headless:true});
const uid = '11111111-1111-4111-8111-111111111111';
const jwt = [ {alg:'HS256',typ:'JWT'}, {sub:uid,exp:Date.now()/1000+3600,role:'authenticated'}, 'signature' ]
  .map(x => typeof x === 'string' ? x : Buffer.from(JSON.stringify(x)).toString('base64url')).join('.');
let row = {data:makeDefaultData(),version:0}, failSave = false;
const errors = [];
async function makeClient() {
  const context = await browser.newContext({viewport:{width:390,height:844}});
  const page = await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-08T09:00:00Z')});
  await page.route('**/config.js', route => route.fulfill({contentType:'text/javascript',body:"window.SQUAD_CONFIG={supabaseUrl:'https://test-project.supabase.co',supabaseKey:'public-test-key'};"}));
  await page.route('https://test-project.supabase.co/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let status = 200, result = null;
    if (path.endsWith('/token')) result = {access_token:jwt,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user:{id:uid,email:'test@example.test'}};
    else if (path.endsWith('/squad_state')) result = row;
    else if (path.endsWith('/squad_admins')) result = [{user_id:uid}];
    else if (path.endsWith('/squad_clock')) result = '2026-10-08T09:00:00Z';
    else if (path.endsWith('/save_squad')) {
      const body = request.postDataJSON();
      if (failSave) { status=503; result={message:'Unavailable'}; }
      else if (body.expected_version !== row.version) {status=409;result={code:'40001',message:'Conflict'};}
      else {row={data:body.next_data,version:row.version+1};result=[row];}
    } else if (path.endsWith('/logout')) {status=204;}
    else {status=404;result={message:'Unknown mock endpoint: '+path};}
    await route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:status===204?'':JSON.stringify(result)});
  });
  await page.goto('http://127.0.0.1:4173');
  await page.waitForFunction(()=>document.querySelector('#connection').textContent.includes('atnaujinti'));
  return {context,page};
}
try {
  const a = await makeClient(), b = await makeClient();
  await a.page.locator('#open-settings').click();
  assert.equal(await a.page.locator('#save-button').isDisabled(), true);
  await a.page.locator('#email').fill('test@example.test');
  await a.page.locator('#password').fill('test-only-password');
  await a.page.locator('#login-button').click();
  await a.page.waitForFunction(()=>!document.querySelector('#save-button').disabled);
  await a.page.locator('#status-p1').selectOption('ready');
  await a.page.locator('#save-button').click();
  await a.page.waitForFunction(()=>document.querySelector('#feedback').textContent==='Išsaugota visai komandai.');
  await b.page.clock.fastForward(16000);
  await b.page.waitForFunction(()=>document.querySelector('.player').classList.contains('ready'));
  // Simulate a concurrent writer while A still holds its form's old version.
  row={data:structuredClone(row.data),version:row.version+1}; row.data.players[2].nick='Vipux remote';
  await a.page.locator('#nick-p2').fill('Obas local');
  await a.page.locator('#save-button').click();
  await a.page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('kitas įrenginys'));
  assert.equal(row.data.players[1].nick,'Obas');
  assert.equal(await a.page.locator('#nick-p2').inputValue(),'Obas local');
  await a.page.locator('#reset-form').click();
  assert.equal(await a.page.locator('#nick-p3').inputValue(),'Vipux remote');
  failSave=true;
  await a.page.locator('#nick-p2').fill('Obas unsaved');
  await a.page.locator('#save-button').click();
  await a.page.waitForFunction(()=>document.querySelector('#feedback').textContent.includes('Nepavyko išsaugoti'));
  assert.equal(row.data.players[1].nick,'Obas');
  assert.equal(await a.page.locator('#nick-p2').inputValue(),'Obas unsaved');
  assert.deepEqual(errors,[]);
  console.log('PASS mocked API: login gate, save confirmation, two independent devices, conflict recovery and failed-save draft retention');
} finally {await browser.close();}
