(() => {
'use strict';

/* ================= Constants & plan data ================= */
const LOOP_KM = 6.706;
const KEY = 'g48.v1';
const DAY_MS = 86400000;
const MAX_LOOPS = 500;
const MAX_IMPORT_BYTES = 1000000;
const TS_MIN = 1e12, TS_MAX = 4.1e12;
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MODES = { hourly: { ms: 3600000, max: Infinity }, four: { ms: 14400000, max: 12 } };

// [week, day(s), session, km, note]
const RAW_PLAN = [
  [1, 'Tue', 'Easy loop', 6.7, 'Easy enough to hold a conversation'],
  [1, 'Thu', 'Easy loop + 4x 20 sec strides', 6.7, ''],
  [1, 'Sat', 'Easy long run', 10, ''],
  [1, 'Sun', 'Recovery jog, very easy', 3.5, ''],
  [2, 'Tue', 'Easy loop', 6.7, ''],
  [2, 'Thu', 'Easy long run', 8, ''],
  [2, 'Sat', '2 loops, start each on the hour', 13.4, 'Practise the backyard rhythm'],
  [2, 'Sun', 'Recovery jog', 5, ''],
  [3, 'Tue', 'Easy loop', 6.7, ''],
  [3, 'Wed', 'Easy loop', 6.7, ''],
  [3, 'Thu', 'Easy long run', 8, ''],
  [3, 'Sat', 'Double: 2 loops, 4 hours apart (08:00, 12:00)', 13.4, 'Practise eating and drinking between runs'],
  [3, 'Sun', 'Easy loop', 6.7, ''],
  [4, 'Tue', 'Easy loop', 6.7, 'Recovery week'],
  [4, 'Thu', 'Easy loop', 6.7, ''],
  [4, 'Sat', 'Easy long run', 10, ''],
  [5, 'Tue', 'Easy long run', 8, ''],
  [5, 'Wed', 'Easy loop', 6.7, ''],
  [5, 'Thu', 'Easy long run', 8, ''],
  [5, 'Sat', '3 loops every 4 hours (08:00, 12:00, 16:00)', 20.1, 'Eat within 30 min after each run'],
  [5, 'Sun', 'Easy loop on tired legs', 6.7, ''],
  [6, 'Tue', 'Easy long run', 8, ''],
  [6, 'Wed', 'Easy loop', 6.7, ''],
  [6, 'Thu', 'Easy long run', 10, ''],
  [6, 'Sat', '3 loops every 4 hours (08:00, 12:00, 16:00)', 20.1, ''],
  [6, 'Sun', '2 loops every 4 hours (09:00, 13:00)', 13.4, 'Highest-mileage week'],
  [7, 'Tue', 'Easy long run', 8, ''],
  [7, 'Wed', 'Easy loop', 6.7, ''],
  [7, 'Thu', 'Easy long run', 10, ''],
  [7, 'Sat', '4 loops every 4 hours incl. night (16:00, 20:00, 00:00, 04:00)', 26.8, 'Headlamp + reflective vest; practise 2–2.5 h sleep blocks'],
  [8, 'Tue', 'Easy loop', 6.7, 'Recovery week'],
  [8, 'Thu', 'Easy loop', 6.7, ''],
  [8, 'Sat', '2 loops, start each on the hour', 13.4, ''],
  [9, 'Tue', 'Easy long run', 8, ''],
  [9, 'Thu', 'Easy loop', 6.7, ''],
  [9, 'Sat-Sun', '24-hour simulation: 6 loops every 4 hours (Sat 08:00 to Sun 04:00)', 40.2, 'Dress rehearsal: test kit, food, alarms, sleep'],
  [10, 'Tue', 'Recovery jog', 5, 'Extra rest day if still tired'],
  [10, 'Wed', 'Easy loop', 6.7, ''],
  [10, 'Thu', 'Easy long run', 8, ''],
  [10, 'Sat', '2 loops every 4 hours (08:00, 12:00)', 13.4, ''],
  [10, 'Sun', 'Easy loop', 6.7, ''],
  [11, 'Tue', 'Easy loop', 6.7, 'Taper: fewer km, get fresh'],
  [11, 'Thu', 'Easy loop', 6.7, ''],
  [11, 'Sat', 'Easy long run', 10, ''],
  [12, 'Mon', 'Easy loop', 6.7, ''],
  [12, 'Wed', 'Short jog + 4x 20 sec strides', 4, 'Rest until the start'],
  [12, 'Fri-Sun', '4x4x48: 12 loops every 4 hours', 80.5, 'E.g. start Fri 20:00; aim for 45–48 min per loop'],
];

const SESSIONS = RAW_PLAN.map(([week, days, title, km, note]) => {
  const parts = days.split('-');
  const day = DAYS.indexOf(parts[0]);
  const endDay = parts.length > 1 ? DAYS.indexOf(parts[1]) : day;
  return { id: 'w' + week + 'd' + day, week, day, endDay, title, km, note };
});
const TOTAL_PLANNED = SESSIONS.reduce((a, s) => a + s.km, 0);

/* ================= Small helpers ================= */
const $ = (sel) => document.querySelector(sel);
const pad = (n) => String(n).padStart(2, '0');
const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const num = (x, min, max) => (typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : null);
const int = (x, min, max) => { const n = num(x, min, max); return n !== null && Number.isInteger(n) ? n : null; };

// DOM builder. All text goes through text nodes / textContent, never innerHTML.
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function s(tag, attrs, text) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = String(text);
  return e;
}

/* ================= Date / format helpers ================= */
function parseISODate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 2000 || y > 2100) return null;
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return t;
}
const isoFromUTC = (t) => new Date(t).toISOString().slice(0, 10);
const todayUTC = () => { const n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); };
const fmtDate = (t, o) => new Date(t).toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC' }, o));
const fmtDay = (t) => fmtDate(t, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtKm = (k) => (Math.round(k * 10) / 10).toFixed(1);
function fmtClock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  return hh > 0 ? hh + ':' + pad(mm) + ':' + pad(ss) : pad(mm) + ':' + pad(ss);
}
function fmtPace(secPerKm) {
  const r = Math.round(secPerKm);
  return Math.floor(r / 60) + ':' + pad(r % 60);
}
function fmtWhen(ts) {
  const d = new Date(ts);
  const same = d.toDateString() === new Date().toDateString();
  return d.toLocaleString('en-GB', same ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short', hour: '2-digit', minute: '2-digit' });
}
function parseTime(str) {
  let m = /^(\d{1,3}):([0-5]\d)$/.exec(str);
  if (m) { const v = +m[1] * 60 + +m[2]; return v >= 1 ? v : null; }
  m = /^(\d{1,2}):([0-5]\d):([0-5]\d)$/.exec(str);
  if (m) { const v = +m[1] * 3600 + +m[2] * 60 + +m[3]; return v >= 1 && v <= 359999 ? v : null; }
  return null;
}
function parseKm(str) {
  const t = str.replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,3})?$/.test(t)) return null;
  const v = parseFloat(t);
  return v >= 0.01 && v <= 500 ? Math.round(v * 100) / 100 : null;
}
function parsePace(str) {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(str);
  if (!m) return null;
  const v = +m[1] * 60 + +m[2];
  return v >= 180 && v <= 900 ? v : null;
}

