import { createClient } from '@supabase/supabase-js';
import { makeDefaultData, validateData, getPhase, countdown, formatDate, localDateTime, vilniusToISO, STATUSES } from './model.mjs';

const $ = id => document.getElementById(id);
const config = window.SQUAD_CONFIG || {};
const configured = Boolean(config.supabaseUrl && config.supabaseKey);
let client = null;
try { if (configured) client = createClient(config.supabaseUrl, config.supabaseKey); } catch { /* Keep the page usable with a configuration error. */ }
const demo = !configured;
const cacheKey = 'squad-v1-cache:' + (config.supabaseUrl || 'preview');
let data = makeDefaultData(), version = null, hasRemote = false, connected = false;
let draft, draftVersion, selectedId, dirty = false, saving = false, admin = false, session = null;
let previewMode = null, lastPhaseKey = '', loadingTimer, phase;
let clockAnchor = Date.now(), clockAt = performance.now(), clockSynced = false;
let refreshPromise = null, lastClockSync = 0;
function now() { return clockAnchor + performance.now() - clockAt; }
function storageRead() {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey));
    if (cached) { data = validateData(cached.data); version = cached.version; }
  } catch { /* A damaged or unavailable cache must not stop the countdown. */ }
}
function storageWrite() {
  try { localStorage.setItem(cacheKey, JSON.stringify({ data, version })); } catch { /* Read-only/private browsing. */ }
}
storageRead();
function feedback(message = '', success = false) {
  $('feedback').textContent = message;
  $('feedback').classList.toggle('success', success);
}
function connectionLabel() {
  const el = $('connection');
  el.className = 'connection' + (demo ? ' demo' : !connected ? ' error' : '');
  el.textContent = demo ? 'V1 PERŽIŪRA · tik šiame įrenginyje'
    : !client ? 'Nepavyko prijungti nustatymų'
    : !connected ? (version === null ? 'Ryšio nėra · datos nepatvirtintos' : 'Ryšio nėra · paskutiniai gauti duomenys')
    : clockSynced ? '● Komandos duomenys atnaujinti' : '● Duomenys atnaujinti · telefono laikas';
}
const plugSVG = '<svg class="plug" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-6 6v4M6 12a6 6 0 0 0 6 6M3 3l18 18"/></svg>';
function renderPlayers(meeting) {
  const nodes = data.players.map(player => {
    const status = meeting?.attendance[player.id] || 'waiting';
    const node = document.createElement('div');
    node.className = 'player ' + status;
    const name = document.createElement('span');
    name.className = 'player-name'; name.textContent = player.nick; name.title = player.nick;
    const badge = document.createElement('span'); badge.className = 'player-state';
    if (status === 'absent') badge.innerHTML = plugSVG;
    else { const symbol = document.createElement('span'); symbol.className = 'symbol'; symbol.textContent = STATUSES[status].symbol; badge.append(symbol); }
    badge.append(document.createTextNode(STATUSES[status].label));
    node.setAttribute('aria-label', player.nick + ': ' + STATUSES[status].description);
    node.append(name, badge); return node;
  });
  $('players').replaceChildren(...nodes);
  const count = meeting ? data.players.filter(p => meeting.attendance[p.id] === 'ready').length : 0;
  $('ready-count').textContent = meeting ? `${count} / 4 READY` : 'IKI KITO SEZONO';
}
function effectivePhase() {
  const real = getPhase(data, now());
  if (!previewMode) return real;
  const meeting = real.meeting || data.meetings[0];
  return { mode: previewMode, meeting: previewMode === 'ended' ? null : meeting,
    target: previewMode === 'active' ? now() + 2 * 86400000 : now() + 86400000 };
}
function render(force = false) {
  phase = effectivePhase();
  const { mode, meeting } = phase;
  const key = `${previewMode || 'live'}:${mode}:${meeting?.id || ''}`;
  if (key !== lastPhaseKey || force) {
    const changed = key !== lastPhaseKey;
    lastPhaseKey = key;
    $('stage').classList.toggle('active', mode === 'active');
    $('stage').classList.toggle('ended', mode === 'ended');
    $('preview-strip').hidden = !previewMode;
    $('countdown').hidden = mode === 'ended';
    $('countdown').setAttribute('aria-label', mode === 'active' ? 'Laikas iki išvykimo' : 'Laikas iki susitikimo');
    $('match-kicker').replaceChildren();
    if (mode === 'waiting') { const spinner = document.createElement('span'); spinner.className = 'spinner'; spinner.ariaHidden = 'true'; $('match-kicker').append(spinner); }
    $('match-kicker').append(document.createTextNode(mode === 'waiting' ? 'MATCH STARTS IN' : mode === 'active' ? 'SQUAD IN GAME' : 'SEASON COMPLETE'));
    $('match-title').textContent = mode === 'waiting' ? 'Iki kito susitikimo' : mode === 'active' ? 'Mūsų savaitgalis prasidėjo' : 'Gera komanda. Geri prisiminimai.';
    $('meeting-place').textContent = meeting?.place || 'Sezonas baigtas';
    $('meeting-start').textContent = meeting ? formatDate(meeting.start, true) : 'Susitiksim vėl';
    if (meeting) $('meeting-start').dateTime = meeting.start; else $('meeting-start').removeAttribute('datetime');
    $('departure').textContent = meeting ? (mode === 'active' ? 'Iki išvykimo · ' : 'Išvykstam · ') + formatDate(meeting.end, true) : 'Kitas datas galėsi pakeisti nustatymuose.';
    $('meeting-note').textContent = meeting?.note || '';
    $('meeting-note').hidden = !meeting?.note;
    const years = data.meetings.flatMap(m => [new Date(m.start).getUTCFullYear(), new Date(m.end).getUTCFullYear()]);
    $('season-label').textContent = `${Math.min(...years)} / ${Math.max(...years)} SEZONAS`;
    renderPlayers(meeting);
    if (changed) {
      clearTimeout(loadingTimer);
      $('loading').hidden = mode !== 'active';
      if (mode === 'active') loadingTimer = setTimeout(() => { $('loading').hidden = true; }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 2200);
    }
  }
  if (phase.target) countdown(phase.target, now()).forEach((value, i) => { $((['days','hours','minutes','seconds'])[i]).textContent = value; });
}
function canEdit() { return demo || (admin && connected && hasRemote); }
function updateAccess() {
  $('login-form').hidden = demo || Boolean(session);
  $('logout').hidden = !session;
  $('edit-fields').disabled = !canEdit() || saving;
  $('save-button').disabled = !canEdit() || saving;
  $('save-button').textContent = saving ? 'Saugoma…' : demo ? 'Taikyti peržiūrai' : 'Išsaugoti visiems';
  $('mode-notice').textContent = demo
    ? 'V1 peržiūra. Pakeitimai saugomi tik šiame įrenginyje. Bendras išsaugojimas dar neprijungtas.'
    : !connected ? 'Nepavyko gauti naujausių duomenų. Pabandyk vėliau – laikmatis rodo paskutines žinomas datas.'
    : admin ? 'Pakeitimai bus išsaugoti visai komandai. Visi laikai – Lietuvos.'
    : session ? 'Ši paskyra neturi organizatoriaus teisių. Susitikimus gali peržiūrėti.'
    : 'Susitikimus gali peržiūrėti visi. Pakeitimams reikalingas organizatoriaus prisijungimas.';
  connectionLabel();
}
function makePlayerFields() {
  $('player-fields').replaceChildren(...draft.players.map((p, i) => {
    const row = document.createElement('div'); row.className = 'player-edit';
    const number = document.createElement('span'); number.textContent = '0' + (i + 1);
    const nameLabel = document.createElement('label'); nameLabel.textContent = 'Nickas';
    const input = document.createElement('input'); input.id = 'nick-' + p.id; input.maxLength = 18; input.required = true; input.value = p.nick; input.setAttribute('aria-label', (i + 1) + ' žaidėjo nickas');
    nameLabel.append(input);
    const statusLabel = document.createElement('label'); statusLabel.textContent = 'Dalyvavimas';
    const select = document.createElement('select'); select.id = 'status-' + p.id; select.setAttribute('aria-label', (i + 1) + ' žaidėjo dalyvavimas');
    for (const [value, info] of Object.entries(STATUSES)) { const option = new Option((value === 'absent' ? '⊘' : info.symbol) + ' ' + info.label, value); option.title = info.description; select.append(option); }
    statusLabel.append(select); row.append(number, nameLabel, statusLabel); return row;
  }));
}
function showMeetingFields() {
  const m = draft.meetings.find(m => m.id === selectedId);
  $('arrival').value = localDateTime(m.start); $('departure-input').value = localDateTime(m.end);
  $('place').value = m.place; $('note').value = m.note;
  draft.players.forEach(p => { $('status-' + p.id).value = m.attendance[p.id]; $('nick-' + p.id).value = p.nick; });
}
function captureDraft() {
  const candidate = structuredClone(draft);
  const meeting = candidate.meetings.find(m => m.id === selectedId);
  meeting.start = vilniusToISO($('arrival').value); meeting.end = vilniusToISO($('departure-input').value);
  meeting.place = $('place').value.trim(); meeting.note = $('note').value.trim();
  candidate.players.forEach(p => { p.nick = $('nick-' + p.id).value.trim(); meeting.attendance[p.id] = $('status-' + p.id).value; });
  draft = validateData(candidate);
}
function resetDraft(preferredId) {
  draft = structuredClone(data); draftVersion = version; dirty = false;
  selectedId = preferredId && draft.meetings.some(m => m.id === preferredId) ? preferredId : (getPhase(data, now()).meeting || data.meetings[0]).id;
  $('meeting-select').replaceChildren(...[...draft.meetings].sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).map(m => new Option(formatDate(m.start, true), m.id)));
  $('meeting-select').value = selectedId; makePlayerFields(); showMeetingFields(); feedback(); updateAccess();
}
function openSettings() { resetDraft(); $('settings').showModal(); }
$('open-settings').addEventListener('click', openSettings);
$('open-calendar').addEventListener('click', openSettings);
$('close-settings').addEventListener('click', () => $('settings').close());
$('settings').addEventListener('close', () => { $('password').value = ''; });
$('settings-form').addEventListener('input', () => { dirty = true; feedback(); });
$('meeting-select').addEventListener('change', () => {
  try { if (canEdit()) captureDraft(); selectedId = $('meeting-select').value; showMeetingFields(); feedback(); }
  catch (error) { $('meeting-select').value = selectedId; feedback(error.message); }
});
$('reset-form').addEventListener('click', () => resetDraft(selectedId));
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!canEdit() || saving) return;
  try {
    captureDraft(); saving = true; updateAccess(); feedback();
    if (demo) { data = structuredClone(draft); storageWrite(); render(true); resetDraft(selectedId); feedback('Pritaikyta tik šio įrenginio peržiūrai. Kiti draugai šių pakeitimų nemato.', true); }
    else {
      const { data: rows, error } = await client.rpc('save_squad', { expected_version: draftVersion, next_data: draft });
      if (error) {
        if (error.code === '40001') { await refresh(); throw new Error('Duomenis jau pakeitė kitas įrenginys. Paspausk „Atšaukti pakeitimus“, peržiūrėk naujausias reikšmes ir bandyk dar kartą.'); }
        throw new Error('Nepavyko išsaugoti. Patikrink ryšį ir prisijungimą. Tavo įvesti pakeitimai liko lange.');
      }
      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) throw new Error('Serveris nepatvirtino išsaugojimo. Pabandyk atnaujinti duomenis.');
      acceptRow(row); resetDraft(selectedId); feedback('Išsaugota visai komandai.', true);
    }
  } catch (error) { feedback(error.message); }
  finally { saving = false; updateAccess(); }
});
document.querySelectorAll('[data-preview]').forEach(button => button.addEventListener('click', () => {
  previewMode = button.dataset.preview; lastPhaseKey = ''; $('settings').close(); render(true);
}));
$('end-preview').addEventListener('click', () => { previewMode = null; render(true); });
function acceptRow(row) {
  validateData(row.data);
  if (!Number.isSafeInteger(row.version) || row.version < 0) throw new Error('Invalid server version');
  if (hasRemote && version !== null && row.version < version) return;
  data = row.data; version = row.version; hasRemote = true; connected = true;
  storageWrite(); render(true); updateAccess();
  if ($('settings').open && !dirty && !saving) resetDraft(selectedId);
}
async function syncClock() {
  const start = performance.now();
  const { data: timestamp, error } = await client.rpc('squad_clock');
  const epoch = Date.parse(timestamp);
  if (!error && Number.isFinite(epoch)) {
    clockAnchor = epoch + (performance.now() - start) / 2; clockAt = performance.now(); clockSynced = true; lastClockSync = Date.now();
  }
}
async function refresh() {
  if (!client || document.hidden) return;
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const { data: row, error } = await client.from('squad_state').select('data,version').eq('id', 'squad').single();
      if (error || !row) throw error || new Error('Missing state');
      acceptRow(row);
      if (Date.now() - lastClockSync > 300000) await syncClock();
    } catch { connected = false; }
    finally { refreshPromise = null; updateAccess(); }
  })();
  return refreshPromise;
}
let accessCheck = 0;
async function checkAccess(nextSession) {
  const check = ++accessCheck; session = nextSession; admin = false; updateAccess();
  if (session && client) {
    const { data: record, error } = await client.from('squad_admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
    if (check !== accessCheck) return;
    admin = !error && Boolean(record);
  }
  updateAccess();
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault(); if (!client) return;
  $('login-button').disabled = true; feedback();
  try {
    const { data: auth, error } = await client.auth.signInWithPassword({ email: $('email').value.trim(), password: $('password').value });
    $('password').value = '';
    if (error) throw new Error('Prisijungti nepavyko. Patikrink el. paštą ir slaptažodį.');
    await checkAccess(auth.session); await refresh();
    feedback(admin ? 'Prisijungta. Gali keisti komandos nustatymus.' : 'Prisijungta, bet šiai paskyrai nesuteiktos organizatoriaus teisės.', admin);
  } catch (error) { feedback(error.message); }
  finally { $('login-button').disabled = false; }
});
$('logout').addEventListener('click', async () => { if (client) { await client.auth.signOut(); await checkAccess(null); resetDraft(selectedId); } });
window.addEventListener('offline', () => { connected = false; updateAccess(); });
window.addEventListener('online', () => refresh());
document.addEventListener('visibilitychange', () => { if (!document.hidden) { lastClockSync = 0; render(); refresh(); } });
setInterval(() => { if (!document.hidden) render(); }, 250);
render(); updateAccess();
if (client) {
  client.auth.onAuthStateChange((_event, nextSession) => { queueMicrotask(() => checkAccess(nextSession)); });
  client.auth.getSession().then(({ data: auth }) => checkAccess(auth.session));
  refresh();
  client.channel('squad-live').on('postgres_changes', { event:'UPDATE', schema:'public', table:'squad_state', filter:'id=eq.squad' }, () => refresh()).subscribe();
  setInterval(refresh, 15000);
}
