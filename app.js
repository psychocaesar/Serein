// ── NAVIGATION ──
const SCREENS = ['home','explore','guide','player','settings'];

function showScreen(id) {
  SCREENS.forEach(s => {
    document.getElementById(s).classList.toggle('active', s === id);
    const btn = document.getElementById('nav-' + s);
    if (btn) btn.classList.toggle('active', s === id);
  });
  if (id === 'guide') initGuide();
}

function filterTab(btn) {
  document.querySelectorAll('.filter-tabs .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const label = btn.textContent.trim();
  document.querySelectorAll('.session-list .session-card').forEach(card => {
    const p = card.dataset.parcours || '';
    card.style.display = (label === 'Toutes' || p === label) ? '' : 'none';
  });
}

function filterParcours(label) {
  showScreen('explore');
  setTimeout(() => {
    document.querySelectorAll('.filter-tabs .tab').forEach(t => {
      if (t.textContent.trim() === label) t.click();
    });
  }, 50);
}

// ── VOICE OVERLAY ──
let pendingSession = null;
let selectedVoice = 'masculine';

function openVoiceOverlay(id, title, parcours, duration, filenameMasc, filenameFem) {
  pendingSession = { id, title, parcours, duration, filenameMasc, filenameFem };
  if (!filenameFem) {
    selectedVoice = 'masculine';
    launchPlayer(id, title, parcours, duration, filenameMasc, 'masculine');
    return;
  }
  selectedVoice = 'masculine';
  document.querySelectorAll('.voice-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('vopt-masculine').classList.add('selected');
  document.getElementById('voice-overlay').classList.add('open');
}

function selectVoiceOption(voice) {
  selectedVoice = voice;
  document.querySelectorAll('.voice-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('vopt-' + voice).classList.add('selected');
}

function closeVoiceOverlay() {
  document.getElementById('voice-overlay').classList.remove('open');
}

function confirmVoiceAndLaunch() {
  if (!pendingSession) return;
  const s = pendingSession;
  const filename = selectedVoice === 'feminine' && s.filenameFem ? s.filenameFem : s.filenameMasc;
  closeVoiceOverlay();
  launchPlayer(s.id, s.title, s.parcours, s.duration, filename, selectedVoice);
  pendingSession = null;
}

// ── PLAYER ──
let currentSession = null;
const audio = document.getElementById('audio-engine');
const ambianceAudio = document.getElementById('ambiance-engine');

function launchPlayer(id, title, parcours, duration, filename, voice) {
  currentSession = { id, title, parcours, duration, filename, voice };
  showScreen('player');
  document.getElementById('player-title').textContent = title;
  document.getElementById('player-meta').textContent = parcours + ' · ' + duration;
  document.getElementById('player-voice-tag').textContent = voice === 'feminine' ? 'Voix féminine — Daïdrée' : 'Voix masculine — César';
  document.getElementById('complete-screen').classList.remove('visible');
  document.getElementById('player-main').classList.remove('hidden');
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-thumb').style.left = '0%';
  document.getElementById('time-current').textContent = '0:00';
  document.getElementById('time-total').textContent = '--:--';
  document.getElementById('audio-loading').textContent = 'Chargement…';
  audio.src = 'assets/audio/masculin/' + filename;
  audio.load();
  audio.play().then(() => {
    document.getElementById('audio-loading').textContent = '';
    updatePlayIcon(true);
  }).catch(() => {
    document.getElementById('audio-loading').textContent = 'Appuie sur ▶ pour démarrer';
    updatePlayIcon(false);
  });
}

function togglePlay() {
  if (!audio.src || audio.src === window.location.href) {
    document.getElementById('audio-loading').textContent = 'Aucune séance sélectionnée';
    return;
  }
  if (audio.paused) { audio.play(); updatePlayIcon(true); }
  else { audio.pause(); updatePlayIcon(false); }
}

function updatePlayIcon(playing) {
  document.getElementById('icon-play').style.display = playing ? 'none' : '';
  document.getElementById('icon-pause').style.display = playing ? '' : 'none';
}

function setSpeed(s) {
  audio.playbackRate = s;
  document.querySelectorAll('.speed-btn').forEach(b => b.classList.toggle('active', parseFloat(b.textContent.replace('×','')) === s));
}

document.getElementById('btn-rewind').onclick = () => { audio.currentTime = Math.max(0, audio.currentTime - 15); };
document.getElementById('btn-forward').onclick = () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); };

audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  document.getElementById('progress-fill').style.width = pct + '%';
  document.getElementById('progress-thumb').style.left = pct + '%';
  document.getElementById('time-current').textContent = fmt(audio.currentTime);
  document.getElementById('progress-track').setAttribute('aria-valuenow', Math.round(pct));
});