/* ================= State: load / sanitise / save ================= */
const defaults = () => ({
  v: 1, startDate: null, done: {}, logs: {},
  settings: { paceMin: 420, paceMax: 450, sound: true, vibrate: true, wake: false },
  timer: { mode: 'hourly', startTs: null, loops: [], alerts: {} },
});

// Builds a fresh, whitelisted state object from untrusted input (localStorage or imported JSON).
function sanitize(raw) {
  const st = defaults();
  if (!isObj(raw)) return st;

  if (typeof raw.startDate === 'string') {
    const t = parseISODate(raw.startDate);
    if (t !== null && new Date(t).getUTCDay() === 1) st.startDate = raw.startDate;
  }
  if (isObj(raw.done)) {
    for (const se of SESSIONS) if (own(raw.done, se.id) && raw.done[se.id] === true) st.done[se.id] = true;
  }
  if (isObj(raw.logs)) {
    for (const se of SESSIONS) {
      if (!own(raw.logs, se.id) || !isObj(raw.logs[se.id])) continue;
      const l = raw.logs[se.id];
      let km = num(l.km, 0.01, 500);
      if (km !== null) km = Math.round(km * 100) / 100;
      const sec = int(l.sec, 1, 359999);
      if (km !== null || sec !== null) st.logs[se.id] = { km, sec };
    }
  }
  if (isObj(raw.settings)) {
    const r = raw.settings;
    const a = int(r.paceMin, 180, 900), b = int(r.paceMax, 180, 900);
    if (a !== null && b !== null && a < b) { st.settings.paceMin = a; st.settings.paceMax = b; }
    for (const k of ['sound', 'vibrate', 'wake']) if (typeof r[k] === 'boolean') st.settings[k] = r[k];
  }
  if (isObj(raw.timer)) {
    const r = raw.timer;
    if (r.mode === 'hourly' || r.mode === 'four') st.timer.mode = r.mode;
    const t0 = int(r.startTs, TS_MIN, TS_MAX);
    if (t0 !== null) {
      st.timer.startTs = t0;
      if (Array.isArray(r.loops)) {
        let prev = 0;
        for (const l of r.loops.slice(0, MODES[st.timer.mode].max === Infinity ? MAX_LOOPS : MODES[st.timer.mode].max)) {
          if (!isObj(l)) break;
          const a = int(l.start, TS_MIN, TS_MAX), b = int(l.end, TS_MIN, TS_MAX);
          if (a === null || b === null || b < a || b - a > 7 * DAY_MS || a < prev) break;
          st.timer.loops.push({ n: st.timer.loops.length + 1, start: a, end: b });
          prev = b;
        }
      }
    }
    if (isObj(r.alerts)) {
      for (const k of Object.keys(r.alerts).slice(0, 50)) {
        if (/^\d{1,3}-(10|1)$/.test(k) && r.alerts[k] === true) st.timer.alerts[k] = true;
      }
    }
  }
  return st;
}

