'use strict';

/* ================= Définitions ================= */

const FIELDS = {
  prepare:   { label: 'Préparation', type: 'time', min: 0, max: 300 },
  work:      { label: 'Effort', type: 'time', min: 5, max: 3600 },
  rest:      { label: 'Repos', type: 'time', min: 0, max: 3600 },
  rounds:    { label: 'Rounds', type: 'count', min: 1, max: 99 },
  sets:      { label: 'Séries', type: 'count', min: 1, max: 20 },
  setRest:   { label: 'Repos entre séries', type: 'time', min: 0, max: 900 },
  interval:  { label: 'Toutes les', type: 'time', min: 10, max: 900 },
  duration:  { label: 'Durée', type: 'time', min: 10, max: 7200 },
  cap:       { label: 'Time cap', hint: '0 = sans limite', type: 'time', min: 0, max: 7200 },
  roundRest: { label: 'Repos entre tours', type: 'time', min: 0, max: 900 },
  cooldown:  { label: 'Retour au calme', type: 'time', min: 0, max: 1800 },
};

const INTERVAL_FIELDS = ['prepare', 'work', 'rest', 'rounds', 'sets', 'setRest', 'cooldown'];

const MODES = {
  tabata: {
    name: 'Tabata', icon: '🔥', color: '#ef4444', desc: '20 s / 10 s · 4 × 4',
    long: '4 séries de 4 rounds : 20 s d’effort maximal, 10 s de repos, 1 min de récupération entre les séries.',
    fields: INTERVAL_FIELDS,
    defaults: { prepare: 10, work: 20, rest: 10, rounds: 4, sets: 4, setRest: 60, cooldown: 0 },
  },
  hiit: {
    name: 'HIIT', icon: '⚡', color: '#f97316', desc: 'Intervalles effort / repos',
    long: 'Alternez effort et repos, en rounds et en séries.',
    fields: INTERVAL_FIELDS,
    defaults: { prepare: 10, work: 20, rest: 10, rounds: 4, sets: 4, setRest: 90, cooldown: 0 },
  },
  emom: {
    name: 'EMOM', icon: '⏱️', color: '#eab308', desc: 'Every Minute On the Minute',
    long: 'Démarrez l’exercice au début de chaque intervalle ; le temps restant sert de repos.',
    fields: ['prepare', 'interval', 'rounds'],
    defaults: { prepare: 10, interval: 60, rounds: 10 },
  },
  amrap: {
    name: 'AMRAP', icon: '🔁', color: '#22c55e', desc: 'Max de tours dans le temps',
    long: 'As Many Rounds As Possible : enchaînez un maximum de tours. Comptez-les d’un tap.',
    fields: ['prepare', 'duration'],
    defaults: { prepare: 10, duration: 720 },
  },
  fortime: {
    name: 'For Time', icon: '🏁', color: '#3b82f6', desc: 'Chrono avec time cap',
    long: 'Terminez le travail le plus vite possible et enregistrez vos temps de passage.',
    fields: ['prepare', 'cap'],
    defaults: { prepare: 10, cap: 0 },
  },
  circuit: {
    name: 'Circuit', icon: '🏋️', color: '#a855f7', desc: 'Vos exercices, enchaînés',
    long: 'Composez votre enchaînement : chaque exercice est annoncé à voix haute.',
    fields: ['prepare', 'rounds', 'roundRest', 'cooldown'],
    labels: { rounds: 'Tours' },
    steps: true,
    defaults: {
      prepare: 10, rounds: 3, roundRest: 60, cooldown: 0,
      steps: [
        { kind: 'work', name: 'Jumping jacks', dur: 30 },
        { kind: 'rest', name: 'Repos', dur: 10 },
        { kind: 'work', name: 'Pompes', dur: 30 },
        { kind: 'rest', name: 'Repos', dur: 10 },
        { kind: 'work', name: 'Squats', dur: 30 },
        { kind: 'rest', name: 'Repos', dur: 10 },
        { kind: 'work', name: 'Gainage', dur: 30 },
      ],
    },
  },
  countdown: {
    name: 'Minuteur', icon: '⏳', color: '#14b8a6', desc: 'Compte à rebours simple',
    long: 'Un simple compte à rebours, avec bips sur les dernières secondes.',
    fields: ['duration'],
    defaults: { duration: 300 },
  },
};

const PHASES = {
  prepare:  { label: 'Préparation', color: '#f59e0b' },
  work:     { label: 'Effort', color: '#ef4444' },
  rest:     { label: 'Repos', color: '#16a34a' },
  setRest:  { label: 'Récupération', color: '#2563eb' },
  cooldown: { label: 'Retour au calme', color: '#7c3aed' },
};

const RING_C = 2 * Math.PI * 90;

// Derniers réglages de chaque mode. Clé changée (« last2_ ») quand les valeurs par défaut changent, pour qu'elles s'appliquent.
const LAST_KEY = 'last2_';

// Séances gardées dans le calendrier (environ 1 Ko chacune).
const MAX_SESSIONS = 3000;

/* ================= Utilitaires ================= */

const $ = (sel) => document.querySelector(sel);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const clone = (o) => JSON.parse(JSON.stringify(o));
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmt(sec) {
  sec = Math.max(0, sec);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function fmtField(f, v) {
  if (FIELDS[f].type === 'count') return String(v);
  if (f === 'cap' && v === 0) return 'Aucun';
  return fmt(v);
}

function fmtTotal(sec) {
  if (!isFinite(sec)) return 'Illimitée';
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m >= 60) return `${Math.floor(m / 60)} h ${pad(m % 60)}`;
  return s ? `${m} min ${pad(s)}` : `${m} min`;
}

// Pas adaptatif : 5 s sous la minute, puis 15 s, 30 s, 1 min.
const stepFor = (v) => (v < 60 ? 5 : v < 300 ? 15 : v < 1200 ? 30 : 60);
function nextValue(v, dir, type) {
  if (type === 'count') return v + dir;
  return dir > 0 ? v + stepFor(v) : v - stepFor(v - 1);
}

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ================= Journal des erreurs ================= */

// Plantages envoyés au site d'information (page /admin de l'organisateur) : message, écran et type d'appareil seulement.
const APP_VERSION = '1.5';
const SITE = 'https://sport-timer-2iv.pages.dev';

function deviceId() {
  let id = store.get('device', '');
  if (!/^[0-9a-f]{16}$/.test(id)) {
    id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
    store.set('device', id);
  }
  return id;
}

function platformName() {
  const ua = navigator.userAgent;
  const os = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone'
    : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'Mac' : 'autre';
  const nav = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'autre';
  return `Web · ${os} · ${nav}${matchMedia('(display-mode: standalone)').matches ? ' · écran d’accueil' : ''}`;
}