audio.addEventListener('loadedmetadata', () => {
  document.getElementById('time-total').textContent = fmt(audio.duration);
  document.getElementById('audio-loading').textContent = '';
});

audio.addEventListener('ended', () => {
  updatePlayIcon(false);
  document.getElementById('player-main').classList.add('hidden');
  document.getElementById('complete-screen').classList.add('visible');
  if (currentSession) document.getElementById('complete-title').textContent = currentSession.title;
  recordCompletion();
});

audio.addEventListener('play', () => updatePlayIcon(true));
audio.addEventListener('pause', () => updatePlayIcon(false));
audio.addEventListener('error', () => {
  document.getElementById('audio-loading').textContent = 'Fichier audio introuvable ou non chargé.';
  updatePlayIcon(false);
});

const track = document.getElementById('progress-track');
function seekFromEvent(e) {
  const rect = track.getBoundingClientRect();
  const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
  const pct = Math.max(0, Math.min(1, x / rect.width));
  if (audio.duration) audio.currentTime = pct * audio.duration;
}
let seeking = false;
track.addEventListener('mousedown', e => { seeking = true; seekFromEvent(e); });
document.addEventListener('mousemove', e => { if (seeking) seekFromEvent(e); });
document.addEventListener('mouseup', () => { seeking = false; });
track.addEventListener('touchstart', e => { seeking = true; seekFromEvent(e); }, { passive: true });
track.addEventListener('touchmove', e => { if (seeking) seekFromEvent(e); }, { passive: true });
track.addEventListener('touchend', () => { seeking = false; });

document.getElementById('volume-slider').addEventListener('input', e => { audio.volume = e.target.value; });

function fmt(s) {
  if (!s || isNaN(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}

function stopAndReturn() {
  audio.pause();
  audio.src = '';
  showScreen('explore');
}

function replaySession() {
  if (!currentSession) return;
  document.getElementById('complete-screen').classList.remove('visible');
  document.getElementById('player-main').classList.remove('hidden');
  audio.currentTime = 0;
  audio.play();
}

// ── AMBIANCE ──
let currentAmbiance = null;
function setAmbiance(file) {
  document.querySelectorAll('.ambiance-btn').forEach(b => b.classList.remove('active'));
  if (!file) {
    ambianceAudio.pause(); ambianceAudio.src = '';
    document.getElementById('amb-off').classList.add('active');
    document.getElementById('ambiance-volume-wrap').style.display = 'none';
    currentAmbiance = null;
    updateAmbianceTag('Aucun');
    return;
  }
  currentAmbiance = file;
  ambianceAudio.src = 'assets/audio/ambiance/' + file;
  ambianceAudio.volume = parseFloat(document.getElementById('ambiance-volume-slider').value);
  ambianceAudio.play().catch(() => {});
  const id = 'amb-' + file.replace('.mp3','').replace('bruit-blanc','blanc');
  const btn = document.getElementById(id);
  if (btn) btn.classList.add('active');
  document.getElementById('ambiance-volume-wrap').style.display = 'flex';
  const label = file.replace('.mp3','').replace('bruit-blanc','Bruit blanc');
  updateAmbianceTag(label);
}

document.getElementById('ambiance-volume-slider').addEventListener('input', e => {
  ambianceAudio.volume = e.target.value;
});

function updateAmbianceTag(label) {
  const tag = document.getElementById('ambiance-settings-tag');
  if (tag) tag.textContent = label.charAt(0).toUpperCase() + label.slice(1);
}

// ── OFFLINE CACHE ──
async function toggleOfflineCache(btn, filename) {
  if (!('caches' in window)) { alert('Cache non disponible sur ce navigateur.'); return; }
  btn.classList.add('loading');
  try {
    const cache = await caches.open('serein-audio-v1');
    const url = 'assets/audio/masculin/' + filename;
    const existing = await cache.match(url);
    if (existing) {
      await cache.delete(url);
      btn.classList.remove('cached', 'loading');
      btn.textContent = '⬇';
    } else {
      await cache.add(url);
      btn.classList.remove('loading');
      btn.classList.add('cached');
      btn.textContent = '✓';
    }
    updateOfflineCount();
  } catch(e) {
    btn.classList.remove('loading');
    alert('Erreur lors de la mise en cache.');
  }
}

async function updateOfflineCount() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open('serein-audio-v1');
    const keys = await cache.keys();
    const tag = document.getElementById('offline-count-tag');
    if (tag) tag.textContent = keys.length + ' séance' + (keys.length > 1 ? 's' : '');
  } catch(e) {}
}