let state = defaults();
let storageOk = true;

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { storageOk = false; return defaults(); }
  if (!raw || raw.length > 2000000) return defaults();
  try { return sanitize(JSON.parse(raw)); } catch (e) {
    try { localStorage.setItem(KEY + '.bak', raw); } catch (e2) { /* ignore */ }
    return defaults();
  }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; } catch (e) {
    storageOk = false;
    showBanner('Could not save: browser storage is full or blocked. Export a backup.', 'warn');
  }
}

/* ================= Plan position & session helpers ================= */
const startUTC = () => (state.startDate ? parseISODate(state.startDate) : null);
const sessStart = (se, st) => st + ((se.week - 1) * 7 + se.day) * DAY_MS;
const sessEnd = (se, st) => st + ((se.week - 1) * 7 + se.endDay) * DAY_MS;

function position() {
  const st = startUTC();
  if (st === null) return { kind: 'unset' };
  const diff = Math.round((todayUTC() - st) / DAY_MS);
  if (diff < 0) return { kind: 'before', st, diff };
  if (diff >= 84) return { kind: 'after', st, diff };
  return { kind: 'active', st, diff, week: Math.floor(diff / 7) + 1, day: diff % 7 };
}
function isToday(se) {
  const st = startUTC();
  if (st === null) return false;
  const t = todayUTC();
  return t >= sessStart(se, st) && t <= sessEnd(se, st);
}
function whenLabel(se) {
  const st = startUTC();
  if (st === null) return se.endDay === se.day ? DAYS[se.day] : DAYS[se.day] + '–' + DAYS[se.endDay];
  const a = sessStart(se, st);
  return se.endDay === se.day ? fmtDay(a) : fmtDay(a) + ' – ' + fmtDay(sessEnd(se, st));
}
const effKm = (se) => (state.done[se.id] ? (state.logs[se.id] && state.logs[se.id].km !== null ? state.logs[se.id].km : se.km) : 0);

/* ================= Banner / audio / alerts ================= */
let bannerTimer = null;
function showBanner(msg, kind) {
  const b = $('#banner');
  b.textContent = msg;
  b.className = 'banner ' + (kind || '');
  b.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.hidden = true; }, 20000);
}

