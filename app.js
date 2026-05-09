// ── NAVIGATION ──
const SCREENS = ['home','explore','guide','settings'];

function showScreen(id) {
  SCREENS.forEach(s => {
    document.getElementById(s).classList.toggle('active', s === id);
    const btn = document.getElementById('nav-' + s);
    if (btn) btn.classList.toggle('active', s === id);
  });
  window.scrollTo(0, 0);
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

function openVoiceOverlay(id, title, parcours, duration, filenameMasc, filenameFem, artwork) {
  pendingSession = { id, title, parcours, duration, filenameMasc, filenameFem, artwork };
  if (!filenameFem) {
    selectedVoice = 'masculine';
    launchPlayer(id, title, parcours, duration, filenameMasc, 'masculine', artwork);
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
  launchPlayer(s.id, s.title, s.parcours, s.duration, filename, selectedVoice, s.artwork);
  pendingSession = null;
}

// ── PLAYER IMMERSIF ──
let currentSession = null;
const audio = document.getElementById('audio-engine');
const ambianceAudio = document.getElementById('ambiance-engine');
let currentOfflineFilename = null;

function openPlayerScreen() {
  document.getElementById('player-screen').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePlayer() {
  // Stop all audio
  audio.pause();
  ambianceAudio.pause();

  // Clean up timer if active
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; timerRunning = false; }

  // Always restore guided player UI
  const artworkWrap = document.getElementById('player-artwork-wrap');
  const timerDisplay = document.getElementById('timer-display');
  const progress = document.getElementById('player-progress');
  const voiceTag = document.getElementById('player-voice-tag');
  const playerMain = document.getElementById('player-main');

  if (artworkWrap) artworkWrap.style.display = '';
  if (timerDisplay) timerDisplay.style.display = 'none';
  if (progress) progress.style.display = '';
  if (voiceTag) voiceTag.style.display = '';
  if (playerMain) { playerMain.style.display = 'flex'; playerMain.classList.remove('hidden'); }
  document.getElementById('complete-screen').classList.remove('visible');

  // Close overlays
  document.getElementById('options-sheet').classList.remove('open');
  document.getElementById('player-screen').classList.remove('open');
  document.body.style.overflow = '';
}

function toggleOptionsSheet() {
  document.getElementById('options-sheet').classList.toggle('open');
}

function launchPlayer(id, title, parcours, duration, filename, voice, artwork) {
  currentSession = { id, title, parcours, duration, filename, voice, artwork };
  currentOfflineFilename = filename;

  // Artwork + fond flou
  const img = artwork || 'assets/logo.png';
  document.getElementById('player-artwork-img').src = img;
  document.getElementById('player-bg').style.backgroundImage = 'url(' + img + ')';

  // Infos
  document.getElementById('player-title').textContent = title;
  document.getElementById('player-meta').textContent = parcours + ' · ' + duration;
  document.getElementById('player-voice-tag').textContent = voice === 'feminine' ? 'Voix féminine — Daïdrée' : 'Voix masculine — César';

  // Reset UI
  document.getElementById('complete-screen').classList.remove('visible');
  document.getElementById('player-main').classList.remove('hidden');
  document.getElementById('player-main').style.display = 'flex';
  document.getElementById('progress-fill').style.width = '0%';
  document.getElementById('progress-thumb').style.left = '0%';
  document.getElementById('time-current').textContent = '0:00';
  document.getElementById('time-total').textContent = '--:--';
  document.getElementById('audio-loading').textContent = 'Chargement…';
  document.getElementById('options-sheet').classList.remove('open');

  // Restore offline button state
  updateOfflineBtnState();

  // Set background color per parcours
  const parcoursMap = {
    'Premiers pas': 'premiers-pas',
    'Calme & Stress': 'stress',
    'Sommeil': 'sommeil',
    'Respirer': 'respirer',
    'Anxiété': 'anxiete',
    'Concentration': 'concentration'
  };
  const playerEl = document.getElementById('player-screen');
  // Remove previous parcours attrs
  Object.values(parcoursMap).forEach(v => playerEl.removeAttribute('data-parcours') );
  const pKey = parcoursMap[parcours] || 'premiers-pas';
  playerEl.setAttribute('data-parcours', pKey);
  // Set artwork as blurred background
  document.getElementById('player-bg').style.backgroundImage = artwork ? 'url(' + artwork + ')' : '';

  openPlayerScreen();

  audio.src = 'assets/audio/' + (voice === 'feminine' ? 'feminin' : 'masculin') + '/' + encodeURIComponent(filename);
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
  // Timer mode
  const timerDisplay = document.getElementById('timer-display');
  if (timerDisplay && timerDisplay.style.display === 'flex') {
    if (timerRunning) {
      timerRunning = false;
      clearInterval(timerInterval);
      updatePlayIcon(false);
    } else {
      timerRunning = true;
      timerInterval = setInterval(timerTick, 1000);
      updatePlayIcon(true);
    }
    return;
  }
  // Guided session mode
  if (!audio.src || audio.src === window.location.href) {
    if (!currentAmbiance) return;
    if (ambianceAudio.paused) { ambianceAudio.play().catch(() => {}); updatePlayIcon(true); }
    else { ambianceAudio.pause(); updatePlayIcon(false); }
    return;
  }
  if (audio.paused) {
    audio.play();
    if (currentAmbiance) ambianceAudio.play().catch(() => {});
    updatePlayIcon(true);
  } else {
    audio.pause();
    ambianceAudio.pause();
    updatePlayIcon(false);
  }
}

function updatePlayIcon(playing) {
  document.getElementById('icon-play').style.display = playing ? 'none' : '';
  document.getElementById('icon-pause').style.display = playing ? '' : 'none';
}

// Vitesse avec cycle depuis toolbar
const SPEEDS = [0.7, 0.8, 0.9, 1.0];
let currentSpeedIdx = 3;

function cycleSpeed() {
  currentSpeedIdx = (currentSpeedIdx + 1) % SPEEDS.length;
  setSpeed(SPEEDS[currentSpeedIdx]);
}

function setSpeed(s) {
  audio.playbackRate = s;
  currentSpeedIdx = SPEEDS.indexOf(s);
  if (currentSpeedIdx === -1) currentSpeedIdx = 3;
  const label = s === 1.0 ? '1×' : s + '×';
  document.getElementById('speed-display').textContent = label;
  document.querySelectorAll('.speed-btn').forEach(b => {
    b.classList.toggle('active', parseFloat(b.textContent.replace('×','')) === s);
  });
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
  document.getElementById('player-main').style.display = 'none';
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

function replaySession() {
  document.getElementById('complete-screen').classList.remove('visible');
  document.getElementById('player-main').classList.remove('hidden');
  document.getElementById('player-main').style.display = 'flex';
  audio.currentTime = 0;
  audio.play();
  if (currentAmbiance) ambianceAudio.play().catch(() => {});
}

// ── OFFLINE depuis le player ──
async function toolbarOffline() {
  if (!currentOfflineFilename) return;
  const btn = document.getElementById('toolbar-offline-btn');
  if (!('caches' in window)) { alert('Cache non disponible sur ce navigateur.'); return; }
  try {
    const cache = await caches.open('serein-audio-v1');
    const url = 'assets/audio/masculin/' + encodeURIComponent(currentOfflineFilename);
    const existing = await cache.match(url);
    if (existing) {
      await cache.delete(url);
      btn.classList.remove('active');
    } else {
      await cache.add(url);
      btn.classList.add('active');
    }
    updateOfflineCount();
  } catch(e) {}
}

async function updateOfflineBtnState() {
  if (!currentOfflineFilename || !('caches' in window)) return;
  try {
    const cache = await caches.open('serein-audio-v1');
    const url = 'assets/audio/masculin/' + encodeURIComponent(currentOfflineFilename);
    const existing = await cache.match(url);
    const btn = document.getElementById('toolbar-offline-btn');
    btn.classList.toggle('active', !!existing);
  } catch(e) {}
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

// ── OFFLINE CACHE (liste explore) ──
async function toggleOfflineCache(btn, filename) {
  if (!('caches' in window)) { alert('Cache non disponible sur ce navigateur.'); return; }
  btn.classList.add('loading');
  try {
    const cache = await caches.open('serein-audio-v1');
    const url = 'assets/audio/masculin/' + encodeURIComponent(filename);
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
    const btns = Array.from(document.querySelectorAll('.btn-offline[data-filename]'));
    await Promise.all(btns.map(async btn => {
      const fn = btn.dataset.filename;
      if (!fn) return;
      const match = await cache.match('assets/audio/masculin/' + encodeURIComponent(fn));
      if (match) { btn.classList.add('cached'); btn.textContent = '✓'; }
    }));
  } catch(e) {}
}

// ── STATS ──
function loadStats() {
  const s = JSON.parse(localStorage.getItem('serein-stats') || '{"sessions":0,"minutes":0,"lastDate":"","streak":0}');
  const hasSession = (s.sessions || 0) > 0;
  const welcomeBlock = document.getElementById('welcome-block');
  const statsBlock = document.getElementById('stats-block');
  if (welcomeBlock) welcomeBlock.style.display = hasSession ? 'none' : 'block';
  if (statsBlock) statsBlock.style.display = hasSession ? 'flex' : 'none';
  document.getElementById('stat-sessions').textContent = s.sessions || 0;
  document.getElementById('stat-time').textContent = (s.minutes || 0) + ' min';
  document.getElementById('stat-streak').textContent = s.streak || 0;
}

function recordCompletion() {
  const s = JSON.parse(localStorage.getItem('serein-stats') || '{"sessions":0,"minutes":0,"lastDate":"","streak":0}');
  s.sessions = (s.sessions || 0) + 1;
  const dur = currentSession ? (parseFloat(currentSession.duration) || Math.round((audio.duration || 0) / 60)) : 0;
  s.minutes = (s.minutes || 0) + dur;
  const today = new Date().toISOString().slice(0,10);
  if (s.lastDate === today) {
    // même jour
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
  document.documentElement.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.getElementById('theme-toggle').textContent = dark ? '🌙 Sombre' : '☀️ Clair';
  localStorage.setItem('serein-theme', dark ? 'light' : 'dark');
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
    'court':  { title: 'SOS Stress en 6 minutes', parcours: 'Calme & Stress', duration: '6 min', file: 'SOS Stress en 6 minutes.mp3', fileFem: false, emoji: '😮‍💨', artwork: 'assets/illustrations/Illustrations site-02.webp' },
    'moyen':  { title: 'La cohérence cardiaque guidée', parcours: 'Calme & Stress', duration: '5 min', file: 'Cohérence cardiaque 5 minutes.mp3', fileFem: false, emoji: '💚', artwork: 'assets/illustrations/Illustrations site-02.webp' },
    'long':   { title: 'La cohérence cardiaque guidée', parcours: 'Calme & Stress', duration: '5 min', file: 'Cohérence cardiaque 5 minutes.mp3', fileFem: false, emoji: '💚', artwork: 'assets/illustrations/Illustrations site-02.webp' }
  },
  'anxiete': {
    'court':  { title: 'SOS Anxiété — ancrage immédiat', parcours: 'Anxiété', duration: '5 min', file: 'SOS Anxiété ancrage immédiat.mp3', fileFem: false, emoji: '🌀', artwork: 'assets/illustrations/Illustrations site-05.webp' },
    'moyen':  { title: 'Respiration 4-7-8 — calme profond', parcours: 'Respirer', duration: '6 min', file: 'Respiration 4-7-8 — Calme profond.mp3', fileFem: false, emoji: '🌬️', artwork: 'assets/illustrations/Illustrations site-04.webp' },
    'long':   { title: 'La pensée qui tourne en boucle', parcours: 'Anxiété', duration: '8 min', file: 'La pensée qui tourne en boucle.mp3', fileFem: 'La pensée qui tourne en boucle.mp3', emoji: '🧠', artwork: 'assets/illustrations/Illustrations site-05.webp' }
  },
  'fatigue': {
    'court':  { title: 'Première respiration consciente', parcours: 'Premiers pas', duration: '5 min', file: 'Méditation Premiere Respiration Consciente.mp3', fileFem: false, emoji: '🌱', artwork: 'assets/illustrations/Illustrations site-01.webp' },
    'moyen':  { title: 'Le scan corporel — découvrir ses sensations', parcours: 'Premiers pas', duration: '10 min', file: 'Le scan corporel.mp3', fileFem: 'Le scan corporel — découvrir ses sensations.mp3', emoji: '🌿', artwork: 'assets/illustrations/Illustrations site-01.webp' },
    'long':   { title: 'Réveils nocturnes — retrouver le calme', parcours: 'Sommeil', duration: '18 min', file: 'Reveils nocturnes.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/Illustrations site-03.webp' }
  },
  'brouillard': {
    'court':  { title: "S'asseoir, ne rien faire", parcours: 'Premiers pas', duration: '5 min', file: 'Revenir au souffle.mp3', fileFem: false, emoji: '🧘', artwork: 'assets/illustrations/Illustrations site-01.webp' },
    'moyen':  { title: 'Observer ses pensées sans les juger', parcours: 'Premiers pas', duration: '9 min', file: 'Observer ses pensées sans les juger.mp3', fileFem: 'Observer ses pensées sans les juger.mp3', emoji: '👁️', artwork: 'assets/illustrations/Illustrations site-01.webp' },
    'long':   { title: 'Observer ses pensées sans les juger', parcours: 'Premiers pas', duration: '9 min', file: 'Observer ses pensées sans les juger.mp3', fileFem: 'Observer ses pensées sans les juger.mp3', emoji: '👁️', artwork: 'assets/illustrations/Illustrations site-01.webp' }
  },
  'sommeil': {
    'court':  { title: 'Rituel de déconnexion', parcours: 'Sommeil', duration: '10 min', file: 'Préparer le sommeil.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/Illustrations site-03.webp' },
    'moyen':  { title: 'Rituel de déconnexion', parcours: 'Sommeil', duration: '10 min', file: 'Préparer le sommeil.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/Illustrations site-03.webp' },
    'long':   { title: 'Réveils nocturnes — retrouver le calme', parcours: 'Sommeil', duration: '18 min', file: 'Reveils nocturnes.mp3', fileFem: false, emoji: '💤', artwork: 'assets/illustrations/Illustrations site-03.webp' }
  },
  'concentration': {
    'court':  { title: 'Mise en route mentale', parcours: 'Concentration', duration: '7 min', file: 'Mise en route mentale.mp3', fileFem: false, emoji: '🎯', artwork: 'assets/illustrations/Illustrations site-06.webp' },
    'moyen':  null,
    'long':   null
  }
};

let guideMood = null;
let guideInitialized = false;

function initGuide() {
  if (guideInitialized) return;
  guideInitialized = true;
  guideMood = null;
  const win = document.getElementById('chat-window');
  const res = document.getElementById('guide-result');
  win.innerHTML = ''; res.style.display = 'none'; res.innerHTML = '';
  setTimeout(() => addBotBubble('Bonjour 👋 Comment tu te sens en ce moment\u00a0?'), 200);
  setTimeout(() => addChoices([
    { label: '😮‍💨 Stressé(e)', value: 'stress' },
    { label: '😰 Anxieux/se', value: 'anxiete' },
    { label: '😴 Fatigué(e)', value: 'fatigue' },
    { label: '😶 Brouillard mental', value: 'brouillard' },
    { label: '🌙 Difficultés à dormir', value: 'sommeil' },
    { label: '🎯 Besoin de concentration', value: 'concentration' }
  ], onMoodChoice), 600);
}

function onMoodChoice(value) {
  guideMood = value;
  const labels = { stress: 'Stressé(e)', anxiete: 'Anxieux/se', fatigue: 'Fatigué(e)', brouillard: 'Brouillard mental', sommeil: 'Difficultés à dormir', concentration: 'Besoin de concentration' };
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
  if (!rec) { setTimeout(() => addBotBubble('Pas encore de séance disponible pour ce profil, mais ça arrive bientôt !'), 400); return; }
  setTimeout(() => {
    addBotBubble('Voilà ce que je te recommande\u00a0:');
    setTimeout(() => showGuideResult(rec), 400);
  }, 400);
}

let pendingGuideRec = null;

function showGuideResult(rec) {
  const res = document.getElementById('guide-result');
  res.style.display = 'block';
  pendingGuideRec = rec;
  res.innerHTML = [
    '<div class="guide-result-card">',
    '  <div class="result-emoji">' + rec.emoji + '</div>',
    '  <h3>' + rec.title + '</h3>',
    '  <p class="result-meta">' + rec.parcours + ' · ' + rec.duration + '</p>',
    '  <button class="btn btn-primary" style="width:100%" id="guide-launch-btn">▶ Lancer cette séance</button>',
    '  <button class="guide-restart" onclick="restartGuide()">↩ Recommencer</button>',
    '</div>'
  ].join('');
  document.getElementById('guide-launch-btn').addEventListener('click', () => {
    if (!pendingGuideRec) return;
    openVoiceOverlay('guide-rec', pendingGuideRec.title, pendingGuideRec.parcours, pendingGuideRec.duration, pendingGuideRec.file, pendingGuideRec.fileFem || false, pendingGuideRec.artwork);
  });
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
  win.appendChild(div); win.scrollTop = win.scrollHeight;
}

function addUserBubble(text) {
  const win = document.getElementById('chat-window');
  const div = document.createElement('div');
  div.className = 'chat-bubble user'; div.textContent = text;
  win.appendChild(div); win.scrollTop = win.scrollHeight;
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
  win.appendChild(wrap); win.scrollTop = win.scrollHeight;
}

function clearChoices() {
  const el = document.getElementById('current-choices');
  if (el) el.remove();
}


// ── MINUTEUR LIBRE ──
let timerInterval = null;
let timerSecondsLeft = 0;
let timerTotalSeconds = 0;
let timerRunning = false;
const bell = new Audio('assets/audio/cloche.mp3');

function openTimerSheet() {
  document.getElementById('timer-sheet-backdrop').classList.add('open');
}

function closeTimerSheet() {
  document.getElementById('timer-sheet-backdrop').classList.remove('open');
}

function startTimer(minutes) {
  closeTimerSheet();
  timerTotalSeconds = minutes * 60;
  timerSecondsLeft = timerTotalSeconds;
  timerRunning = false;

  // Configure player for timer mode
  const playerEl = document.getElementById('player-screen');
  Object.values({a:'premiers-pas',b:'stress',c:'sommeil',d:'respirer',e:'anxiete',f:'concentration'})
    .forEach(v => playerEl.removeAttribute('data-parcours'));
  playerEl.setAttribute('data-parcours', 'timer');
  document.getElementById('player-bg').style.backgroundImage = '';

  // Hide guided player UI, show timer UI
  document.getElementById('player-artwork-wrap').style.display = 'none';
  document.getElementById('timer-display').style.display = 'flex';
  document.getElementById('player-progress').style.display = 'none';

  // Update header info
  document.getElementById('player-title').textContent = 'Minuteur libre';
  document.getElementById('player-meta').textContent = minutes + ' min · Méditation silencieuse';
  document.getElementById('player-voice-tag').style.display = 'none';
  document.getElementById('audio-loading').textContent = '';

  // Update ring
  updateTimerDisplay();

  // Reset complete screen
  document.getElementById('complete-screen').classList.remove('visible');
  document.getElementById('player-main').classList.remove('hidden');
  document.getElementById('player-main').style.display = 'flex';

  openPlayerScreen();

  // Ring bell to start, then auto-play
  bell.currentTime = 0;
  bell.play().catch(() => {});
  setTimeout(() => {
    timerRunning = true;
    updatePlayIcon(true);
    timerInterval = setInterval(timerTick, 1000);
  }, 1500);
}

function timerTick() {
  if (!timerRunning) return;
  timerSecondsLeft--;
  updateTimerDisplay();
  if (timerSecondsLeft <= 0) {
    clearInterval(timerInterval);
    timerRunning = false;
    updatePlayIcon(false);
    // Ring bell to end
    bell.currentTime = 0;
    bell.play().catch(() => {});
    setTimeout(() => {
      document.getElementById('player-main').style.display = 'none';
      document.getElementById('player-main').classList.add('hidden');
      document.getElementById('complete-screen').classList.add('visible');
      document.getElementById('complete-title').textContent = 'Minuteur libre · ' + (timerTotalSeconds / 60) + ' min';
      recordTimerCompletion();
    }, 2500);
  }
}

function updateTimerDisplay() {
  const m = Math.floor(timerSecondsLeft / 60);
  const s = timerSecondsLeft % 60;
  document.getElementById('timer-countdown').textContent = m + ':' + String(s).padStart(2, '0');
  document.getElementById('timer-total').textContent = (timerTotalSeconds / 60) + ' min';
  // Ring progress
  const circumference = 603;
  const progress = timerSecondsLeft / timerTotalSeconds;
  const offset = circumference * (1 - progress);
  document.getElementById('timer-ring').style.strokeDashoffset = offset;
}

function recordTimerCompletion() {
  const s = JSON.parse(localStorage.getItem('serein-stats') || '{"sessions":0,"minutes":0,"lastDate":"","streak":0}');
  s.sessions = (s.sessions || 0) + 1;
  s.minutes = (s.minutes || 0) + Math.round(timerTotalSeconds / 60);
  const today = new Date().toISOString().slice(0,10);
  if (s.lastDate !== today) {
    if (s.lastDate === new Date(Date.now() - 86400000).toISOString().slice(0,10)) {
      s.streak = (s.streak || 0) + 1;
    } else {
      s.streak = 1;
    }
    s.lastDate = today;
  }
  localStorage.setItem('serein-stats', JSON.stringify(s));
  loadStats();
}

// togglePlay timer handling is inline below

// closePlayer handles timer cleanup directly — no override needed


// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  loadStats();
  restoreOfflineButtons();
  updateOfflineCount();
});