async function restoreOfflineButtons() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open('serein-audio-v1');
    document.querySelectorAll('.btn-offline').forEach(async btn => {
      const fn = btn.dataset.filename;
      if (!fn) return;
      const match = await cache.match('assets/audio/masculin/' + fn);
      if (match) { btn.classList.add('cached'); btn.textContent = '✓'; }
    });
  } catch(e) {}
}

// ── STATS ──
function loadStats() {
  const s = JSON.parse(localStorage.getItem('serein-stats') || '{"sessions":0,"minutes":0,"lastDate":"","streak":0}');
  document.getElementById('stat-sessions').textContent = s.sessions || 0;
  document.getElementById('stat-time').textContent = (s.minutes || 0) + ' min';
  document.getElementById('stat-streak').textContent = s.streak || 0;
}

function recordCompletion() {
  const s = JSON.parse(localStorage.getItem('serein-stats') || '{"sessions":0,"minutes":0,"lastDate":"","streak":0}');
  s.sessions = (s.sessions || 0) + 1;
  const dur = currentSession ? parseInt(currentSession.duration) || 0 : 0;
  s.minutes = (s.minutes || 0) + dur;
  const today = new Date().toISOString().slice(0,10);
  if (s.lastDate === today) {
    // same day
  } else if (s.lastDate === new Date(Date.now() - 86400000).toISOString().slice(0,10)) {
    s.streak = (s.streak || 0) + 1;
  } else {
    s.streak = 1;
  }
  s.lastDate = today;
  localStorage.setItem('serein-stats', JSON.stringify(s));
  loadStats();
}

// ── THÈME ──
function toggleTheme() {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.documentElement.setAttribute('data-theme', dark ? '' : 'dark');
  document.getElementById('theme-toggle').textContent = dark ? '🌙 Sombre' : '☀️ Clair';
  localStorage.setItem('serein-theme', dark ? '' : 'dark');
}

function applyTheme() {
  const t = localStorage.getItem('serein-theme');
  if (t === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = '☀️ Clair';
  }
}

// ── GUIDE CHATBOT ──
const GUIDE_MAP = {
  'stress': {
    'court':  { title: 'SOS Stress en 6 minutes',        parcours: 'Calme & Stress', duration: '6 min',  file: 'SOS Stress en 6 minutes.mp3',          emoji: '😮‍💨' },
    'moyen':  { title: 'La cohérence cardiaque guidée',   parcours: 'Calme & Stress', duration: '5 min',  file: 'Cohérence cardiaque 5 minutes.mp3',   emoji: '💚' },
    'long':   { title: 'La cohérence cardiaque guidée',   parcours: 'Calme & Stress', duration: '5 min',  file: 'Cohérence cardiaque 5 minutes.mp3',   emoji: '💚' }
  },
  'anxiete': {
    'court':  { title: 'SOS Anxiété — ancrage immédiat', parcours: 'Anxiété', duration: '5 min',  file: 'SOS Anxiété ancrage immédiat.mp3',    emoji: '🌀' },
    'moyen':  { title: "Accueillir l'anxiété sans la combattre", parcours: 'Anxiété', duration: '10 min', file: "Accueillir l'anxiété sans la combattre.mp3", emoji: '🤍' },
    'long':   { title: 'La pensée qui tourne en boucle',  parcours: 'Anxiété', duration: '9 min',  file: 'La pensée qui tourne en boucle.mp3',  emoji: '🧠' }
  },
  'fatigue': {
    'court':  { title: 'Première respiration consciente',  parcours: 'Premiers pas', duration: '5 min',  file: 'Méditation Premiere Respiration Consciente.mp3', emoji: '🌱' },
    'moyen':  { title: 'Le scan corporel — découvrir ses sensations', parcours: 'Premiers pas', duration: '10 min', file: 'Le scan corporel.mp3', emoji: '🌿' },
    'long':   { title: 'Réveils nocturnes — retrouver le calme', parcours: 'Sommeil', duration: '18 min', file: 'Reveils nocturnes.mp3', emoji: '🌙' }
  },
  'brouillard': {
    'court':  { title: "S'asseoir, ne rien faire", parcours: 'Premiers pas', duration: '5 min', file: 'Sasseoir ne rien faire.mp3', emoji: '🧘' },
    'moyen':  { title: 'Observer ses pensées sans les juger', parcours: 'Premiers pas', duration: '9 min', file: 'Observer ses pensées sans les juger.mp3', emoji: '👁️' },
    'long':   { title: 'Observer ses pensées sans les juger', parcours: 'Premiers pas', duration: '9 min', file: 'Observer ses pensées sans les juger.mp3', emoji: '👁️' }
  },
  'sommeil': {
    'court':  { title: 'Rituel de déconnexion', parcours: 'Sommeil', duration: '10 min', file: 'Rituel de déconnexion.mp3', emoji: '🌙' },
    'moyen':  { title: 'Rituel de déconnexion', parcours: 'Sommeil', duration: '10 min', file: 'Rituel de déconnexion.mp3', emoji: '🌙' },
    'long':   { title: 'Réveils nocturnes — retrouver le calme', parcours: 'Sommeil', duration: '18 min', file: 'Reveils nocturnes.mp3', emoji: '💤' }
  }
};