let actx = null;
function unlockAudio() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!actx) actx = new AC();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { /* ignore */ }
}
function beep(count) {
  if (!actx) return;
  try {
    const t0 = actx.currentTime + 0.05;
    for (let i = 0; i < count; i++) {
      const t = t0 + i * 0.4;
      const osc = actx.createOscillator(), g = actx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      osc.connect(g);
      g.connect(actx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    }
  } catch (e) { /* ignore */ }
}
function fireAlert(min) {
  showBanner(min === 10 ? 'Next loop starts in 10 minutes' : 'Next loop starts in 1 minute', 'alert');
  if (state.settings.vibrate) {
    try { if (navigator.vibrate) navigator.vibrate(min === 1 ? [300, 150, 300, 150, 300] : [400, 200, 400]); } catch (e) { /* ignore */ }
  }
  if (state.settings.sound) beep(min === 1 ? 3 : 2);
}

let wakeLock = null, wakePending = false;
async function syncWake() {
  if (wakePending) return;
  wakePending = true;
  try {
    const info = timerInfo(Date.now());
    const want = state.settings.wake && info && !info.complete && document.visibilityState === 'visible';
    if (want && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { wakeLock = null; } finally { wakePending = false; }
}

/* ================= Confirm dialog ================= */
function confirmAction(msg, okLabel) {
  return new Promise((resolve) => {
    const dlg = $('#confirmDlg');
    if (typeof dlg.showModal !== 'function') { resolve(window.confirm(msg)); return; }
    $('#confirmMsg').textContent = msg;
    $('#confirmOk').textContent = okLabel || 'OK';
    dlg.returnValue = '';
    const onClose = () => { dlg.removeEventListener('close', onClose); resolve(dlg.returnValue === 'ok'); };
    dlg.addEventListener('close', onClose);
    dlg.showModal();
  });
}

/* ================= Plan view ================= */
const openWeeks = new Set();
const openLogs = new Set();

function toggleDone(id, val) {
  if (val) state.done[id] = true; else delete state.done[id];
  save();
  renderAll();
}

function paceClass(spk) {
  if (spk < state.settings.paceMin) return 'fast';
  if (spk > state.settings.paceMax) return 'slow';
  return '';
}

function logForm(se) {
  const log = state.logs[se.id] || { km: null, sec: null };
  const km = h('input', { type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: fmtKm(se.km), maxlength: 7 });
  const tm = h('input', { type: 'text', autocomplete: 'off', placeholder: 'mm:ss', maxlength: 8 });
  if (log.km !== null) km.value = String(log.km);
  if (log.sec !== null) tm.value = fmtClock(log.sec);
  const err = h('p', { class: 'err', role: 'alert' });
  const fail = (m) => { err.textContent = m; };
  const saveBtn = h('button', {
    type: 'button', class: 'btn primary small', onclick: () => {
      let kmv = null, sec = null;
      const kms = km.value.trim(), ts = tm.value.trim();
      if (kms) { kmv = parseKm(kms); if (kmv === null) return fail('Distance: a number from 0.01 to 500 km.'); }
      if (ts) { sec = parseTime(ts); if (sec === null) return fail('Time: mm:ss (e.g. 47:12) or h:mm:ss.'); }
      if (kmv === null && sec === null) return fail('Enter a distance, a time, or both.');
      state.logs[se.id] = { km: kmv, sec };
      state.done[se.id] = true;
      openLogs.delete(se.id);
      save();
      renderAll();
    },
  }, 'Save log');
  const clearBtn = h('button', {
    type: 'button', class: 'btn small', onclick: () => {
      delete state.logs[se.id];
      openLogs.delete(se.id);
      save();
      renderAll();
    },
  }, 'Clear log');
  return h('div', { class: 'logform' },
    h('div', { class: 'row' },
      h('label', { class: 'lbl' }, 'Distance (km)', km),
      h('label', { class: 'lbl' }, 'Time (mm:ss)', tm)),
    h('div', { class: 'row' }, saveBtn, clearBtn),
    err);
}

function sessionRow(se) {
  const log = state.logs[se.id];
  const isDone = !!state.done[se.id];
  const today = isToday(se);
  const cb = h('input', { type: 'checkbox', 'aria-label': 'Done: ' + whenLabel(se) + ' ' + se.title, onchange: (e) => toggleDone(se.id, e.target.checked) });
  cb.checked = isDone;

  const info = h('div', { class: 'info' },
    h('div', { class: 'when' }, whenLabel(se), today ? h('span', { class: 'badge' }, 'Today') : null),
    h('div', { class: 'stitle' }, se.title),
    h('div', { class: 'meta' }, fmtKm(se.km) + ' km'),
    se.note ? h('div', { class: 'note' }, se.note) : null);

  if (log) {
    const bits = [];
    if (log.km !== null) bits.push(log.km + ' km');
    if (log.sec !== null) bits.push(fmtClock(log.sec));
    let cls = '';
    if (log.km !== null && log.sec !== null) {
      const spk = log.sec / log.km;
      bits.push(fmtPace(spk) + ' /km');
      cls = paceClass(spk);
    }
    info.append(h('div', { class: 'result ' + cls }, 'Logged: ' + bits.join(' · ')));
  }
  const open = openLogs.has(se.id);
  info.append(h('button', {
    type: 'button', class: 'btn small', 'aria-expanded': String(open), onclick: () => {
      if (openLogs.has(se.id)) openLogs.delete(se.id); else openLogs.add(se.id);
      renderAll();
    },
  }, open ? 'Close' : (log ? 'Edit log' : 'Log run')));
  if (open) info.append(logForm(se));

  return h('div', { class: 'sess' + (isDone ? ' done' : '') + (today ? ' today' : '') }, h('label', { class: 'chk' }, cb), info);
}

function startDateForm() {
  const inp = h('input', { type: 'date', min: '2000-01-01', max: '2100-12-31' });
  inp.value = state.startDate || '';
  const err = h('p', { class: 'err', role: 'alert' });
  const saveBtn = h('button', {
    type: 'button', class: 'btn primary', onclick: () => {
      const r = setStartDate(inp.value);
      if (r) err.textContent = r;
    },
  }, 'Save start date');
  const nextBtn = h('button', {
    type: 'button', class: 'btn', onclick: () => {
      const t = todayUTC();
      const dow = new Date(t).getUTCDay();
      inp.value = isoFromUTC(t + ((8 - dow) % 7) * DAY_MS);
    },
  }, 'Next Monday');
  return h('div', null,
    h('label', { class: 'lbl' }, 'First day of week 1 (must be a Monday)', inp),
    h('div', { class: 'row' }, nextBtn, saveBtn), err);
}
function setStartDate(v) {
  const t = parseISODate(v);
  if (t === null) return 'Pick a valid date.';
  const dow = new Date(t).getUTCDay();
  if (dow !== 1) return 'That date is a ' + DAY_NAMES[(dow + 6) % 7] + '. Pick a Monday.';
  state.startDate = v;
  save();
  renderAll();
  return '';
}

function renderToday() {
  const box = $('#today');
  box.replaceChildren();
  const pos = position();
  const card = h('div', { class: 'card today-card' });
  if (pos.kind === 'unset') {
    card.append(h('h2', null, 'Set your start date'),
      h('p', { class: 'hint' }, 'Pick the Monday your 12-week plan begins. Weeks and days then turn into real dates.'),
      startDateForm());
  } else if (pos.kind === 'after') {
    card.append(h('h2', null, 'Plan complete'),
      h('p', null, 'The 12 weeks are over. Check the Progress tab for your totals.'));
  } else {
    const list = SESSIONS.filter(isToday);
    if (pos.kind === 'before') {
      card.append(h('h2', null, 'Starts in ' + -pos.diff + (pos.diff === -1 ? ' day' : ' days')),
        h('p', { class: 'hint' }, 'Week 1 begins ' + fmtDate(pos.st, { weekday: 'long', day: 'numeric', month: 'long' }) + '.'));
    }
    if (list.length) {
      card.append(h('h2', null, "Today's session"));
      list.forEach((se) => card.append(sessionRow(se)));
    } else if (pos.kind === 'active') {
      card.append(h('h2', null, 'Rest day'));
    }
    const next = SESSIONS.find((se) => sessStart(se, pos.st) > todayUTC());
    if (next) {
      card.append(h('p', { class: 'hint' }, 'Next: ' + whenLabel(next) + ' – ' + next.title + ' (' + fmtKm(next.km) + ' km)'));
    }
  }
  box.append(card);
}

function renderPlan() {
  const pos = position();
  const cur = pos.kind === 'active' ? pos.week : null;
  const wrap = $('#weeks');
  wrap.replaceChildren();
  for (let w = 1; w <= 12; w++) {
    const list = SESSIONS.filter((se) => se.week === w);
    const planned = list.reduce((a, se) => a + se.km, 0);
    const doneKm = list.reduce((a, se) => a + effKm(se), 0);
    const n = list.filter((se) => state.done[se.id]).length;
    const det = h('details', { class: 'week' + (cur === w ? ' current' : '') });
    if (openWeeks.has(w)) det.open = true;
    det.addEventListener('toggle', () => { if (det.open) openWeeks.add(w); else openWeeks.delete(w); });
    let range = '';
    if (pos.st !== undefined) {
      const a = pos.st + (w - 1) * 7 * DAY_MS;
      range = fmtDate(a, { day: 'numeric', month: 'short' }) + ' – ' + fmtDate(a + 6 * DAY_MS, { day: 'numeric', month: 'short' });
    }
    det.append(h('summary', null,
      h('div', null,
        h('div', { class: 'wtitle' }, 'Week ' + w, cur === w ? h('span', { class: 'badge' }, 'Current') : null),
        range ? h('div', { class: 'wsub' }, range) : null),
      h('div', { class: 'wright' }, h('div', null, n + '/' + list.length + ' done'), h('div', null, fmtKm(doneKm) + ' / ' + fmtKm(planned) + ' km'))));
    list.forEach((se) => det.append(sessionRow(se)));
    wrap.append(det);
  }
}

/* ================= Progress view ================= */
function renderProgress() {
  const box = $('#progress');
  box.replaceChildren();
  const weekPlanned = [], weekDone = [];
  for (let w = 1; w <= 12; w++) {
    const list = SESSIONS.filter((se) => se.week === w);
    weekPlanned.push(list.reduce((a, se) => a + se.km, 0));
    weekDone.push(list.reduce((a, se) => a + effKm(se), 0));
  }
  const doneTotal = weekDone.reduce((a, b) => a + b, 0);
  const sessDone = SESSIONS.filter((se) => state.done[se.id]).length;
  const pct = Math.round((doneTotal / TOTAL_PLANNED) * 100);
  const pos = position();
  const cur = pos.kind === 'active' ? pos.week : null;

  box.append(h('div', { class: 'card' },
    h('h2', null, 'Overall'),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, fmtKm(doneTotal)), h('span', null, 'km done')),
      h('div', { class: 'stat' }, h('b', null, fmtKm(TOTAL_PLANNED)), h('span', null, 'km planned')),
      h('div', { class: 'stat' }, h('b', null, pct + '%'), h('span', null, 'of plan')),
      h('div', { class: 'stat' }, h('b', null, sessDone + '/' + SESSIONS.length), h('span', null, 'sessions done')))));

  const maxKm = Math.max(1, ...weekPlanned, ...weekDone);
  const rowH = 28, x0 = 34, bw = 210;
  const svg = s('svg', { class: 'chart', viewBox: '0 0 360 ' + (12 * rowH + 4), role: 'img', 'aria-label': 'Kilometres done versus planned per week' });
  for (let i = 0; i < 12; i++) {
    const y = i * rowH + 4;
    const g = s('g');
    g.append(s('title', {}, 'Week ' + (i + 1) + ': ' + fmtKm(weekDone[i]) + ' km done of ' + fmtKm(weekPlanned[i]) + ' km planned'));
    g.append(s('text', { x: 0, y: y + 15, class: 'lbl' + (cur === i + 1 ? ' cur' : '') }, 'W' + (i + 1)));
    g.append(s('rect', { x: x0, y: y + 3, width: Math.max(2, (bw * weekPlanned[i]) / maxKm), height: 16, rx: 4, class: 'track' }));
    if (weekDone[i] > 0) g.append(s('rect', { x: x0, y: y + 3, width: Math.max(2, (bw * weekDone[i]) / maxKm), height: 16, rx: 4, class: 'fill' }));
    g.append(s('text', { x: x0 + bw + 8, y: y + 15, class: 'lbl' }, fmtKm(weekDone[i]) + ' / ' + fmtKm(weekPlanned[i])));
    svg.append(g);
  }
  box.append(h('div', { class: 'card' },
    h('h2', null, 'Km per week'),
    svg,
    h('div', { class: 'legend' },
      h('span', null, h('i', { class: 'sw' }), 'Planned'),
      h('span', null, h('i', { class: 'sw d' }), 'Done (logged km if available)'))));
}