// La même erreur au plus une fois par heure, 20 au plus par jour (pas d'avalanche).
function report(type, message) {
  message = String(message ?? '').trim().slice(0, 500);
  if (!message || !navigator.onLine || !location.protocol.startsWith('http')) return;
  const now = Date.now(), today = new Date().toISOString().slice(0, 10);
  let seen = store.get('reported', {});
  if (seen.day !== today) seen = { day: today, n: 0, last: {} };
  if (seen.n >= 20 || now - (seen.last[message] || 0) < 3600000) return;
  seen.n++;
  seen.last[message] = now;
  store.set('reported', seen);
  const screen = document.querySelector('.screen:not([hidden])')?.id ?? '';
  fetch(`${SITE}/api/journal`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ kind: 'error', device: deviceId(), platform: platformName(), version: APP_VERSION, type, message, screen }),
  }).catch(() => {});
}

// « Script error. » sans fichier : code venu d'ailleurs (extension, traduction du navigateur), ignoré.
window.addEventListener('error', (e) => {
  if (!e.filename || !e.filename.startsWith(location.origin)) return;
  report('plantage', `${e.message} (${e.filename.split('/').pop()}:${e.lineno}:${e.colno})`);
});
window.addEventListener('unhandledrejection', (e) => report('plantage', e.reason?.message ?? String(e.reason)));

/* ================= État ================= */

const settings = { sound: true, voice: true, vibrate: true, notify: false, volume: 1, ...store.get('settings', {}) };
let favorites = store.get('favorites', []);
let sessions = store.get('sessions', []);
let current = null; // { mode, cfg, name }
let run = null;
let muted = false;

/* ================= Construction des intervalles ================= */

function buildSegments(mode, c) {
  const segs = [];
  const add = (kind, dur, extra = {}) => { if (dur > 0) segs.push({ kind, dur, ...extra }); };
  const color = MODES[mode].color;

  add('prepare', c.prepare || 0, { say: 'Préparez-vous' });

  switch (mode) {
    case 'tabata':
    case 'hiit':
      for (let s = 1; s <= c.sets; s++) {
        for (let r = 1; r <= c.rounds; r++) {
          const info = { round: r, rounds: c.rounds, set: s, sets: c.sets };
          const last = s === c.sets && r === c.rounds;
          add('work', c.work, { ...info, say: last ? 'Dernier round !' : `Round ${r}` });
          if (r < c.rounds) add('rest', c.rest, { ...info, say: 'Repos' });
        }
        if (s < c.sets) add('setRest', c.setRest, { set: s, sets: c.sets, say: `Fin de la série ${s}. Récupération` });
      }
      break;

    case 'emom':
      for (let r = 1; r <= c.rounds; r++) {
        const label = c.interval === 60 ? `Minute ${r}` : `Intervalle ${r}`;
        add('work', c.interval, { label, color, round: r, rounds: c.rounds, say: r === c.rounds ? `${label}, la dernière !` : label });
      }
      break;

    case 'amrap':
      add('work', c.duration, { label: 'AMRAP', color, reps: true, say: 'C’est parti !' });
      break;

    case 'fortime':
      segs.push({ kind: 'work', dur: c.cap > 0 ? c.cap : Infinity, countUp: true, laps: true, label: 'For Time', color, say: 'C’est parti !' });
      break;

    case 'countdown':
      add('work', c.duration, { label: 'Minuteur', color });
      break;

    case 'circuit': {
      const steps = (c.steps || []).filter((st) => st.dur > 0);
      for (let r = 1; r <= c.rounds; r++) {
        steps.forEach((st, i) => {
          const label = st.name.trim() || PHASES[st.kind].label;
          add(st.kind, st.dur, { label, round: r, rounds: c.rounds, step: i + 1, steps: steps.length, say: label });
        });
        if (r < c.rounds && c.roundRest > 0) {
          if (segs.at(-1)?.kind === 'rest') segs.pop();
          add('setRest', c.roundRest, { label: 'Repos entre tours', round: r, rounds: c.rounds, say: `Fin du tour ${r}. Récupération` });
        }
      }
      // Pas de repos inutile en fin de séance.
      while (segs.length && (segs.at(-1).kind === 'rest' || segs.at(-1).kind === 'setRest')) segs.pop();
      break;
    }
  }

  if (!segs.some((s) => s.kind === 'work')) return [];
  add('cooldown', c.cooldown || 0, { say: 'Retour au calme' });
  return segs;
}

const totalOf = (segs) => segs.reduce((a, s) => a + s.dur, 0);

/* ================= Son, voix, vibrations ================= */

let audioCtx = null;
let frVoice = null;

function initAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
  // Débloque la synthèse vocale sur iOS (doit partir d'un geste utilisateur).
  if ('speechSynthesis' in window && settings.voice) {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  }
}

function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const voices = speechSynthesis.getVoices();
  frVoice = voices.find((v) => v.lang === 'fr-FR' && v.localService) || voices.find((v) => v.lang.startsWith('fr')) || null;
}
if ('speechSynthesis' in window) {
  pickVoice();
  speechSynthesis.onvoiceschanged = pickVoice;
}