let guideStep = 0;
let guideMood = null;
let guideInitialized = false;

function initGuide() {
  if (guideInitialized) return;
  guideInitialized = true;
  guideStep = 0; guideMood = null;
  const win = document.getElementById('chat-window');
  const res = document.getElementById('guide-result');
  win.innerHTML = ''; res.style.display = 'none'; res.innerHTML = '';
  setTimeout(() => addBotBubble('Bonjour 👋 Comment tu te sens en ce moment\u00a0?'), 200);
  setTimeout(() => addChoices([
    { label: '😮‍💨 Stressé(e)', value: 'stress' },
    { label: '😰 Anxieux/se', value: 'anxiete' },
    { label: '😴 Fatigué(e)', value: 'fatigue' },
    { label: '😶 Brouillard mental', value: 'brouillard' },
    { label: '🌙 Difficultés à dormir', value: 'sommeil' }
  ], onMoodChoice), 600);
}

function onMoodChoice(value) {
  guideMood = value;
  const labels = { stress: 'Stressé(e)', anxiete: 'Anxieux/se', fatigue: 'Fatigué(e)', brouillard: 'Brouillard mental', sommeil: 'Difficultés à dormir' };
  addUserBubble(labels[value] || value);
  clearChoices();
  setTimeout(() => addBotBubble('Combien de temps as-tu\u00a0?'), 400);
  setTimeout(() => addChoices([
    { label: '⚡ 5 minutes', value: 'court' },
    { label: '🌿 5–10 minutes', value: 'moyen' },
    { label: '🌊 Plus de 10 minutes', value: 'long' }
  ], onDurationChoice), 800);
}

function onDurationChoice(value) {
  addUserBubble({ court: '5 minutes', moyen: '5–10 minutes', long: 'Plus de 10 minutes' }[value]);
  clearChoices();
  const rec = GUIDE_MAP[guideMood] && GUIDE_MAP[guideMood][value];
  if (!rec) { setTimeout(() => addBotBubble('Désolé, je n\'ai pas trouvé de séance pour ce profil.'), 400); return; }
  setTimeout(() => {
    addBotBubble('Voilà ce que je te recommande\u00a0:');
    setTimeout(() => showGuideResult(rec), 400);
  }, 400);
}

function showGuideResult(rec) {
  const res = document.getElementById('guide-result');
  res.style.display = 'block';
  res.innerHTML = `
    <div class="guide-result-card">
      <div class="result-emoji">${rec.emoji}</div>
      <h3>${rec.title}</h3>
      <p class="result-meta">${rec.parcours} · ${rec.duration}</p>
      <button class="btn btn-primary" style="width:100%" onclick="openVoiceOverlay('guide-rec','${rec.title.replace(/'/g, "\\'")}\'','${rec.parcours}','${rec.duration}','${rec.file.replace(/'/g, "\\'")}\'',false)">▶ Lancer cette séance</button>
      <button class="guide-restart" onclick="restartGuide()">↩ Recommencer</button>
    </div>`;
  res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function restartGuide() {
  guideInitialized = false;
  initGuide();
  document.getElementById('guide-result').style.display = 'none';
}

function addBotBubble(text) {
  const win = document.getElementById('chat-window');
  const div = document.createElement('div');
  div.className = 'chat-bubble bot'; div.textContent = text;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}

function addUserBubble(text) {
  const win = document.getElementById('chat-window');
  const div = document.createElement('div');
  div.className = 'chat-bubble user'; div.textContent = text;
  win.appendChild(div);
  win.scrollTop = win.scrollHeight;
}

function addChoices(choices, cb) {
  const win = document.getElementById('chat-window');
  const wrap = document.createElement('div');
  wrap.className = 'chat-choices'; wrap.id = 'current-choices';
  choices.forEach(c => {
    const btn = document.createElement('button');
    btn.className = 'chat-choice'; btn.textContent = c.label;
    btn.onclick = () => cb(c.value);
    wrap.appendChild(btn);
  });
  win.appendChild(wrap);
  win.scrollTop = win.scrollHeight;
}

function clearChoices() {
  const el = document.getElementById('current-choices');
  if (el) el.remove();
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  loadStats();
  restoreOfflineButtons();
  updateOfflineCount();
});