/* ================= Timer ================= */
function timerInfo(now) {
  const t = state.timer;
  if (!t.startTs) return null;
  const mode = MODES[t.mode];
  const done = t.loops.length;
  if (done >= mode.max) return { complete: true };
  const k = done + 1;
  const sched = t.startTs + done * mode.ms;
  const prevEnd = done ? t.loops[done - 1].end : 0;
  const start = Math.max(sched, prevEnd);
  const resting = now < start;
  const hasNext = resting || k < mode.max;
  const nextIdx = resting ? k : k + 1;
  const nextStart = hasNext ? t.startTs + (nextIdx - 1) * mode.ms : null;
  return { complete: false, k, start, resting, nextStart, nextIdx };
}

function updateTimerLive() {
  const now = Date.now();
  const info = timerInfo(now);
  const idle = !info;
  $('#timerIdle').hidden = !idle;
  $('#timerRun').hidden = idle;
  if (idle) return;
  const four = state.timer.mode === 'four';
  $('#timerUndo').hidden = state.timer.loops.length === 0;

  if (info.complete) {
    const last = state.timer.loops[state.timer.loops.length - 1];
    $('#tState').textContent = 'COMPLETE';
    $('#tLoop').textContent = 'All ' + state.timer.loops.length + ' loops done';
    $('#tElapsed').textContent = fmtClock((last.end - state.timer.startTs) / 1000);
    $('#tCountLabel').textContent = 'Total event time';
    $('#tCountdown').textContent = fmtKm(state.timer.loops.length * LOOP_KM) + ' km';
    $('#tCountdown').className = 'big2';
    $('#tNextAt').textContent = '';
    $('#tWarn').hidden = true;
    $('#timerFinish').disabled = true;
    return;
  }

  $('#tLoop').textContent = 'Loop ' + info.k + (four ? ' of 12' : '');
  $('#tState').textContent = info.resting ? 'REST' : 'RUNNING';
  $('#tState').className = 'badge' + (info.resting ? ' rest' : '');
  const elapsed = (now - info.start) / 1000;
  $('#tElapsed').textContent = info.resting ? '—' : fmtClock(elapsed);
  $('#timerFinish').disabled = info.resting;

  const cd = $('#tCountdown');
  if (info.nextStart === null) {
    $('#tCountLabel').textContent = 'Last loop';
    cd.textContent = '—';
    cd.className = 'big2';
    $('#tNextAt').textContent = '';
  } else {
    const diff = (info.nextStart - now) / 1000;
    $('#tCountLabel').textContent = info.resting ? 'Loop ' + info.k + ' starts in' : 'Next loop starts in';
    cd.textContent = diff >= 0 ? fmtClock(diff) : '+' + fmtClock(-diff);
    cd.className = 'big2' + (diff < 0 ? ' late' : '');
    $('#tNextAt').textContent = 'Loop ' + info.nextIdx + ' starts ' + fmtWhen(info.nextStart);
  }
  const warn = $('#tWarn');
  if (!four && !info.resting && elapsed > 3600) {
    warn.textContent = 'Over 60 minutes! In a backyard ultra you would be out.';
    warn.hidden = false;
  } else warn.hidden = true;
}