function beep(freq = 880, dur = 0.15, when = 0, vol = 0.6) {
  if (!settings.sound || muted || !audioCtx) return;
  const t = audioCtx.currentTime + when;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol * settings.volume, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function speak(text) {
  // Voix impossible en arrière-plan : les phrases s'accumuleraient et sortiraient toutes au retour.
  if (!settings.voice || muted || !text || document.hidden || !('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'fr-FR';
  if (frVoice) u.voice = frVoice;
  u.rate = 1.05;
  u.volume = settings.volume;
  speechSynthesis.speak(u);
}

function buzz(pattern) {
  if (settings.vibrate && navigator.vibrate) navigator.vibrate(pattern);
}

/* ================= Piste audio de la séance ================= */
// Les téléphones suspendent le JavaScript quand on quitte l'appli ou verrouille l'écran : tous les bips
// de la séance sont donc pré-enregistrés dans une piste audio (WAV) lue comme une musique, qui continue
// en arrière-plan. Le timer se recale sur la piste au retour dans l'appli.

const TRACK_RATE = 8000;  // 8 kHz, 8 bits mono : ~0,5 Mo par minute
const TRACK_MAX = 7200;   // au-delà de 2 h, les bips repassent par le Web Audio (appli ouverte seulement)
const trackEl = new Audio();
trackEl.preload = 'auto';

function tone(data, at, freq, dur, vol = 0.85) {
  const start = Math.round(at * TRACK_RATE), n = Math.round(dur * TRACK_RATE);
  for (let i = 0; i < n && start + i < data.length; i++) {
    const t = i / TRACK_RATE;
    const env = Math.min(1, t / 0.01) * Math.pow(0.001, t / dur);
    const v = data[start + i] - 128 + 127 * vol * env * Math.sin(2 * Math.PI * freq * t);
    data[start + i] = clamp(Math.round(v + 128), 0, 255);
  }
}

function buildTrack(segs, before, total) {
  const length = Math.min(isFinite(total) ? total : before.at(-1), TRACK_MAX);
  const samples = Math.ceil((length + 2) * TRACK_RATE);
  const buf = new Uint8Array(44 + samples);
  const data = buf.subarray(44);
  data.fill(128);

  segs.forEach((s, i) => {
    const T = before[i];
    // Volume de l'appli appliqué dans la piste elle-même (iPhone ignore le volume d'un <audio>).
    const vol = 0.85 * settings.volume;
    if (s.kind === 'work') tone(data, T, 1175, 0.5, vol); else tone(data, T, 660, 0.5, vol);
    if (isFinite(s.dur)) for (let k = 1; k <= 3 && k < s.dur; k++) tone(data, T + s.dur - k, 880, 0.12, vol);
  });
  if (isFinite(total) && total <= TRACK_MAX) {
    const vol = 0.85 * settings.volume;
    tone(data, total, 1046, 0.18, vol); tone(data, total + 0.2, 1318, 0.18, vol); tone(data, total + 0.4, 1568, 0.6, vol);
  }

  // En-tête WAV (PCM 8 bits mono)
  const v = new DataView(buf.buffer);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + samples, true); str(8, 'WAVE');
  str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, TRACK_RATE, true); v.setUint32(28, TRACK_RATE, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  str(36, 'data'); v.setUint32(40, samples, true);

  return { url: URL.createObjectURL(new Blob([buf], { type: 'audio/wav' })), length };
}

const planTime = () => run.before[run.idx] + Math.min(segElapsed(), cur().dur);
const trackCovers = (t) => !!run.track && t < run.track.length;

function syncTrack() {
  if (!run?.track) return;
  const t = planTime();
  if (!trackCovers(t)) { trackEl.pause(); return; }
  trackEl.currentTime = t;
  if (run.paused) trackEl.pause();
  else trackEl.play().catch(() => {});
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
    try { navigator.mediaSession.setPositionState({ duration: run.track.length + 2, position: t, playbackRate: 1 }); } catch {}
  }
}

// Au retour dans l'appli : la piste a continué (ou a été interrompue, par un appel par exemple), on s'y recale.
function syncFromTrack() {
  if (!run || run.finished || !run.track || trackEl.ended) return;
  const t = trackEl.currentTime;
  if (t >= run.track.length) return;
  const i = run.segs.findIndex((s, k) => t < run.before[k] + s.dur);
  if (i < 0) return;
  const el = t - run.before[i];
  const now = performance.now();
  if (i > run.idx) for (let k = run.idx; k < i; k++) credit(k, Infinity);
  if (i !== run.idx) enterSegment(i, now, false);
  run.startedAt = now - el * 1000;
  if (run.paused) run.pauseElapsed = el;
  else if (trackEl.paused) pause();
  draw();
}

trackEl.addEventListener('pause', () => {
  // Pause imposée par le téléphone (appel, autre appli audio) pendant que l'appli est en arrière-plan.
  if (!run || run.finished || run.paused || trackEl.ended || !document.hidden) return;
  if (performance.now() - run.trackSetAt < 1000) return;
  pause();
});

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const on = (action, fn) => { try { ms.setActionHandler(action, fn); } catch {} };
  on('play', () => { if (run && !run.finished) resume(); });
  on('pause', () => { if (run && !run.finished) pause(); });
  on('nexttrack', () => actions.next());
  on('previoustrack', () => actions.prev());
}

/* ================= Notifications ================= */

const NOTIF_TAG = 'sport-timer';

function notify(title, body) {
  if (!settings.notify || !document.hidden || !('Notification' in window) || Notification.permission !== 'granted') return;
  navigator.serviceWorker?.ready
    .then((reg) => reg.showNotification(title, { body, tag: NOTIF_TAG, renotify: true, silent: !!run?.track, icon: 'icon.svg', badge: 'icon.svg' }))
    .catch(() => {});
}

function clearNotifications() {
  navigator.serviceWorker?.getRegistration()
    .then((reg) => reg?.getNotifications({ tag: NOTIF_TAG }))
    .then((list) => list?.forEach((n) => n.close()))
    .catch(() => {});
}

/* ================= Wake lock (écran allumé) ================= */

let wakeLock = null;
async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  clearNotifications();
  if (run && !run.finished) {
    requestWakeLock();
    syncFromTrack();
  }
});

/* ================= Écrans ================= */

function show(id) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });
  window.scrollTo(0, 0);
  if (id !== 'run') document.title = 'Sport Timer';
}

function renderHome() {
  $('#modes').innerHTML = Object.entries(MODES).map(([key, m]) => `
    <button class="mode-card" data-mode="${key}" style="--c:${m.color}">
      <span class="mode-icon">${m.icon}</span>
      <span class="mode-name">${m.name}</span>
      <span class="mode-desc">${m.desc}</span>
    </button>`).join('');

  $('#favs').innerHTML = favorites.length
    ? favorites.map((f) => `
      <div class="item">
        <span class="item-icon">${MODES[f.mode].icon}</span>
        <button class="item-main" data-fav-open="${f.id}">
          <div class="item-title">${esc(f.name)}</div>
          <div class="item-sub">${MODES[f.mode].name} · ${fmtTotal(totalOf(buildSegments(f.mode, f.cfg)))}</div>
        </button>
        <button class="icon-btn" data-fav-del="${f.id}" aria-label="Supprimer">✕</button>
        <button class="icon-btn go" data-fav-start="${f.id}" aria-label="Démarrer">▶</button>
      </div>`).join('')
    : '<div class="empty">Configurez une séance puis enregistrez-la ici.</div>';

  renderWeek();
  $('#history').innerHTML = sessions.length
    ? sessions.slice(0, 5).map(sessionItem).join('')
    : '<div class="empty">Aucune séance pour l’instant. Chaque séance terminée s’inscrit dans le calendrier.</div>';

  document.querySelectorAll('[data-setting]').forEach((el) => { el.checked = settings[el.dataset.setting]; });
  $('#volume').value = Math.round(settings.volume * 100);
  $('#volume-value').textContent = Math.round(settings.volume * 100) + ' %';
}

/* ================= Calendrier ================= */

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const FEELS = ['Facile', 'Modérée', 'Difficile', 'Très dure', 'À fond'];
let calMonth = null;   // 1er jour du mois affiché
let calDay = null;     // jour choisi (« 2026-10-27 »)
let viewing = null;    // séance ouverte en détail
let viewingFrom = 'calendar';
let confirmUntil = 0;  // double appui pour les suppressions

const dayKey = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const keyDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const findSession = (id) => sessions.find((s) => String(s.date) === String(id));
const hhmm = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const plural = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
const fmtDur = (sec) => (sec < 60 ? `${sec} s` : fmtTotal(sec));

