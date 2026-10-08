export const ZONE = 'Europe/Vilnius';
export const STATUSES = {
  ready: { label: 'READY', description: 'Dalyvaus', symbol: '✓' },
  waiting: { label: 'WAITING', description: 'Dar neapsisprendė', symbol: '?' },
  absent: { label: 'NOT CONNECTED', description: 'Nedalyvaus', symbol: '⏚' }
};
const zoned = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
});
export function localDateTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Neteisinga data.');
  return zoned.format(date).replace(' ', 'T').slice(0, 16);
}
// Resolve Lithuanian wall time without depending on the phone's timezone.
// Reject nonexistent or ambiguous daylight-saving times instead of guessing.
export function vilniusToISO(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('Įrašyk datą ir laiką.');
  const naive = Date.parse(value + ':00Z');
  if (!Number.isFinite(naive)) throw new Error('Neteisinga data.');
  const matches = [2, 3].map(offset => naive - offset * 3600000)
    .filter(epoch => localDateTime(epoch) === value);
  if (matches.length !== 1) throw new Error('Šis laikas sutampa su laikrodžio persukimu. Pasirink kitą valandą.');
  return new Date(matches[0]).toISOString();
}
export function makeDefaultData() {
  const dates = [
    ['2026-10-09T14:00', '2026-10-11T16:00'],
    ['2026-11-13T16:00', '2026-11-15T16:00'],
    ['2026-12-11T16:00', '2026-12-13T16:00'],
    ['2027-01-08T16:00', '2027-01-10T16:00'],
    ['2027-02-12T16:00', '2027-02-14T16:00'],
    ['2027-03-12T16:00', '2027-03-14T16:00']
  ];
  return {
    players: ['Gintux', 'Obas', 'Vipux', 'Gitoshi'].map((nick, i) => ({ id: 'p' + (i + 1), nick })),
    meetings: dates.map(([start, end], i) => ({
      id: 'm' + (i + 1), start: vilniusToISO(start), end: vilniusToISO(end),
      place: 'Sodyba', note: '', attendance: { p1: 'waiting', p2: 'waiting', p3: 'waiting', p4: 'waiting' }
    }))
  };
}
export function validateData(data) {
  if (!data || !Array.isArray(data.players) || data.players.length !== 4) throw new Error('Komandoje turi būti keturi žaidėjai.');
  const ids = new Set();
  for (const [i, player] of data.players.entries()) {
    if (player.id !== 'p' + (i + 1) || typeof player.nick !== 'string' || !player.nick.trim() || player.nick.length > 18)
      throw new Error('Nickas turi būti nuo 1 iki 18 simbolių.');
    const nick = player.nick.trim().toLocaleLowerCase('lt');
    if (ids.has(nick)) throw new Error('Žaidėjų nickai turi skirtis.');
    ids.add(nick);
  }
  if (!Array.isArray(data.meetings) || data.meetings.length < 1 || data.meetings.length > 24) throw new Error('Patikrink susitikimų sąrašą.');
  const meetingIds = new Set();
  const sorted = [...data.meetings].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  let previousEnd = -Infinity;
  for (const m of sorted) {
    const start = Date.parse(m.start), end = Date.parse(m.end);
    if (typeof m.id !== 'string' || !m.id || meetingIds.has(m.id)) throw new Error('Pasikartojantis susitikimas.');
    meetingIds.add(m.id);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('Išvykimas turi būti vėliau už atvykimą.');
    if (start < previousEnd) throw new Error('Susitikimų datos negali persidengti.');
    previousEnd = end;
    if (typeof m.place !== 'string' || !m.place.trim() || m.place.length > 60) throw new Error('Vietos pavadinimas turi būti nuo 1 iki 60 simbolių.');
    if (typeof m.note !== 'string' || m.note.length > 180) throw new Error('Pastaba gali turėti iki 180 simbolių.');
    for (const p of data.players) if (!Object.hasOwn(STATUSES, m.attendance?.[p.id])) throw new Error('Pasirink kiekvieno žaidėjo būseną.');
  }
  return data;
}
export function getPhase(data, now = Date.now()) {
  const meetings = [...data.meetings].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const active = meetings.find(m => Date.parse(m.start) <= now && now < Date.parse(m.end));
  if (active) return { mode: 'active', meeting: active, target: Date.parse(active.end) };
  const next = meetings.find(m => Date.parse(m.start) > now);
  return next ? { mode: 'waiting', meeting: next, target: Date.parse(next.start) }
    : { mode: 'ended', meeting: null, target: null };
}
export function countdown(target, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((target - now) / 1000));
  return [Math.floor(seconds / 86400), Math.floor(seconds / 3600) % 24, Math.floor(seconds / 60) % 60, seconds % 60]
    .map(n => String(n).padStart(2, '0'));
}
export function formatDate(value, long = false) {
  return new Intl.DateTimeFormat('lt-LT', {
    timeZone: ZONE, month: long ? 'long' : '2-digit', day: '2-digit',
    ...(long ? { year: 'numeric', hour: '2-digit', minute: '2-digit' } : {})
  }).format(new Date(value));
}