function renderTimer() {
  const t = state.timer;
  document.querySelectorAll('[data-mode]').forEach((b) => {
    const on = b.dataset.mode === t.mode;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', String(on));
    b.disabled = !!t.startTs;
  });
  $('#modeHint').hidden = !t.startTs;

  const list = $('#loopList');
  list.replaceChildren();
  const loops = t.loops;
  if (!loops.length) {
    $('#loopSummary').textContent = 'No loops saved yet. Tap "Finished loop" after each loop.';
    return;
  }
  const total = loops.reduce((a, l) => a + (l.end - l.start) / 1000, 0);
  const avg = total / loops.length;
  $('#loopSummary').textContent = loops.length + (loops.length === 1 ? ' loop · ' : ' loops · ') + fmtKm(loops.length * LOOP_KM) + ' km · avg ' + fmtClock(avg) + ' (' + fmtPace(avg / LOOP_KM) + ' /km)';
  for (let i = loops.length - 1; i >= 0; i--) {
    const dur = (loops[i].end - loops[i].start) / 1000;
    const li = h('li', null,
      h('span', null, 'Loop ' + loops[i].n),
      h('span', null, fmtClock(dur)),
      h('span', null, fmtPace(dur / LOOP_KM) + ' /km'));
    if (t.mode === 'hourly' && dur > 3600) li.append(h('span', { class: 'w' }, '⚠ Over 60 min'));
    list.append(li);
  }
}