function byDay() {
  const map = {};
  for (const s of sessions) (map[dayKey(s.date)] ??= []).push(s);
  return map;
}

// Jours d'affilée avec au moins une séance, jusqu'à aujourd'hui (ou hier).
function streak(days) {
  const d = new Date();
  if (!days[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function weekStart(t = Date.now()) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function renderWeek() {
  const days = byDay(), start = weekStart(), today = dayKey(Date.now());
  const week = sessions.filter((s) => s.date >= start.getTime());
  const active = week.reduce((a, s) => a + (s.active || 0), 0);
  const cells = WEEKDAYS.map((w, i) => {
    const d = new Date(start); d.setDate(d.getDate() + i);
    const list = days[dayKey(d)] || [];
    const color = list.length ? MODES[list[0].mode]?.color ?? 'var(--muted)' : '';
    return `<span class="wk-day${dayKey(d) === today ? ' today' : ''}"><small>${w}</small><i${list.length ? ` class="on" style="--c:${color}"` : ''}></i></span>`;
  }).join('');
  const st = streak(days);
  $('#week').innerHTML = `
    <span class="wk-days">${cells}</span>
    <span class="wk-text"><b>${week.length ? `${plural(week.length, 'séance')} cette semaine` : 'Aucune séance cette semaine'}</b>
    <small>${week.length ? `${fmtDur(active)} d’activité · ` : ''}${st > 1 ? `${st} jours d’affilée · ` : ''}Calendrier ›</small></span>`;
}

function sessionItem(s) {
  const d = new Date(s.date);
  const when = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · ' + hhmm(s.date);
  const extra = s.reps != null ? ` · ${s.reps} rounds` : s.result != null ? ` · ${fmt(s.result)}` : '';
  const stopped = s.complete === false ? ` · <span class="warn">arrêtée à ${s.progress} %</span>` : '';
  return `
    <button class="item" data-session="${s.date}">
      <span class="item-icon">${MODES[s.mode]?.icon ?? '⏱️'}</span>
      <span class="item-main">
        <span class="item-title">${esc(s.name)}</span>
        <span class="item-sub">${when} · ${fmt(s.active)}${extra}${stopped}</span>
      </span>
      ${s.feel ? `<span class="feel-tag">${FEELS[s.feel - 1]}</span>` : ''}
      <span class="chev">›</span>
    </button>`;
}

function openCalendar(day = calDay || dayKey(Date.now())) {
  calDay = day;
  const d = keyDate(day);
  calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  renderCalendar();
  show('calendar');
}

function renderCalendar() {
  const days = byDay(), today = dayKey(Date.now());
  const y = calMonth.getFullYear(), m = calMonth.getMonth();
  const title = calMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  $('#month-title').textContent = title[0].toUpperCase() + title.slice(1);

  const offset = (calMonth.getDay() + 6) % 7, count = new Date(y, m + 1, 0).getDate();
  let html = '<span></span>'.repeat(offset);
  for (let n = 1; n <= count; n++) {
    const key = `${y}-${pad(m + 1)}-${pad(n)}`;
    const list = days[key] || [];
    const dots = [...new Set(list.map((s) => s.mode))].slice(0, 3)
      .map((mode) => `<i style="--c:${MODES[mode]?.color ?? '#8b93a3'}"></i>`).join('');
    const cls = ['cal-day', list.length && 'has', key === today && 'today', key === calDay && 'sel', key > today && 'future'].filter(Boolean).join(' ');
    html += `<button class="${cls}" data-day="${key}"><b>${n}</b><span class="dots">${dots}</span></button>`;
  }
  $('#cal-grid').innerHTML = html;

  const inMonth = sessions.filter((s) => { const d = new Date(s.date); return d.getFullYear() === y && d.getMonth() === m; });
  const active = inMonth.reduce((a, s) => a + (s.active || 0), 0);
  const work = inMonth.reduce((a, s) => a + (s.work || 0), 0);
  const activeDays = new Set(inMonth.map((s) => dayKey(s.date))).size;
  const stats = [[inMonth.length, inMonth.length > 1 ? 'Séances' : 'Séance'], [fmtDur(active), 'Temps actif'],
    [activeDays, activeDays > 1 ? 'Jours actifs' : 'Jour actif']];
  stats.push(work ? [fmtDur(work), 'Temps d’effort'] : [streak(days), 'Jours d’affilée (série en cours)']);
  $('#month-stats').innerHTML = statsHtml(stats);

  const dayTitle = keyDate(calDay).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  $('#day-title').textContent = calDay === today ? `Aujourd’hui · ${dayTitle}` : dayTitle;
  const list = days[calDay] || [];
  $('#day-list').innerHTML = list.length
    ? list.slice().reverse().map(sessionItem).join('')
    : `<div class="empty">${calDay > today ? 'Ce jour n’est pas encore passé.' : 'Aucune séance ce jour-là.'}</div>`;

  const clear = $('#clear-history');
  clear.hidden = !sessions.length;
  clear.textContent = 'Effacer tout l’historique';
}

/* ================= Détail d'une séance ================= */

const statsHtml = (stats) => stats.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');

function sessionStats(s) {
  const st = [[fmt(s.active), 'Durée active']];
  if (s.wall != null && s.wall - s.active >= 5) st.push([fmt(s.wall), 'Durée totale, pauses comprises']);
  if (s.work) st.push([fmt(s.work), 'Temps d’effort']);
  if (s.rest) st.push([fmt(s.rest), 'Temps de repos']);
  if (s.intervals) st.push([`${s.intervals.done}/${s.intervals.total}`, 'Intervalles d’effort']);
  if (s.reps != null) {
    st.push([s.reps, 'Rounds']);
    if (s.reps) st.push([fmt(Math.round((s.work || s.active) / s.reps)), 'Moyenne / round']);
  }
  if (s.result != null) st.push([fmt(s.result), s.capped ? 'Time cap atteint' : 'Temps final']);
  if (s.laps?.length) st.push([s.laps.length, s.laps.length > 1 ? 'Tours notés' : 'Tour noté']);
  if (s.complete === false && s.progress != null) st.push([`${s.progress} %`, 'De la séance prévue']);
  if (s.pauses) st.push([s.pauses, s.pauses > 1 ? 'Pauses' : 'Pause']);
  if (s.skipped) st.push([s.skipped, s.skipped > 1 ? 'Intervalles passés' : 'Intervalle passé']);
  return st;
}

function journalHtml(s) {
  return `
    <div class="journal" data-id="${s.date}">
      <h3>Ressenti</h3>
      <div class="feels">${FEELS.map((f, i) => `<button class="feel${s.feel === i + 1 ? ' on' : ''}" data-action="feel" data-v="${i + 1}"><b>${i + 1}</b><small>${f}</small></button>`).join('')}</div>
      <textarea class="session-note" maxlength="500" rows="3" placeholder="Une note : forme du jour, charges, douleurs, lieu…">${esc(s.note || '')}</textarea>
    </div>`;
}

function openSession(id, from) {
  const s = findSession(id);
  if (!s) return;
  viewing = s;
  viewingFrom = from;
  const m = MODES[s.mode] ?? { icon: '⏱️', name: s.mode, fields: [] };
  if (m.color) document.documentElement.style.setProperty('--accent', m.color);
  const d = new Date(s.date);
  const day = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const hours = s.end ? `${hhmm(s.date)} → ${hhmm(s.end)}` : hhmm(s.date);
  const status = s.complete === false
    ? `<span class="badge warn">Arrêtée avant la fin${s.progress != null ? ` · ${s.progress} %` : ''}</span>`
    : s.complete ? '<span class="badge ok">Séance terminée</span>' : '';
  const reached = [];
  if (s.complete === false && s.round) reached.push(`${s.mode === 'circuit' ? 'Tour' : s.mode === 'emom' ? 'Intervalle' : 'Round'} ${s.round}/${s.rounds}`);
  if (s.complete === false && s.sets > 1) reached.push(`série ${s.set}/${s.sets}`);

  let html = `
    <div class="session-head" style="--c:${m.color ?? 'var(--muted)'}">
      <span class="session-icon">${m.icon}</span>
      <div>
        <h2>${esc(s.name)}</h2>
        <p class="muted">${m.name !== s.name ? m.name + ' · ' : ''}${day[0].toUpperCase() + day.slice(1)}<br>${hours}</p>
        ${status}${reached.length ? `<p class="muted small">Arrivé à : ${reached.join(', ')}</p>` : ''}
      </div>
    </div>
    <div class="stats">${statsHtml(sessionStats(s))}</div>`;
  if (s.laps?.length) html += `<h3>Temps de passage</h3><ol class="laps card">${lapsHtml(s.laps)}</ol>`;

  if (s.cfg && m.fields.length) {
    const rows = m.fields.filter((f) => s.cfg[f] != null && !(f === 'setRest' && s.cfg.sets <= 1) && !(['prepare', 'cooldown', 'roundRest'].includes(f) && !s.cfg[f]))
      .map((f) => `<div class="field"><span class="field-label">${(m.labels && m.labels[f]) || FIELDS[f].label}</span><b>${fmtField(f, s.cfg[f])}</b></div>`);
    if (s.planned) rows.push(`<div class="field"><span class="field-label">Durée prévue</span><b>${fmtTotal(s.planned)}</b></div>`);
    html += `<h3>Réglages</h3><div class="card">${rows.join('')}</div>`;
    if (s.cfg.steps?.length) {
      html += `<h3>Enchaînement</h3><div class="card">${s.cfg.steps.map((st) => `
        <div class="field"><span class="field-label"><i class="dot-kind" data-kind="${st.kind}"></i>${esc(st.name.trim() || PHASES[st.kind].label)}</span><b>${fmt(st.dur)}</b></div>`).join('')}</div>`;
    }
  }
  html += journalHtml(s);
  $('#session-body').innerHTML = html;
  $('#session-del').textContent = 'Supprimer cette séance';
  confirmUntil = 0;
  show('session');
}

// Premier appui : demande de confirmation ; second appui dans les 4 s : on agit.
function confirmed(el, text) {
  if (Date.now() < confirmUntil) { confirmUntil = 0; return true; }
  confirmUntil = Date.now() + 4000;
  el.textContent = text;
  return false;
}

function saveSessions() { store.set('sessions', sessions); }

function openConfig(mode, cfg, name = '') {
  const m = MODES[mode];
  current = { mode, name, cfg: clone({ ...m.defaults, ...(cfg || store.get(LAST_KEY + mode, {})) }) };
  document.documentElement.style.setProperty('--accent', m.color);
  $('#config-title').textContent = `${m.icon} ${m.name}`;
  $('#config-desc').textContent = m.long;
  $('#fav-name').value = name;

  $('#fields').innerHTML = m.fields.map((f) => `
    <div class="field" data-row="${f}">
      <div class="field-label">${(m.labels && m.labels[f]) || FIELDS[f].label}${FIELDS[f].hint ? `<small>${FIELDS[f].hint}</small>` : ''}</div>
      <div class="stepper" data-f="${f}">
        <button data-d="-1" aria-label="Moins">−</button><output></output><button data-d="1" aria-label="Plus">+</button>
      </div>
    </div>`).join('');

  $('#steps-wrap').hidden = !m.steps;
  if (m.steps) renderSteps();
  updateConfig();
  show('config');
}

function renderSteps() {
  $('#steps').innerHTML = current.cfg.steps.map((st, i) => `
    <div class="step" data-kind="${st.kind}">
      <button class="kind" data-action="step-kind" data-i="${i}" aria-label="Changer effort / repos"></button>
      <input class="step-name" data-i="${i}" value="${esc(st.name)}" maxlength="30" placeholder="${PHASES[st.kind].label}">
      <div class="stepper" data-step="${i}">
        <button data-d="-1" aria-label="Moins">−</button><output></output><button data-d="1" aria-label="Plus">+</button>
      </div>
      <button class="icon-btn" data-action="step-del" data-i="${i}" aria-label="Supprimer">✕</button>
    </div>`).join('') || '<div class="field muted">Ajoutez au moins un exercice.</div>';
}

function updateConfig() {
  const c = current.cfg;
  document.querySelectorAll('#config .stepper').forEach((el) => {
    const out = el.querySelector('output');
    if (el.dataset.f) out.textContent = fmtField(el.dataset.f, c[el.dataset.f]);
    else out.textContent = fmt(c.steps[+el.dataset.step].dur);
  });
  const setRestRow = document.querySelector('[data-row="setRest"]');
  if (setRestRow) setRestRow.hidden = c.sets <= 1;

  const segs = buildSegments(current.mode, c);
  $('#config-total').textContent = segs.length ? fmtTotal(totalOf(segs)) : '—';
  $('#start-btn').disabled = !segs.length;
}

function bump(btn) {
  const stepper = btn.closest('.stepper');
  const dir = +btn.dataset.d;
  if (stepper.dataset.step != null) {
    const st = current.cfg.steps[+stepper.dataset.step];
    st.dur = clamp(nextValue(st.dur, dir, 'time'), 5, 3600);
  } else {
    const f = stepper.dataset.f, F = FIELDS[f];
    current.cfg[f] = clamp(nextValue(current.cfg[f], dir, F.type), F.min, F.max);
  }
  updateConfig();
}

/* ================= Moteur du timer ================= */

const cur = () => run.segs[run.idx];
const segElapsed = (now = performance.now()) => (run.paused ? run.pauseElapsed : (now - run.startedAt) / 1000);

function startRun() {
  const segs = buildSegments(current.mode, current.cfg);
  if (!segs.length) return;
  store.set(LAST_KEY + current.mode, current.cfg);
  initAudio();

  const before = [];
  segs.reduce((acc, s, i) => { before[i] = acc; return acc + s.dur; }, 0);

  const now = performance.now();
  run = {
    mode: current.mode,
    name: current.name || MODES[current.mode].name,
    cfg: clone(current.cfg), startDate: Date.now(),
    segs, before,
    total: totalOf(segs),
    idx: 0, startedAt: now, paused: false, pauseElapsed: 0,
    active: 0, lastTick: now,
    cues: new Set(), reps: 0, laps: [], result: null,
    spent: [], pauses: 0, skipped: 0,
    finished: false, timer: null,
    track: null, trackSetAt: now, lastSyncCheck: now,
  };

  // Piste audio (générée et lancée dans le geste « Démarrer », obligatoire sur iPhone)
  if (trackEl.src) URL.revokeObjectURL(trackEl.src);
  trackEl.removeAttribute('src');
  if (settings.sound) {
    try {
      run.track = buildTrack(segs, before, run.total);
      trackEl.src = run.track.url;
      trackEl.muted = muted;
    } catch { run.track = null; }
  }

  const runEl = $('#run');
  runEl.classList.remove('paused');
  $('#run-title').textContent = run.name;
  $('#stop-sheet').hidden = true;
  $('#laps').innerHTML = '';
  $('#reps').textContent = '0';
  $('#mute-btn').textContent = muted ? '🔇' : '🔊';
  show('run');

  enterSegment(0, now);
  syncTrack();
  requestWakeLock();
  run.timer = setInterval(tick, 100);
  draw();
}

// announce = false quand on rattrape un intervalle déjà passé (retour dans l'appli) : pas de son en retard.
function enterSegment(i, at, announce = true) {
  run.idx = i;
  run.startedAt = at;
  run.pauseElapsed = 0;
  run.cues.clear();
  const seg = cur();
  const ph = PHASES[seg.kind];
  const label = seg.label || ph.label;

  const info = [];
  if (seg.step) info.push(`Exercice ${seg.step}/${seg.steps}`);
  if (seg.round && run.mode !== 'emom') info.push(`${run.mode === 'circuit' ? 'Tour' : 'Round'} ${seg.round}/${seg.rounds}`);
  if (seg.round && run.mode === 'emom') info.push(`${seg.round}/${seg.rounds}`);
  if (seg.sets > 1) info.push(`Série ${seg.set}/${seg.sets}`);
  const infoText = info.join(' · ');

  // Signal de transition (le bip est dans la piste audio quand elle couvre ce moment)
  if (announce) {
    const viaTrack = trackCovers(run.before[i]);
    if (seg.kind === 'work') { if (!viaTrack) beep(1175, 0.5); buzz([250]); }
    else { if (!viaTrack) beep(660, 0.5); buzz([120, 80, 120]); }
    speak(seg.say);
    notify(`${label}${isFinite(seg.dur) ? ' · ' + fmt(seg.dur) : ''}`, [run.name, infoText].filter(Boolean).join(' · '));
  }

  if ('mediaSession' in navigator && window.MediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: label, artist: [run.name, infoText].filter(Boolean).join(' · '), album: 'Sport Timer',
      artwork: [{ src: 'icon.svg', sizes: '512x512', type: 'image/svg+xml' }],
    });
  }

  // Habillage
  $('#run').style.setProperty('--phase', seg.color || ph.color);
  $('#phase-label').textContent = label;
  $('#phase-info').textContent = infoText;

  const n = run.segs[i + 1];
  $('#next').textContent = n
    ? `Ensuite : ${n.label || PHASES[n.kind].label}${isFinite(n.dur) ? ' · ' + fmt(n.dur) : ''}`
    : 'Dernier intervalle';

  $('#counter').hidden = !seg.reps;
  $('#laps-box').hidden = !seg.laps;
}

function tick() {
  if (!run || run.finished) return;
  const now = performance.now();
  if (!run.paused) {
    run.active += now - run.lastTick;
    let seg = cur();
    let el = (now - run.startedAt) / 1000;
    // Boucle : rattrape plusieurs intervalles si l'appli a été mise en veille.
    while (el >= seg.dur) {
      if (run.idx + 1 >= run.segs.length) { finish(true); return; }
      const at = run.startedAt + seg.dur * 1000;
      credit(run.idx, seg.dur);
      enterSegment(run.idx + 1, at, now - at < 1500);
      seg = cur();
      el = (now - run.startedAt) / 1000;
    }
    cues(seg, el);
    // Appli ouverte : la piste doit jouer et rester calée sur le timer (vérifié chaque seconde).
    if (run.track && !document.hidden && now - run.lastSyncCheck > 1000) {
      run.lastSyncCheck = now;
      const t = planTime();
      if (trackCovers(t) && (trackEl.paused || Math.abs(trackEl.currentTime - t) > 0.3)) syncTrack();
    }
  }
  run.lastTick = now;
  draw();
}

// Temps réellement passé dans chaque intervalle (effort, repos… pour le calendrier).
function credit(i, sec) {
  run.spent[i] = (run.spent[i] || 0) + clamp(sec, 0, run.segs[i].dur);
}

function cue(key, fn) {
  if (run.cues.has(key)) return;
  run.cues.add(key);
  fn();
}

function cues(seg, el) {
  if (!isFinite(seg.dur)) return;
  const left = Math.ceil(seg.dur - el);
  if (left <= 3 && left >= 1) cue('c' + left, () => { if (!trackCovers(planTime())) beep(880, 0.12); buzz(40); speak(String(left)); });
  if (seg.dur >= 30 && left === 10) cue('10', () => speak('10 secondes'));
  if (seg.dur >= 180 && left === 60) cue('60', () => speak('Plus qu’une minute'));
  if (seg.dur >= 20 && seg.kind === 'work' && el >= seg.dur / 2) cue('half', () => speak('Mi-parcours'));
}

function draw() {
  const seg = cur();
  const el = segElapsed();
  const shown = seg.countUp ? Math.floor(el) : Math.ceil(seg.dur - el);
  const text = fmt(shown);
  const timeEl = $('#time');
  timeEl.textContent = text;
  timeEl.classList.toggle('long', text.length > 5);

  let frac;
  if (seg.countUp) frac = isFinite(seg.dur) ? el / seg.dur : (el % 60) / 60;
  else frac = el / seg.dur;
  frac = clamp(frac, 0, 1);
  $('#ring').style.strokeDashoffset = seg.countUp ? RING_C * (1 - frac) : RING_C * frac;

  const done = run.before[run.idx] + Math.min(el, seg.dur);
  if (isFinite(run.total)) {
    $('#total-label').textContent = 'Restant';
    $('#total-time').textContent = fmt(Math.ceil(run.total - done));
    $('#bar-fill').style.width = (done / run.total) * 100 + '%';
  } else {
    $('#total-label').textContent = 'Écoulé';
    $('#total-time').textContent = fmt(Math.floor(done));
    $('#bar-fill').style.width = '0%';
  }

  $('#paused-tag').hidden = !run.paused;
  document.title = `${text} · ${seg.label || PHASES[seg.kind].label}`;
}

function pause() {
  if (run.paused) return;
  run.pauseElapsed = segElapsed();
  run.active += performance.now() - run.lastTick;
  run.paused = true;
  run.pauses++;
  $('#run').classList.add('paused');
  trackEl.pause();
  window.speechSynthesis?.cancel();
  draw();
}

function resume() {
  if (!run.paused) return;
  initAudio();
  const now = performance.now();
  run.startedAt = now - run.pauseElapsed * 1000;
  run.lastTick = now;
  run.paused = false;
  $('#run').classList.remove('paused');
  syncTrack();
  draw();
}

function goTo(i) {
  const now = performance.now();
  if (!run.paused) run.active += now - run.lastTick;
  run.lastTick = now;
  credit(run.idx, segElapsed(now));
  if (i > run.idx) run.skipped++;
  enterSegment(i, now);
  syncTrack();
  draw();
}

// natural = fin normale de la séance : la fanfare est déjà dans la piste audio.
function finish(natural = false) {
  if (!run || run.finished) return;
  const seg = cur();
  if (!run.paused) run.active += performance.now() - run.lastTick;
  if (seg.countUp) run.result = Math.floor(Math.min(segElapsed(), seg.dur));
  run.finished = true;
  clearInterval(run.timer);
  releaseWakeLock();

  if (!(natural && trackCovers(run.total - 0.001))) {
    trackEl.pause();
    beep(1046, 0.18, 0); beep(1318, 0.18, 0.2); beep(1568, 0.6, 0.4);
  }
  buzz([200, 100, 200, 100, 400]);
  speak('Terminé ! Bravo !');
  notify('Terminé ! Bravo 🎉', run.name);

  credit(run.idx, segElapsed());
  const session = sessionRecord(natural);
  sessions.unshift(session);
  sessions = sessions.slice(0, MAX_SESSIONS);
  store.set('sessions', sessions);

  $('#done-name').textContent = run.name;
  $('#stats').innerHTML = statsHtml(sessionStats(session));
  $('#done-laps').innerHTML = lapsHtml(run.laps);
  $('#done-journal').innerHTML = journalHtml(session);
  show('done');
}

const INTERVAL_MODES = ['tabata', 'hiit', 'emom', 'circuit'];

// Tout ce qu'on sait de la séance terminée, pour le calendrier.
function sessionRecord(natural) {
  const end = Date.now();
  const sum = (test) => Math.round(run.segs.reduce((a, s, i) => a + (test(s) ? run.spent[i] || 0 : 0), 0));
  const planned = isFinite(run.total) ? run.total : null;
  const progress = planned ? Math.min(100, Math.round((sum(() => true) / planned) * 100)) : null;
  const works = run.segs.map((s, i) => i).filter((i) => run.segs[i].kind === 'work');
  const seg = cur();
  const rec = {
    date: run.startDate, end, mode: run.mode, name: run.name, cfg: run.cfg,
    active: Math.round(run.active / 1000), wall: Math.round((end - run.startDate) / 1000),
    planned, progress, complete: natural || run.mode === 'fortime' || progress >= 99,
    work: sum((s) => s.kind === 'work'), rest: sum((s) => s.kind === 'rest' || s.kind === 'setRest'),
    prepare: sum((s) => s.kind === 'prepare'), cooldown: sum((s) => s.kind === 'cooldown'),
    pauses: run.pauses, skipped: run.skipped,
  };
  if (INTERVAL_MODES.includes(run.mode)) {
    rec.intervals = { done: works.filter((i) => run.spent[i] >= run.segs[i].dur - 0.5).length, total: works.length };
  }
  if (seg.round) Object.assign(rec, { round: seg.round, rounds: seg.rounds });
  if (seg.set) Object.assign(rec, { set: seg.set, sets: seg.sets });
  if (run.mode === 'amrap') rec.reps = run.reps;
  if (run.result != null) rec.result = run.result;
  if (run.mode === 'fortime' && natural) rec.capped = true;
  if (run.laps.length) rec.laps = run.laps.map((t) => Math.round(t * 10) / 10);
  return rec;
}

function quit() {
  if (run) {
    clearInterval(run.timer);
    run.finished = true;
  }
  trackEl.pause();
  releaseWakeLock();
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  renderHome();
  show('home');
}

function lapsHtml(laps = []) {
  let prev = 0;
  return laps.map((t, i) => {
    const split = t - prev;
    prev = t;
    return `<li><span>Tour ${i + 1}</span><span>${fmt(Math.floor(split))}</span><span>${fmt(Math.floor(t))}</span></li>`;
  }).reverse().join('');
}

/* ================= Actions ================= */

const actions = {
  home() { renderHome(); show('home'); },
  start: startRun,
  restart: startRun,

  'save-fav'() {
    const input = $('#fav-name');
    const name = input.value.trim() || MODES[current.mode].name;
    const existing = favorites.find((f) => f.name === name && f.mode === current.mode);
    if (existing) existing.cfg = clone(current.cfg);
    else favorites.unshift({ id: Date.now(), name, mode: current.mode, cfg: clone(current.cfg) });
    store.set('favorites', favorites);
    current.name = name;
    input.value = name;
    const btn = document.querySelector('[data-action="save-fav"]');
    btn.textContent = '★ Enregistré';
    setTimeout(() => { btn.textContent = '☆ Enregistrer'; }, 1500);
  },

  'add-work'() { current.cfg.steps.push({ kind: 'work', name: '', dur: 30 }); renderSteps(); updateConfig(); },
  'add-rest'() { current.cfg.steps.push({ kind: 'rest', name: 'Repos', dur: 15 }); renderSteps(); updateConfig(); },
  'step-del'(el) { current.cfg.steps.splice(+el.dataset.i, 1); renderSteps(); updateConfig(); },
  'step-kind'(el) {
    const st = current.cfg.steps[+el.dataset.i];
    st.kind = st.kind === 'work' ? 'rest' : 'work';
    renderSteps(); updateConfig();
  },

  toggle() { if (!run || run.finished) return; run.paused ? resume() : pause(); },
  prev() {
    if (!run || run.finished) return;
    goTo(segElapsed() > 2 || run.idx === 0 ? run.idx : run.idx - 1);
  },
  next() {
    if (!run || run.finished) return;
    if (run.idx + 1 >= run.segs.length) finish(); else goTo(run.idx + 1);
  },
  stop() {
    if (!run || run.finished) return;
    run.stopPaused = !run.paused;
    pause();
    $('#stop-sheet').hidden = false;
  },
  resume() { $('#stop-sheet').hidden = true; resume(); },
  finish() {
    $('#stop-sheet').hidden = true;
    // La pause ouverte par ✕ pour terminer n'est pas une vraie pause.
    if (run?.stopPaused) run.pauses--;
    finish();
  },
  quit,
  mute() {
    muted = !muted;
    $('#mute-btn').textContent = muted ? '🔇' : '🔊';
    trackEl.muted = muted;
    if (muted && 'speechSynthesis' in window) speechSynthesis.cancel();
  },

  'rep-plus'() { run.reps++; $('#reps').textContent = run.reps; beep(520, 0.08); buzz(30); },
  'rep-minus'() { run.reps = Math.max(0, run.reps - 1); $('#reps').textContent = run.reps; },
  lap() {
    if (run.paused) return;
    run.laps.push(segElapsed());
    $('#laps').innerHTML = lapsHtml(run.laps);
    beep(520, 0.08); buzz(30);
  },

  calendar() { openCalendar(dayKey(Date.now())); },
  'month-prev'() { calMonth.setMonth(calMonth.getMonth() - 1); renderCalendar(); },
  'month-next'() { calMonth.setMonth(calMonth.getMonth() + 1); renderCalendar(); },
  'clear-history'(el) {
    if (!confirmed(el, `Appuyez encore pour effacer les ${plural(sessions.length, 'séance')}`)) return;
    sessions = [];
    saveSessions();
    renderCalendar();
  },
  'session-back'() {
    if (viewingFrom === 'home') return actions.home();
    openCalendar(viewing ? dayKey(viewing.date) : calDay);
  },
  'session-redo'() {
    if (!viewing || !MODES[viewing.mode]) return;
    openConfig(viewing.mode, viewing.cfg, viewing.name !== MODES[viewing.mode].name ? viewing.name : '');
  },
  'session-del'(el) {
    if (!viewing || !confirmed(el, 'Appuyez encore pour supprimer')) return;
    sessions = sessions.filter((s) => s !== viewing);
    saveSessions();
    actions['session-back']();
  },
  feel(el) {
    const s = findSession(el.closest('.journal').dataset.id);
    if (!s) return;
    const v = +el.dataset.v;
    s.feel = s.feel === v ? undefined : v;
    saveSessions();
    el.parentElement.querySelectorAll('.feel').forEach((b) => b.classList.toggle('on', +b.dataset.v === s.feel));
  },
};

document.addEventListener('click', (e) => {
  const t = e.target;
  const mode = t.closest('[data-mode]');
  if (mode) return openConfig(mode.dataset.mode);

  const favOpen = t.closest('[data-fav-open]');
  const favStart = t.closest('[data-fav-start]');
  const favDel = t.closest('[data-fav-del]');
  const sess = t.closest('[data-session]');
  if (sess) return openSession(sess.dataset.session, $('#home').hidden ? 'calendar' : 'home');
  const day = t.closest('[data-day]');
  if (day) { calDay = day.dataset.day; return renderCalendar(); }
  if (favOpen || favStart) {
    const f = favorites.find((x) => String(x.id) === (favOpen || favStart).dataset[favOpen ? 'favOpen' : 'favStart']);
    if (!f) return;
    openConfig(f.mode, f.cfg, f.name);
    if (favStart) startRun();
    return;
  }
  if (favDel) {
    favorites = favorites.filter((x) => String(x.id) !== favDel.dataset.favDel);
    store.set('favorites', favorites);
    return renderHome();
  }

  // Activation clavier des steppers (Entrée / Espace sur le bouton).
  const stepBtn = t.closest('.stepper [data-d]');
  if (stepBtn && e.detail === 0) return bump(stepBtn);

  const a = t.closest('[data-action]');
  if (a && actions[a.dataset.action]) {
    // Un tap sur le fond de la feuille de pause ne doit pas relancer le timer.
    if (a.dataset.action === 'toggle' && !$('#stop-sheet').hidden) return;
    actions[a.dataset.action](a);
  }
});

// Appui long sur + / − : répétition accélérée.
let repeatTimer = null;
const stopRepeat = () => { clearTimeout(repeatTimer); repeatTimer = null; };
document.addEventListener('pointerdown', (e) => {
  const btn = e.target.closest('.stepper [data-d]');
  if (!btn || e.button > 0) return;
  e.preventDefault();
  bump(btn);
  let delay = 420;
  const loop = () => {
    repeatTimer = setTimeout(() => { bump(btn); delay = Math.max(45, delay * 0.82); loop(); }, delay);
  };
  stopRepeat();
  loop();
});
['pointerup', 'pointercancel', 'blur'].forEach((ev) => window.addEventListener(ev, stopRepeat));

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'volume') {
    settings.volume = t.value / 100;
    $('#volume-value').textContent = t.value + ' %';
    store.set('settings', settings);
  }
  if (t.classList.contains('step-name')) current.cfg.steps[+t.dataset.i].name = t.value;
  if (t.classList.contains('session-note')) {
    const s = findSession(t.closest('.journal').dataset.id);
    if (s) { s.note = t.value.trim() ? t.value : undefined; saveSessions(); }
  }
});

document.addEventListener('change', (e) => {
  // Bip d'essai au volume choisi, quand on lâche le curseur.
  if (e.target.id === 'volume') { initAudio(); beep(1175, 0.4); return; }
  const key = e.target.dataset.setting;
  if (!key) return;
  settings[key] = e.target.checked;
  store.set('settings', settings);
  if (key === 'notify' && settings.notify) {
    if (!('Notification' in window)) {
      e.target.checked = settings.notify = false;
      store.set('settings', settings);
      alertNote('Ce navigateur ne gère pas les notifications. Sur iPhone : ajoutez d’abord l’appli à l’écran d’accueil.');
      return;
    }
    Notification.requestPermission().then((perm) => {
      if (perm === 'granted') return alertNote('');
      e.target.checked = settings.notify = false;
      store.set('settings', settings);
      alertNote('Notifications refusées : autorisez-les dans les réglages du navigateur pour ce site.');
    });
  }
});

function alertNote(text) {
  const el = $('#settings-note');
  el.textContent = text;
  el.hidden = !text;
}

document.addEventListener('keydown', (e) => {
  if ($('#run').hidden || !run || run.finished || e.target.matches('input, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); actions.toggle(); }
  else if (e.code === 'ArrowRight') actions.next();
  else if (e.code === 'ArrowLeft') actions.prev();
  else if (e.code === 'Escape') $('#stop-sheet').hidden ? actions.stop() : actions.resume();
});

/* ================= Démarrage ================= */

renderHome();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