function startTimer() {
  unlockAudio();
  const err = $('#timerErr');
  err.textContent = '';
  const v = $('#timerStartAt').value.trim();
  let ts = Date.now();
  if (v) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2})?$/.exec(v);
    if (!m) { err.textContent = 'Enter a valid date and time.'; return; }
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    ts = d.getTime();
    if (!Number.isFinite(ts) || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) { err.textContent = 'Enter a valid date and time.'; return; }
    if (ts < Date.now() - 7 * DAY_MS || ts > Date.now() + 30 * DAY_MS) { err.textContent = 'Start must be within the last 7 days or next 30 days.'; return; }
  }
  state.timer.startTs = ts;
  state.timer.loops = [];
  state.timer.alerts = {};
  save();
  renderTimer();
  updateTimerLive();
  syncWake();
}

function finishLoop() {
  unlockAudio();
  const now = Date.now();
  const info = timerInfo(now);
  if (!info || info.complete || info.resting) return;
  if (now - info.start < 5000 || state.timer.loops.length >= MAX_LOOPS) return; // ignore double taps
  state.timer.loops.push({ n: info.k, start: info.start, end: now });
  state.timer.alerts = {};
  save();
  const dur = (now - info.start) / 1000;
  showBanner('Loop ' + info.k + ' saved: ' + fmtClock(dur) + ' (' + fmtPace(dur / LOOP_KM) + ' /km)', 'alert');
  renderTimer();
  updateTimerLive();
  syncWake();
}

function checkAlerts() {
  const now = Date.now();
  const info = timerInfo(now);
  if (!info || info.complete || info.nextStart === null) return;
  const rem = (info.nextStart - now) / 1000;
  const a = state.timer.alerts;
  const k10 = info.nextIdx + '-10', k1 = info.nextIdx + '-1';
  if (rem <= 60 && rem > 0 && !a[k1]) { a[k1] = true; a[k10] = true; save(); fireAlert(1); }
  else if (rem <= 600 && rem > 300 && !a[k10]) { a[k10] = true; save(); fireAlert(10); }
}

/* ================= Settings / backup ================= */
function renderSettings() {
  const st = $('#startDateMount');
  st.replaceChildren(startDateForm());
  $('#paceMin').value = fmtPace(state.settings.paceMin);
  $('#paceMax').value = fmtPace(state.settings.paceMax);
  $('#optSound').checked = state.settings.sound;
  $('#optVibrate').checked = state.settings.vibrate;
  $('#optWake').checked = state.settings.wake;
}

const exportJSON = () => JSON.stringify({ app: 'g48-pwa', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2);
const dataMsg = (m) => { $('#dataMsg').textContent = m; };

async function doExport() {
  const text = exportJSON();
  const name = '4x4x48-backup-' + isoFromUTC(todayUTC()) + '.json';
  const blob = new Blob([text], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '4x4x48 backup' });
      dataMsg('Backup shared.');
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  dataMsg('Backup downloaded.');
}

async function importText(text) {
  if (typeof text !== 'string' || text.length === 0) { dataMsg('Nothing to import.'); return; }
  if (text.length > MAX_IMPORT_BYTES) { dataMsg('File too large (max 1 MB).'); return; }
  let obj;
  try { obj = JSON.parse(text); } catch (e) { dataMsg('That is not valid JSON.'); return; }
  const raw = isObj(obj) && obj.app === 'g48-pwa' && isObj(obj.data) ? obj.data : obj;
  const known = ['startDate', 'done', 'logs', 'settings', 'timer'];
  if (!isObj(raw) || !known.some((k) => own(raw, k))) { dataMsg('That does not look like a 4x4x48 backup.'); return; }
  const clean = sanitize(raw);
  if (!(await confirmAction('Replace ALL current data with this backup?', 'Import'))) { dataMsg('Import cancelled.'); return; }
  state = clean;
  save();
  renderAll();
  syncWake();
  dataMsg('Backup imported.');
}

async function resetAll() {
  if (!(await confirmAction('Delete ALL progress, logs, loop times and settings? This cannot be undone.', 'Delete everything'))) return;
  try { localStorage.removeItem(KEY); localStorage.removeItem(KEY + '.bak'); } catch (e) { /* ignore */ }
  state = defaults();
  openLogs.clear();
  renderAll();
  syncWake();
  dataMsg('All data deleted.');
}

function wireSettings() {
  $('#paceSave').addEventListener('click', () => {
    const a = parsePace($('#paceMin').value.trim()), b = parsePace($('#paceMax').value.trim());
    const msg = $('#paceMsg');
    if (a === null || b === null) { msg.textContent = 'Use m:ss between 3:00 and 15:00 (e.g. 7:00).'; return; }
    if (a >= b) { msg.textContent = 'The first pace must be faster (lower) than the second.'; return; }
    state.settings.paceMin = a;
    state.settings.paceMax = b;
    msg.textContent = '';
    save();
    renderAll();
  });
  const bind = (id, key) => $(id).addEventListener('change', (e) => {
    state.settings[key] = e.target.checked;
    if (key === 'sound') unlockAudio();
    save();
    syncWake();
  });
  bind('#optSound', 'sound'); bind('#optVibrate', 'vibrate'); bind('#optWake', 'wake');
  $('#testAlert').addEventListener('click', () => { unlockAudio(); fireAlert(1); });
  $('#exportBtn').addEventListener('click', doExport);
  $('#copyBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(exportJSON()); dataMsg('Backup copied to clipboard.'); } catch (e) { dataMsg('Copy failed. Use Export instead.'); }
  });
  $('#importFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    if (f.size > MAX_IMPORT_BYTES) { dataMsg('File too large (max 1 MB).'); return; }
    const fr = new FileReader();
    fr.onload = () => importText(typeof fr.result === 'string' ? fr.result : '');
    fr.onerror = () => dataMsg('Could not read that file.');
    fr.readAsText(f);
  });
  $('#importBtn').addEventListener('click', () => { const v = $('#importText').value; $('#importText').value = ''; importText(v); });
  $('#resetBtn').addEventListener('click', resetAll);
}

/* ================= Views, tick, init ================= */
const VIEWS = ['plan', 'timer', 'progress', 'settings'];
function setView(v) {
  if (!VIEWS.includes(v)) return;
  VIEWS.forEach((n) => { $('#view-' + n).hidden = n !== v; });
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b.dataset.view === v) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  window.scrollTo(0, 0);
}

function renderChip() {
  const pos = position();
  let t = '';
  if (pos.kind === 'active') t = 'Week ' + pos.week + ' · ' + DAYS[pos.day];
  else if (pos.kind === 'before') t = 'Starts in ' + -pos.diff + 'd';
  else if (pos.kind === 'after') t = 'Plan done';
  $('#weekChip').textContent = t;
}

function renderAll() {
  renderChip();
  renderToday();
  renderPlan();
  renderProgress();
  renderSettings();
  renderTimer();
  updateTimerLive();
}

let lastDay = 0;
function tick() {
  const d = todayUTC();
  if (d !== lastDay) { lastDay = d; renderAll(); }
  updateTimerLive();
  checkAlerts();
}

function init() {
  state = load();
  const pos = position();
  openWeeks.add(pos.kind === 'active' ? pos.week : pos.kind === 'after' ? 12 : 1);
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
    if (state.timer.startTs) return;
    state.timer.mode = b.dataset.mode === 'four' ? 'four' : 'hourly';
    save();
    renderTimer();
  }));
  $('#timerStart').addEventListener('click', startTimer);
  $('#timerFinish').addEventListener('click', finishLoop);
  $('#timerUndo').addEventListener('click', () => { state.timer.loops.pop(); state.timer.alerts = {}; save(); renderTimer(); updateTimerLive(); });
  $('#timerStop').addEventListener('click', async () => {
    if (!(await confirmAction('Stop the timer and delete the saved loop times?', 'Stop & clear'))) return;
    state.timer.startTs = null;
    state.timer.loops = [];
    state.timer.alerts = {};
    save();
    renderTimer();
    updateTimerLive();
    syncWake();
  });
  $('#confirmOk').addEventListener('click', () => $('#confirmDlg').close('ok'));
  $('#confirmCancel').addEventListener('click', () => $('#confirmDlg').close('cancel'));
  $('#banner').addEventListener('click', () => { $('#banner').hidden = true; });
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  wireSettings();
  setView('plan');
  lastDay = todayUTC();
  renderAll();
  if (!storageOk) showBanner('Browser storage is blocked: progress will not be saved.', 'warn');
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { tick(); syncWake(); });
  window.addEventListener('pageshow', tick);
  syncWake();
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('service-worker.js').catch(() => {}); });
  }
}
init();
})();
