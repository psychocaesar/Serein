// ── GLOBALS ──
let timerInterval = null;
let timerSecondsLeft = 0;
let timerTotalSeconds = 0;
let timerRunning = false;
let currentAmbiance = null;

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

  // Si une séance d'observation était en cours, débloquer le guide
  if (typeof guideInitialized !== 'undefined') {
    guideInitialized = false;
    guideMood = null;
    guideDuration = null;
    guideContext = null;
  }
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
  // Background is handled by CSS gradients per parcours — clear any leftover image
  document.getElementById('player-bg').style.backgroundImage = '';

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
    const cache = await caches.open('serein-v2-audio');
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
  } catch(e) { console.warn('[Serein cache]', e); }
}

async function updateOfflineBtnState() {
  if (!currentOfflineFilename || !('caches' in window)) return;
  try {
    const cache = await caches.open('serein-v2-audio');
    const url = 'assets/audio/masculin/' + encodeURIComponent(currentOfflineFilename);
    const existing = await cache.match(url);
    const btn = document.getElementById('toolbar-offline-btn');
    btn.classList.toggle('active', !!existing);
  } catch(e) { console.warn('[Serein cache]', e); }
}

// ── AMBIANCE ──
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
    const cache = await caches.open('serein-v2-audio');
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
    console.warn('[Serein cache]', e);
    alert('Erreur lors de la mise en cache. Vérifiez l\'espace disponible.');
  }
}

async function updateOfflineCount() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open('serein-v2-audio');
    const keys = await cache.keys();
    const tag = document.getElementById('offline-count-tag');
    if (tag) tag.textContent = keys.length + ' séance' + (keys.length > 1 ? 's' : '');
  } catch(e) { console.warn('[Serein cache]', e); }
}

async function restoreOfflineButtons() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open('serein-v2-audio');
    const btns = Array.from(document.querySelectorAll('.btn-offline[data-filename]'));
    await Promise.all(btns.map(async btn => {
      const fn = btn.dataset.filename;
      if (!fn) return;
      const match = await cache.match('assets/audio/masculin/' + encodeURIComponent(fn));
      if (match) { btn.classList.add('cached'); btn.textContent = '✓'; }
    }));
  } catch(e) { console.warn('[Serein cache]', e); }
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
  const today = new Date().toLocaleDateString('fr-CA');
  if (s.lastDate === today) {
    // même jour
  } else if (s.lastDate === new Date(Date.now() - 86400000).toLocaleDateString('fr-CA')) {
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
// Chaque entrée peut avoir une recommendation principale + alternatives
// Format: { main: {...}, alts: [{...}, {...}] }
const GUIDE_MAP = {
  'stress': {
    'court': {
      'corps': {
        main: { title: 'La cohérence cardiaque guidée', parcours: 'Calme & Stress', duration: '5 min', file: 'Cohérence cardiaque 5 minutes.mp3', fileFem: false, emoji: '💚', artwork: 'assets/illustrations/player-02.jpg', reason: "Régule le système nerveux en quelques respirations" },
        alts: [{ title: 'SOS Stress en 6 minutes', parcours: 'Calme & Stress', duration: '6 min', file: 'SOS Stress en 6 minutes.mp3', fileFem: false, emoji: '😮‍💨', artwork: 'assets/illustrations/player-02.jpg', reason: 'Court et ciblé pour couper la tension physique' }]
      },
      'tete': {
        main: { title: 'SOS Stress en 6 minutes', parcours: 'Calme & Stress', duration: '6 min', file: 'SOS Stress en 6 minutes.mp3', fileFem: false, emoji: '😮‍💨', artwork: 'assets/illustrations/player-02.jpg', reason: "Rapide et ciblé pour couper le mental net" },
        alts: [{ title: "Revenir à l'instant présent", parcours: 'Premiers pas', duration: '5 min', file: "Revenir à l'instant présent.mp3", fileFem: false, emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: "Pour ancrer l'attention ici et maintenant" }]
      },
      'default': {
        main: { title: 'SOS Stress en 6 minutes', parcours: 'Calme & Stress', duration: '6 min', file: 'SOS Stress en 6 minutes.mp3', fileFem: false, emoji: '😮‍💨', artwork: 'assets/illustrations/player-02.jpg', reason: 'Rapide et ciblé pour couper le stress net' },
        alts: [{ title: "Revenir à l'instant présent", parcours: 'Premiers pas', duration: '5 min', file: "Revenir à l'instant présent.mp3", fileFem: false, emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: "Pour ancrer l'attention ici et maintenant" }]
      }
    },
    'moyen': {
      'corps': {
        main: { title: 'Le scan corporel — découvrir ses sensations', parcours: 'Premiers pas', duration: '10 min', file: 'Le scan corporel.mp3', fileFem: 'Le scan corporel — découvrir ses sensations.mp3', emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: "Relâche les tensions physiques stockées dans le corps" },
        alts: [{ title: 'La cohérence cardiaque guidée', parcours: 'Calme & Stress', duration: '5 min', file: 'Cohérence cardiaque 5 minutes.mp3', fileFem: false, emoji: '💚', artwork: 'assets/illustrations/player-02.jpg', reason: "Régule le système nerveux rapidement" }]
      },
      'tete': {
        main: { title: 'La cohérence cardiaque guidée', parcours: 'Calme & Stress', duration: '5 min', file: 'Cohérence cardiaque 5 minutes.mp3', fileFem: false, emoji: '💚', artwork: 'assets/illustrations/player-02.jpg', reason: 'Régule le système nerveux en quelques minutes' },
        alts: [{ title: "Lâcher prise sur l'urgence", parcours: 'Calme & Stress', duration: '7 min', file: 'Lacher prise sur lurgence.mp3', fileFem: false, emoji: '⏳', artwork: 'assets/illustrations/player-02.jpg', reason: "Pour sortir du mode urgence mental" }]
      },
      'default': {
        main: { title: 'La cohérence cardiaque guidée', parcours: 'Calme & Stress', duration: '5 min', file: 'Cohérence cardiaque 5 minutes.mp3', fileFem: false, emoji: '💚', artwork: 'assets/illustrations/player-02.jpg', reason: 'Régule le système nerveux en quelques minutes' },
        alts: [{ title: "Lâcher prise sur l'urgence", parcours: 'Calme & Stress', duration: '7 min', file: 'Lacher prise sur lurgence.mp3', fileFem: false, emoji: '⏳', artwork: 'assets/illustrations/player-02.jpg', reason: "Pour sortir du mode urgence" }]
      }
    },
    'long': {
      'corps': {
        main: { title: 'Le scan corporel — découvrir ses sensations', parcours: 'Premiers pas', duration: '10 min', file: 'Le scan corporel.mp3', fileFem: 'Le scan corporel — découvrir ses sensations.mp3', emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: "Pour relâcher en profondeur les tensions physiques" },
        alts: [{ title: 'Le corps qui tient le stress', parcours: 'Calme & Stress', duration: '10 min', file: 'Le corps qui tient le stress.mp3', fileFem: false, emoji: '💆', artwork: 'assets/illustrations/player-02.jpg', reason: "Travaille directement sur les tensions corporelles du stress" }]
      },
      'tete': {
        main: { title: "Lâcher prise sur l'urgence", parcours: 'Calme & Stress', duration: '7 min', file: 'Lacher prise sur lurgence.mp3', fileFem: false, emoji: '⏳', artwork: 'assets/illustrations/player-02.jpg', reason: "Pour déposer le mental en mode urgence" },
        alts: [{ title: 'Le scan corporel — découvrir ses sensations', parcours: 'Premiers pas', duration: '10 min', file: 'Le scan corporel.mp3', fileFem: 'Le scan corporel — découvrir ses sensations.mp3', emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: "Redescendre dans le corps pour sortir du mental" }]
      },
      'default': {
        main: { title: 'La cohérence cardiaque guidée', parcours: 'Calme & Stress', duration: '5 min', file: 'Cohérence cardiaque 5 minutes.mp3', fileFem: false, emoji: '💚', artwork: 'assets/illustrations/player-02.jpg', reason: 'Régule le système nerveux en profondeur' },
        alts: [{ title: 'Le scan corporel — découvrir ses sensations', parcours: 'Premiers pas', duration: '10 min', file: 'Le scan corporel.mp3', fileFem: 'Le scan corporel — découvrir ses sensations.mp3', emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: 'Pour relâcher les tensions physiques du stress' }]
      }
    }
  },
  'anxiete': {
    'court': {
      'soudaine': {
        main: { title: 'SOS Anxiété — ancrage immédiat', parcours: 'Anxiété', duration: '5 min', file: 'SOS Anxiété ancrage immédiat.mp3', fileFem: false, emoji: '🌀', artwork: 'assets/illustrations/player-05.jpg', reason: "Technique d'ancrage pour calmer l'agitation vite" },
        alts: [{ title: 'Respiration 4-7-8 — calme profond', parcours: 'Respirer', duration: '6 min', file: 'Respiration 4-7-8 — Calme profond.mp3', fileFem: false, emoji: '🌬️', artwork: 'assets/illustrations/player-04.jpg', reason: "Active le système parasympathique rapidement" }]
      },
      'fond': {
        main: { title: "Revenir à l'instant présent", parcours: 'Premiers pas', duration: '5 min', file: "Revenir à l'instant présent.mp3", fileFem: false, emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: "Pour sortir du flot de pensées anxieuses de fond" },
        alts: [{ title: 'SOS Anxiété — ancrage immédiat', parcours: 'Anxiété', duration: '5 min', file: 'SOS Anxiété ancrage immédiat.mp3', fileFem: false, emoji: '🌀', artwork: 'assets/illustrations/player-05.jpg', reason: "Ancrage sensoriel pour calmer le fond d'inquiétude" }]
      },
      'default': {
        main: { title: 'SOS Anxiété — ancrage immédiat', parcours: 'Anxiété', duration: '5 min', file: 'SOS Anxiété ancrage immédiat.mp3', fileFem: false, emoji: '🌀', artwork: 'assets/illustrations/player-05.jpg', reason: "Technique d'ancrage pour calmer l'agitation vite" },
        alts: [{ title: "Revenir à l'instant présent", parcours: 'Premiers pas', duration: '5 min', file: "Revenir à l'instant présent.mp3", fileFem: false, emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: 'Pour sortir du flot de pensées anxieuses' }]
      }
    },
    'moyen': {
      'soudaine': {
        main: { title: 'Respiration 4-7-8 — calme profond', parcours: 'Respirer', duration: '6 min', file: 'Respiration 4-7-8 — Calme profond.mp3', fileFem: false, emoji: '🌬️', artwork: 'assets/illustrations/player-04.jpg', reason: "La respiration 4-7-8 active le système parasympathique" },
        alts: [{ title: 'Les sons autour de toi', parcours: 'Anxiété', duration: '7 min', file: 'Les sons autour de toi.mp3', fileFem: 'Les sons autour de toi.mp3', emoji: '👂', artwork: 'assets/illustrations/player-05.jpg', reason: "Recentre l'attention sur le présent par les sens" }]
      },
      'fond': {
        main: { title: 'Les sons autour de toi', parcours: 'Anxiété', duration: '7 min', file: 'Les sons autour de toi.mp3', fileFem: 'Les sons autour de toi.mp3', emoji: '👂', artwork: 'assets/illustrations/player-05.jpg', reason: "Ancrage sensoriel pour sortir du fond d'inquiétude" },
        alts: [{ title: 'Respiration 4-7-8 — calme profond', parcours: 'Respirer', duration: '6 min', file: 'Respiration 4-7-8 — Calme profond.mp3', fileFem: false, emoji: '🌬️', artwork: 'assets/illustrations/player-04.jpg', reason: "Régule le souffle pour apaiser l'inquiétude chronique" }]
      },
      'default': {
        main: { title: 'Respiration 4-7-8 — calme profond', parcours: 'Respirer', duration: '6 min', file: 'Respiration 4-7-8 — Calme profond.mp3', fileFem: false, emoji: '🌬️', artwork: 'assets/illustrations/player-04.jpg', reason: "La respiration 4-7-8 active le système parasympathique" },
        alts: [{ title: 'Les sons autour de toi', parcours: 'Anxiété', duration: '7 min', file: 'Les sons autour de toi.mp3', fileFem: 'Les sons autour de toi.mp3', emoji: '👂', artwork: 'assets/illustrations/player-05.jpg', reason: "Recentre l'attention sur le présent par les sens" }]
      }
    },
    'long': {
      'soudaine': {
        main: { title: 'Mon corps face à la peur', parcours: 'Anxiété', duration: '5 min', file: 'Mon corps face à la peur.mp3', fileFem: false, emoji: '🤍', artwork: 'assets/illustrations/player-05.jpg', reason: "Travailler directement la réaction physique à l'anxiété soudaine" },
        alts: [{ title: 'La pensée qui tourne en boucle', parcours: 'Anxiété', duration: '8 min', file: 'La pensée qui tourne en boucle.mp3', fileFem: 'La pensée qui tourne en boucle.mp3', emoji: '🧠', artwork: 'assets/illustrations/player-05.jpg', reason: "Pour travailler sur les ruminations qui alimentent l'anxiété" }]
      },
      'fond': {
        main: { title: 'La pensée qui tourne en boucle', parcours: 'Anxiété', duration: '8 min', file: 'La pensée qui tourne en boucle.mp3', fileFem: 'La pensée qui tourne en boucle.mp3', emoji: '🧠', artwork: 'assets/illustrations/player-05.jpg', reason: 'Pour travailler directement sur les ruminations de fond' },
        alts: [{ title: "Accueillir l'anxiété sans la combattre", parcours: 'Anxiété', duration: '10 min', file: "Accueillir l'anxiété sans la combattre.mp3", fileFem: false, emoji: '🤍', artwork: 'assets/illustrations/player-05.jpg', reason: 'Approche douce — laisser passer plutôt que résister' }]
      },
      'default': {
        main: { title: 'La pensée qui tourne en boucle', parcours: 'Anxiété', duration: '8 min', file: 'La pensée qui tourne en boucle.mp3', fileFem: 'La pensée qui tourne en boucle.mp3', emoji: '🧠', artwork: 'assets/illustrations/player-05.jpg', reason: 'Pour travailler directement sur les ruminations' },
        alts: [{ title: "Accueillir l'anxiété sans la combattre", parcours: 'Anxiété', duration: '10 min', file: "Accueillir l'anxiété sans la combattre.mp3", fileFem: false, emoji: '🤍', artwork: 'assets/illustrations/player-05.jpg', reason: 'Approche douce — laisser passer plutôt que résister' }]
      }
    }
  },
  'sommeil': {
    'court': {
      'precoucher': {
        main: { title: 'Rituel de déconnexion', parcours: 'Sommeil', duration: '10 min', file: 'Préparer le sommeil.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/player-03.jpg', reason: "Prépare le corps et l'esprit au coucher" },
        alts: [{ title: 'La cohérence cardiaque guidée', parcours: 'Calme & Stress', duration: '5 min', file: 'Cohérence cardiaque 5 minutes.mp3', fileFem: false, emoji: '💚', artwork: 'assets/illustrations/player-02.jpg', reason: "Pour calmer le système nerveux avant de dormir" }]
      },
      'reveil': {
        main: { title: 'Réveils nocturnes — retrouver le calme', parcours: 'Sommeil', duration: '18 min', file: 'Reveils nocturnes.mp3', fileFem: false, emoji: '💤', artwork: 'assets/illustrations/player-03.jpg', reason: "Spécialement conçu pour les réveils en pleine nuit" },
        alts: [{ title: 'Respiration 4-7-8 — calme profond', parcours: 'Respirer', duration: '6 min', file: 'Respiration 4-7-8 — Calme profond.mp3', fileFem: false, emoji: '🌬️', artwork: 'assets/illustrations/player-04.jpg', reason: 'Technique reconnue pour se rendormir rapidement' }]
      },
      'default': {
        main: { title: 'Rituel de déconnexion', parcours: 'Sommeil', duration: '10 min', file: 'Préparer le sommeil.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/player-03.jpg', reason: "Prépare le corps et l'esprit au coucher" },
        alts: [{ title: 'La cohérence cardiaque guidée', parcours: 'Calme & Stress', duration: '5 min', file: 'Cohérence cardiaque 5 minutes.mp3', fileFem: false, emoji: '💚', artwork: 'assets/illustrations/player-02.jpg', reason: "Pour calmer le système nerveux avant de dormir" }]
      }
    },
    'moyen': {
      'precoucher': {
        main: { title: 'Rituel de déconnexion', parcours: 'Sommeil', duration: '10 min', file: 'Préparer le sommeil.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/player-03.jpg', reason: "Coupe le flux mental de la journée" },
        alts: [{ title: 'Relâcher le corps, couche après couche', parcours: 'Sommeil', duration: '8 min', file: 'Relâcher le corps, couche après couche.mp3', fileFem: false, emoji: '😴', artwork: 'assets/illustrations/player-03.jpg', reason: "Relaxation progressive pour glisser vers le sommeil" }]
      },
      'reveil': {
        main: { title: 'Réveils nocturnes — retrouver le calme', parcours: 'Sommeil', duration: '18 min', file: 'Reveils nocturnes.mp3', fileFem: false, emoji: '💤', artwork: 'assets/illustrations/player-03.jpg', reason: "Spécialement conçu pour les réveils à 3h du matin" },
        alts: [{ title: 'Rituel de déconnexion', parcours: 'Sommeil', duration: '10 min', file: 'Préparer le sommeil.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/player-03.jpg', reason: "Pour se recoucher sereinement" }]
      },
      'default': {
        main: { title: 'Rituel de déconnexion', parcours: 'Sommeil', duration: '10 min', file: 'Préparer le sommeil.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/player-03.jpg', reason: "Coupe le flux mental de la journée" },
        alts: [{ title: 'Respiration 4-7-8 — calme profond', parcours: 'Respirer', duration: '6 min', file: 'Respiration 4-7-8 — Calme profond.mp3', fileFem: false, emoji: '🌬️', artwork: 'assets/illustrations/player-04.jpg', reason: "Technique reconnue pour faciliter l'endormissement" }]
      }
    },
    'long': {
      'precoucher': {
        main: { title: 'Sons & silence — endormissement profond', parcours: 'Sommeil', duration: '12 min', file: 'Sons & silence - endormissement profond.mp3', fileFem: false, emoji: '🌌', artwork: 'assets/illustrations/player-03.jpg', reason: "Accompagne doucement vers un endormissement profond" },
        alts: [{ title: 'Réveils nocturnes — retrouver le calme', parcours: 'Sommeil', duration: '18 min', file: 'Reveils nocturnes.mp3', fileFem: false, emoji: '💤', artwork: 'assets/illustrations/player-03.jpg', reason: "Pour une nuit complète apaisée" }]
      },
      'reveil': {
        main: { title: 'Réveils nocturnes — retrouver le calme', parcours: 'Sommeil', duration: '18 min', file: 'Reveils nocturnes.mp3', fileFem: false, emoji: '💤', artwork: 'assets/illustrations/player-03.jpg', reason: 'Pour les nuits agitées et les réveils à 3h' },
        alts: [{ title: 'Rituel de déconnexion', parcours: 'Sommeil', duration: '10 min', file: 'Préparer le sommeil.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/player-03.jpg', reason: 'Prépare en douceur un endormissement profond' }]
      },
      'default': {
        main: { title: 'Réveils nocturnes — retrouver le calme', parcours: 'Sommeil', duration: '18 min', file: 'Reveils nocturnes.mp3', fileFem: false, emoji: '💤', artwork: 'assets/illustrations/player-03.jpg', reason: 'Pour les nuits agitées et les réveils à 3h' },
        alts: [{ title: 'Rituel de déconnexion', parcours: 'Sommeil', duration: '10 min', file: 'Préparer le sommeil.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/player-03.jpg', reason: 'Prépare en douceur un endormissement profond' }]
      }
    }
  },
  // Humeurs sans Q3 — structure plate conservée
  'fatigue': {
    'court': {
      'default': {
        main: { title: "Revenir à l'instant présent", parcours: 'Premiers pas', duration: '5 min', file: "Revenir à l'instant présent.mp3", fileFem: false, emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: 'Court et doux pour recharger sans effort' },
        alts: [{ title: 'Première respiration consciente', parcours: 'Premiers pas', duration: '5 min', file: 'Méditation Premiere Respiration Consciente.mp3', fileFem: false, emoji: '🌱', artwork: 'assets/illustrations/player-01.jpg', reason: 'Idéal pour une première pause dans la journée' }]
      }
    },
    'moyen': {
      'default': {
        main: { title: 'La bienveillance envers soi', parcours: 'Premiers pas', duration: '5 min', file: 'La bienveillance envers soi.mp3', fileFem: false, emoji: '💚', artwork: 'assets/illustrations/player-01.jpg', reason: 'Pour se recharger en douceur sans se juger' },
        alts: [{ title: 'Le scan corporel — découvrir ses sensations', parcours: 'Premiers pas', duration: '10 min', file: 'Le scan corporel.mp3', fileFem: 'Le scan corporel — découvrir ses sensations.mp3', emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: 'Relâche les tensions physiques accumulées' }]
      }
    },
    'long': {
      'default': {
        main: { title: 'Réveils nocturnes — retrouver le calme', parcours: 'Sommeil', duration: '18 min', file: 'Reveils nocturnes.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/player-03.jpg', reason: "Si la fatigue vient d'un sommeil perturbé" },
        alts: [{ title: 'Mon ancre personnelle', parcours: 'Premiers pas', duration: '6 min', file: 'Mon ancre personnelle.mp3', fileFem: false, emoji: '⚓', artwork: 'assets/illustrations/player-01.jpg', reason: 'Pour trouver un point de stabilité dans la journée' }]
      }
    }
  },
  'brouillard': {
    'court': {
      'default': {
        main: { title: "S'asseoir, ne rien faire", parcours: 'Premiers pas', duration: '5 min', file: 'Revenir au souffle.mp3', fileFem: false, emoji: '🧘', artwork: 'assets/illustrations/player-01.jpg', reason: "Parfois s'arrêter suffit à y voir plus clair" },
        alts: [{ title: "Revenir à l'instant présent", parcours: 'Premiers pas', duration: '5 min', file: "Revenir à l'instant présent.mp3", fileFem: false, emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: "Pour sortir du flou en se recentrant sur le souffle" }]
      }
    },
    'moyen': {
      'default': {
        main: { title: 'Observer ses pensées sans les juger', parcours: 'Premiers pas', duration: '9 min', file: 'Observer ses pensées sans les juger.mp3', fileFem: 'Observer ses pensées sans les juger.mp3', emoji: '👁️', artwork: 'assets/illustrations/player-01.jpg', reason: "Prendre du recul sur le flux mental" },
        alts: [{ title: 'Mise en route mentale', parcours: 'Concentration', duration: '7 min', file: 'Mise en route mentale.mp3', fileFem: false, emoji: '🎯', artwork: 'assets/illustrations/player-06.jpg', reason: "Pour clarifier l'esprit et retrouver le focus" }]
      }
    },
    'long': {
      'default': {
        main: { title: 'Mon ancre personnelle', parcours: 'Premiers pas', duration: '6 min', file: 'Mon ancre personnelle.mp3', fileFem: false, emoji: '⚓', artwork: 'assets/illustrations/player-01.jpg', reason: "Construire un point de stabilité mental durable" },
        alts: [{ title: 'Observer ses pensées sans les juger', parcours: 'Premiers pas', duration: '9 min', file: 'Observer ses pensées sans les juger.mp3', fileFem: 'Observer ses pensées sans les juger.mp3', emoji: '👁️', artwork: 'assets/illustrations/player-01.jpg', reason: "Pour observer le brouillard sans s'y perdre" }]
      }
    }
  },
  'concentration': {
    'court': {
      'default': {
        main: { title: 'Mise en route mentale', parcours: 'Concentration', duration: '7 min', file: 'Mise en route mentale.mp3', fileFem: false, emoji: '🎯', artwork: 'assets/illustrations/player-06.jpg', reason: "Clarifie l'esprit avant une tâche importante" },
        alts: [{ title: "Revenir à l'instant présent", parcours: 'Premiers pas', duration: '5 min', file: "Revenir à l'instant présent.mp3", fileFem: false, emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: 'Plus court, pour une mise en route rapide' }]
      }
    },
    'moyen': {
      'default': {
        main: { title: 'Mise en route mentale', parcours: 'Concentration', duration: '7 min', file: 'Mise en route mentale.mp3', fileFem: false, emoji: '🎯', artwork: 'assets/illustrations/player-06.jpg', reason: "Prépare le mental à entrer dans la zone" },
        alts: [{ title: 'Observer ses pensées sans les juger', parcours: 'Premiers pas', duration: '9 min', file: 'Observer ses pensées sans les juger.mp3', fileFem: 'Observer ses pensées sans les juger.mp3', emoji: '👁️', artwork: 'assets/illustrations/player-01.jpg', reason: "Pour vider le mental avant de se concentrer" }]
      }
    },
    'long': {
      'default': {
        main: { title: 'Flow - entrer dans la zone', parcours: 'Concentration', duration: '10 min', file: 'Flow - entrer dans la zone.mp3', fileFem: false, emoji: '🌊', artwork: 'assets/illustrations/player-06.jpg', reason: 'Pour atteindre un état de concentration profonde' },
        alts: [{ title: 'Clarté mentale - faire le vide', parcours: 'Concentration', duration: '9 min', file: 'Clarté mentale - faire le vide.mp3', fileFem: false, emoji: '🧹', artwork: 'assets/illustrations/player-06.jpg', reason: "Prépare l'esprit avant une session de travail intense" }]
      }
    }
  }
};

let guideMood = null;
let guideInitialized = false;







let pendingGuideRec = null;

function showGuideResult(entry) {
  const res = document.getElementById('guide-result');
  res.style.display = 'block';
  pendingGuideRec = entry;

  function makeCard(rec, isMain) {
    const id = isMain ? 'guide-launch-main' : 'guide-launch-alt-' + rec.title.replace(/\s/g,'');
    const card = document.createElement('div');
    card.className = 'guide-rec-card' + (isMain ? ' guide-rec-main' : ' guide-rec-alt');

    const header = document.createElement('div');
    header.className = 'guide-rec-header';

    const emoji = document.createElement('span');
    emoji.className = 'guide-rec-emoji';
    emoji.textContent = rec.emoji;

    const info = document.createElement('div');
    info.className = 'guide-rec-info';

    const title = document.createElement('div');
    title.className = 'guide-rec-title';
    title.textContent = rec.title;

    const meta = document.createElement('div');
    meta.className = 'guide-rec-meta';
    meta.textContent = rec.parcours + ' · ' + rec.duration;

    info.appendChild(title);
    info.appendChild(meta);
    header.appendChild(emoji);
    header.appendChild(info);

    const reason = document.createElement('p');
    reason.className = 'guide-rec-reason';
    reason.textContent = rec.reason;

    const btn = document.createElement('button');
    btn.className = 'btn ' + (isMain ? 'btn-primary' : 'btn-ghost') + ' guide-rec-btn';
    btn.dataset.id = id;
    btn.style.width = '100%';
    btn.textContent = '▶ Lancer';
    btn.addEventListener('click', () => {
      openVoiceOverlay('guide-rec', rec.title, rec.parcours, rec.duration, rec.file, rec.fileFem || false, rec.artwork);
    });

    card.appendChild(header);
    card.appendChild(reason);
    card.appendChild(btn);
    return card;
  }

  res.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'guide-result-wrap';

  const labelMain = document.createElement('p');
  labelMain.className = 'guide-result-label';
  labelMain.textContent = 'Notre suggestion';
  wrap.appendChild(labelMain);
  wrap.appendChild(makeCard(entry.main, true));

  if (entry.alts && entry.alts.length > 0) {
    const labelAlt = document.createElement('p');
    labelAlt.className = 'guide-result-label';
    labelAlt.style.marginTop = '.9rem';
    labelAlt.textContent = 'Aussi adapté';
    wrap.appendChild(labelAlt);
    entry.alts.forEach(alt => wrap.appendChild(makeCard(alt, false)));
  }

  const restartBtn = document.createElement('button');
  restartBtn.className = 'guide-restart';
  restartBtn.textContent = '↩ Recommencer';
  restartBtn.addEventListener('click', restartGuide);
  wrap.appendChild(restartBtn);

  res.appendChild(wrap);

  res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function restartGuide() {
  guideInitialized = false;
  guideMood = null;
  guideDuration = null;
  guideContext = null;
  initGuide();
  document.getElementById('guide-result').style.display = 'none';
}

// ═══════════════════════════════════════════════════════
// PATCH GUIDE — 3 améliorations
// À intégrer dans app.js en remplacement des fonctions
// existantes du même nom.
//
// 1. Retour post-séance (feedback intensité)
// 2. Entrée en langage naturel
// 3. Mode "Je ne sais pas"
// ═══════════════════════════════════════════════════════


// ── 1. RETOUR POST-SÉANCE ────────────────────────────────
// Stocke le feedback intensité par profil humeur+durée+contexte
// Influence la prochaine recommandation via applyFeedbackToEntry()


// ── Filtrage horaire ──
function getCurrentHour() {
  return new Date().getHours();
}

function isConcentrationBlocked() {
  const h = getCurrentHour();
  return h >= 22 || h < 6;
}

// ── Historique local (15 jours) ──
function getRecentHistory() {
  try {
    const raw = localStorage.getItem('serein-history');
    if (!raw) return [];
    const all = JSON.parse(raw);
    const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
    return all.filter(e => e.ts > cutoff);
  } catch(e) { return []; }
}

function recordGuidePlay(title) {
  try {
    const history = getRecentHistory();
    history.push({ title, ts: Date.now() });
    localStorage.setItem('serein-history', JSON.stringify(history));
  } catch(e) {}
}

function wasRecentlyPlayed(title) {
  return getRecentHistory().some(e => e.title === title);
}

function applyHistoryToEntry(entry) {
  if (!entry) return entry;
  const result = { main: entry.main, alts: [...(entry.alts || [])] };
  if (wasRecentlyPlayed(result.main.title) && result.alts.length > 0) {
    const freshAltIdx = result.alts.findIndex(a => !wasRecentlyPlayed(a.title));
    if (freshAltIdx !== -1) {
      const fresh = result.alts[freshAltIdx];
      result.alts[freshAltIdx] = { ...result.main, reason: result.main.reason + ' (déjà écoutée récemment)' };
      result.main = fresh;
    }
  }
  return result;
}

// ── Q3 : questions contextuelles ──
const CONTEXT_QUESTIONS = {
  stress: {
    question: "Où tu le ressens le plus ?",
    choices: [
      { label: '💪 Dans le corps (tensions, mâchoire, épaules)', value: 'corps' },
      { label: '🧠 Dans la tête (pensées, ruminations)', value: 'tete' }
    ]
  },
  anxiete: {
    question: "C'est plutôt…",
    choices: [
      { label: '⚡ Une agitation soudaine', value: 'soudaine' },
      { label: '🌫 Un fond d\'inquiétude persistant', value: 'fond' }
    ]
  },
  sommeil: {
    question: 'Tu te prépares à dormir ou tu viens de te réveiller ?',
    choices: [
      { label: '🌙 Je me prépare à dormir', value: 'precoucher' },
      { label: '😳 Je viens de me réveiller', value: 'reveil' }
    ]
  }
};

function onContextChoice(value) {
  const contextLabels = {
    corps: 'Dans le corps', tete: 'Dans la tête',
    soudaine: 'Agitation soudaine', fond: "Fond d'inquiétude persistant",
    precoucher: 'Je me prépare à dormir', reveil: 'Je viens de me réveiller'
  };
  guideContext = value;
  addUserBubble(contextLabels[value] || value);
  clearChoices();
  askDuration();
}

function askDuration() {
  setTimeout(() => addBotBubble('Combien de temps as-tu ?'), 400);
  setTimeout(() => addChoices([
    { label: '⚡ 5 minutes', value: 'court' },
    { label: '🌿 5–10 minutes', value: 'moyen' },
    { label: '🌊 Plus de 10 minutes', value: 'long' }
  ], onDurationChoice), 800);
}

function saveFeedback(mood, duration, context, sessionTitle, rating) {
  // rating : 'intense' | 'ok' | 'doux'
  try {
    const key = 'serein-feedback';
    const raw = localStorage.getItem(key);
    const all = raw ? JSON.parse(raw) : [];
    all.push({
      mood, duration, context,
      title: sessionTitle,
      rating,
      ts: Date.now()
    });
    // Garder seulement les 60 derniers retours
    const trimmed = all.slice(-60);
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch(e) {}
}

function getIntensityBias(mood, duration, context) {
  // Retourne 'harder', 'softer', ou null selon les retours récents (30 jours)
  try {
    const raw = localStorage.getItem('serein-feedback');
    if (!raw) return null;
    const all = JSON.parse(raw);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const relevant = all.filter(e =>
      e.mood === mood &&
      e.duration === duration &&
      (e.context === context || !context) &&
      e.ts > cutoff
    );
    if (relevant.length < 2) return null; // pas assez de données

    const intense = relevant.filter(e => e.rating === 'intense').length;
    const doux = relevant.filter(e => e.rating === 'doux').length;
    const total = relevant.length;

    if (intense / total >= 0.5) return 'softer';
    if (doux / total >= 0.5) return 'harder';
    return null;
  } catch(e) { return null; }
}

// Applique le biais d'intensité : si trop intense → propose l'alt en main
function applyFeedbackToEntry(entry, mood, duration, context) {
  if (!entry) return entry;
  const bias = getIntensityBias(mood, duration, context);
  if (!bias || !entry.alts || entry.alts.length === 0) return entry;

  const result = { main: entry.main, alts: [...entry.alts] };

  if (bias === 'softer') {
    // Chercher un alt plus doux (durée plus courte ou parcours différent)
    const softerAlt = result.alts.find(a =>
      parseInt(a.duration) <= parseInt(result.main.duration)
    );
    if (softerAlt) {
      const idx = result.alts.indexOf(softerAlt);
      result.alts[idx] = { ...result.main, reason: result.main.reason + ' (ajusté selon vos retours)' };
      result.main = { ...softerAlt, reason: softerAlt.reason + ' — plus doux selon vos préférences' };
    }
  }
  return result;
}

// Affiche les boutons de feedback dans l'écran de fin
// À appeler depuis audio.addEventListener('ended') quand la séance vient du guide
function showGuideFeedback() {
  const completeScreen = document.getElementById('complete-screen');
  if (!completeScreen || !guideMood) return;

  // Supprimer un feedback existant si déjà affiché
  const existing = document.getElementById('guide-feedback-wrap');
  if (existing) existing.remove();

  const wrap = document.createElement('div');
  wrap.id = 'guide-feedback-wrap';
  wrap.style.cssText = 'margin-top:1.25rem;display:flex;flex-direction:column;align-items:center;gap:.6rem;width:100%;';

  const label = document.createElement('p');
  label.textContent = 'Cette séance était…';
  label.style.cssText = 'font-size:.75rem;color:rgba(255,255,255,.45);text-transform:uppercase;letter-spacing:.08em;';
  wrap.appendChild(label);

  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:.6rem;';

  const feedbacks = [
    { label: '😮 Trop intense', value: 'intense' },
    { label: '✓ C\'était bien',  value: 'ok'      },
    { label: '🌿 Trop doux',    value: 'doux'     },
  ];

  feedbacks.forEach(f => {
    const btn = document.createElement('button');
    btn.textContent = f.label;
    btn.style.cssText = [
      'background:rgba(255,255,255,.1)',
      'border:1px solid rgba(255,255,255,.2)',
      'border-radius:999px',
      'color:rgba(255,255,255,.85)',
      'padding:.4rem .85rem',
      'font-size:.78rem',
      'cursor:pointer',
      'transition:all .18s',
    ].join(';');
    btn.addEventListener('click', () => {
      if (currentSession) {
        saveFeedback(guideMood, guideDuration, guideContext, currentSession.title, f.value);
        recordGuidePlay(currentSession.title);
      }
      // Remplacer les boutons par un message de confirmation discret
      wrap.innerHTML = '';
      const thanks = document.createElement('p');
      thanks.textContent = 'Merci, j\'en tiens compte pour la prochaine fois.';
      thanks.style.cssText = 'font-size:.78rem;color:rgba(255,255,255,.4);font-style:italic;';
      wrap.appendChild(thanks);
    });
    btns.appendChild(btn);
  });

  wrap.appendChild(btns);

  // Insérer avant les boutons d'action existants
  const completeActions = completeScreen.querySelector('.complete-actions');
  if (completeActions) {
    completeScreen.insertBefore(wrap, completeActions);
  } else {
    completeScreen.appendChild(wrap);
  }
}


// ── 2. ENTRÉE EN LANGAGE NATUREL ────────────────────────
// Matching local de mots-clés → humeur
// Pas d'API, pas de réseau

const KEYWORD_MAP = {
  stress: [
    'stress', 'stressé', 'stressée', 'débordé', 'débordée', 'pression',
    'urgence', 'rush', 'sous pression', 'trop de travail', 'surcharge',
    'crispé', 'crispée', 'tendu', 'tendue', 'agité', 'agitée',
    'grosse journée', 'journée chargée', 'deadline', 'réunion'
  ],
  anxiete: [
    'anxieux', 'anxieuse', 'anxiété', 'angoisse', 'angoissé', 'angoissée',
    'peur', 'inquiet', 'inquiète', 'inquiétude', 'rumination', 'tourne en boucle',
    'pensées', 'catastrophe', 'catastrophiser', 'panique', 'nerveux', 'nerveuse',
    'boule au ventre', 'oppression', 'oppressé'
  ],
  fatigue: [
    'fatigué', 'fatiguée', 'épuisé', 'épuisée', 'crevé', 'crevée',
    'vidé', 'vidée', 'sans énergie', 'à plat', 'claqué', 'claquée',
    'pas dormi', 'mal dormi', 'nuit blanche', 'endormi', 'somnolent'
  ],
  brouillard: [
    'brouillard', 'flou', 'confus', 'confuse', 'perdu', 'perdue',
    'vague', 'pas clair', 'tête vide', 'dispersé', 'dispersée',
    'distrait', 'distraite', 'concentration', 'focus', 'rien faire',
    'zombie', 'coton', 'dans le vague'
  ],
  sommeil: [
    'dormir', 'sommeil', 'insomnie', 'réveillé', 'réveillée', 'nuit',
    'coucher', 'endormir', 'pas dormir', 'mal dormi', 'réveils',
    '3h', '4h', 'milieu de nuit', 'trop tôt', 'fatigue soir'
  ],
  concentration: [
    'concentrer', 'concentration', 'focus', 'travail', 'étude', 'étudier',
    'apprendre', 'productif', 'productive', 'efficace', 'tâche', 'projet',
    'mise en route', 'commencer', 'démarrer', 'performance', 'zone'
  ]
};

function detectMoodFromText(text) {
  const normalized = text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // enlève les accents
    .replace(/[^a-z0-9\s]/g, ' ');

  const scores = {};
  for (const [mood, keywords] of Object.entries(KEYWORD_MAP)) {
    scores[mood] = 0;
    for (const kw of keywords) {
      const kwNorm = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalized.includes(kwNorm)) scores[mood]++;
    }
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : null;
}


// ── 3. MODE "JE NE SAIS PAS" ────────────────────────────
// Lance la mini séance d'observation (2 min)
// Puis reprend le guide avec un mapping corps/tête → humeur

function launchObservationSession(cb) {
  // Lance la mini séance d'observation
  launchPlayer(
    'observation',
    "Prendre un instant pour s'observer",
    'Premiers pas',
    '2 min',
    "Prendre un instant pour s-observer.mp3",
    'masculine',
    'assets/illustrations/player-01.jpg'
  );

  // Flag pour bloquer showGuideFeedback sur cette séance spéciale
  const prevMood = guideMood;
  guideMood = null;

  const onEnded = () => {
    audio.removeEventListener('ended', onEnded);
    guideMood = prevMood; // restaurer pour ne pas bloquer showGuideFeedback si besoin

    setTimeout(() => {
      closePlayer();
      setTimeout(() => {
        addBotBubble('Comment tu te sens après cette pause ?');
        setTimeout(() => addChoices([
          { label: '💪 Corps tendu, besoin de relâcher',   value: 'stress_corps' },
          { label: '🧠 Tête agitée, pensées qui tournent', value: 'stress_tete'  },
          { label: '😴 Fatigué(e), besoin de repos',       value: 'fatigue'      },
          { label: '🌿 Ça va, je n\'ai plus besoin',       value: 'done'         },
        ], (v) => {
          clearChoices();

          if (v === 'done') {
            addUserBubble("Ça va, merci");
            setTimeout(() => addBotBubble('Parfait. Prends soin de toi 🌿'), 400);
            guideInitialized = false; // permet de relancer le guide proprement
            return;
          }

          const mapping = {
            stress_corps: { mood: 'stress',     context: 'corps' },
            stress_tete:  { mood: 'stress',     context: 'tete'  },
            fatigue:      { mood: 'fatigue',    context: null     },
          };
          const { mood, context } = mapping[v];
          guideMood = mood;
          guideContext = context;

          const labels = {
            stress_corps: 'Corps tendu',
            stress_tete:  'Tête agitée',
            fatigue:      'Fatigué(e)',
          };
          addUserBubble(labels[v]);
          askDuration();
        }), 600);
      }, 400);
    }, 800);
  };

  audio.addEventListener('ended', onEnded);
}


// ── REMPLACEMENT DE initGuide() ──────────────────────────
// Intègre les 3 nouvelles fonctionnalités

function initGuide() {
  if (guideInitialized) return;
  guideInitialized = true;
  guideMood = null;
  guideDuration = null;
  guideContext = null;

  const win = document.getElementById('chat-window');
  const res = document.getElementById('guide-result');
  win.innerHTML = '';
  res.style.display = 'none';
  res.innerHTML = '';

  const hour = getCurrentHour();
  const greeting = (hour >= 6 && hour < 12) ? 'Bonjour'
    : (hour >= 12 && hour < 18) ? 'Bon après-midi'
    : 'Bonsoir';

  setTimeout(() => addBotBubble(greeting + ' 👋 Comment tu te sens en ce moment ?'), 200);

  setTimeout(() => {
    // Boutons humeur
    showMoodChoices();
  }, 600);
}

function showMoodChoices() {
  const choices = [
    { label: '😮‍💨 Stressé(e)',              value: 'stress'        },
    { label: '😰 Anxieux/se',               value: 'anxiete'       },
    { label: '😴 Fatigué(e)',               value: 'fatigue'       },
    { label: '😶 Brouillard mental',         value: 'brouillard'    },
    { label: '🌙 Difficultés à dormir',      value: 'sommeil'       },
    { label: '🎯 Besoin de concentration',   value: 'concentration' },
    { label: '🤷 Je ne sais pas vraiment',   value: 'unknown'       },
  ];

  if (isConcentrationBlocked()) {
    choices.find(c => c.value === 'concentration').disabled = true;
  }

  addChoices(choices, onMoodChoice);
}


// ── REMPLACEMENT DE onMoodChoice() ──────────────────────

function onMoodChoice(value) {
  const labels = {
    stress: 'Stressé(e)', anxiete: 'Anxieux/se', fatigue: 'Fatigué(e)',
    brouillard: 'Brouillard mental', sommeil: 'Difficultés à dormir',
    concentration: 'Besoin de concentration', unknown: 'Je ne sais pas vraiment'
  };
  addUserBubble(labels[value] || value);
  clearChoices();

  // Mode "Je ne sais pas"
  if (value === 'unknown') {
    setTimeout(() => {
      addBotBubble("Pas de problème. Je te propose une petite pause de 2 minutes pour t'observer, puis on reprend ensemble.");
      setTimeout(() => addChoices([
        { label: '▶ Lancer la pause', value: 'launch_obs' },
        { label: '↩ Choisir quand même', value: 'back'   }
      ], (v) => {
        clearChoices();
        if (v === 'launch_obs') {
          launchObservationSession();
        } else {
          guideInitialized = false;
          initGuide();
        }
      }), 600);
    }, 400);
    return;
  }

  guideMood = value;

  // Bloquer Concentration après 22h
  if (value === 'concentration' && isConcentrationBlocked()) {
    setTimeout(() => addBotBubble("À cette heure-ci, une séance de concentration risque de te tenir éveillé(e). Tu ne veux pas plutôt essayer quelque chose de plus doux ?"), 400);
    setTimeout(() => addChoices([
      { label: '🌙 Plutôt du sommeil',                            value: 'sommeil'              },
      { label: '😮‍💨 Me détendre',                                  value: 'stress'               },
      { label: '🎯 Non, je veux quand même concentration',         value: 'concentration_force'  }
    ], (v) => {
      if (v === 'concentration_force') {
        guideMood = 'concentration';
        addUserBubble('Je veux quand même concentration');
        clearChoices();
        askDuration();
      } else {
        onMoodChoice(v);
      }
    }), 800);
    return;
  }

  // Q3 contextuelle si applicable
  if (CONTEXT_QUESTIONS[value]) {
    setTimeout(() => addBotBubble(CONTEXT_QUESTIONS[value].question), 400);
    setTimeout(() => addChoices(CONTEXT_QUESTIONS[value].choices, onContextChoice), 800);
  } else {
    askDuration();
  }
}


// ── REMPLACEMENT DE onDurationChoice() ──────────────────
// Intègre le biais de feedback dans la sélection

function onDurationChoice(value) {
  guideDuration = value;
  addUserBubble({ court: '5 minutes', moyen: '5–10 minutes', long: 'Plus de 10 minutes' }[value]);
  clearChoices();

  const moodMap = GUIDE_MAP[guideMood];
  if (!moodMap) {
    setTimeout(() => {
      addBotBubble("Quelque chose s'est mal passé. On recommence ?");
      setTimeout(() => addChoices([
        { label: '↩ Recommencer', value: 'restart' }
      ], () => { restartGuide(); }), 400);
    }, 400);
    return;
  }
  const durationMap = moodMap[value];
  if (!durationMap) {
    setTimeout(() => {
      addBotBubble("Quelque chose s'est mal passé. On recommence ?");
      setTimeout(() => addChoices([
        { label: '↩ Recommencer', value: 'restart' }
      ], () => { restartGuide(); }), 400);
    }, 400);
    return;
  }

  const contextKey = guideContext && durationMap[guideContext] ? guideContext : 'default';
  const rawEntry = durationMap[contextKey];
  if (!rawEntry) {
    setTimeout(() => {
      addBotBubble("Quelque chose s'est mal passé. On recommence ?");
      setTimeout(() => addChoices([
        { label: '↩ Recommencer', value: 'restart' }
      ], () => { restartGuide(); }), 400);
    }, 400);
    return;
  }

  // Appliquer historique PUIS feedback
  let entry = applyHistoryToEntry(rawEntry);
  entry = applyFeedbackToEntry(entry, guideMood, guideDuration, guideContext);

  setTimeout(() => {
    addBotBubble('Voilà ce que je te recommande :');
    setTimeout(() => showGuideResult(entry), 400);
  }, 400);
}


// ── MODIFICATION DE audio.addEventListener('ended') ──────
// Afficher le feedback uniquement si la séance vient du guide
// À INTÉGRER dans le listener 'ended' existant :
//
//   audio.addEventListener('ended', () => {
//     updatePlayIcon(false);
//     ...
//     recordCompletion();
//     if (guideMood) showGuideFeedback();  // ← AJOUTER CETTE LIGNE
//   });


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

  const playerEl = document.getElementById('player-screen');
  ['premiers-pas','stress','sommeil','respirer','anxiete','concentration'].forEach(v => playerEl.removeAttribute('data-parcours'));
  playerEl.setAttribute('data-parcours', 'timer');
  document.getElementById('player-bg').style.backgroundImage = '';

  document.getElementById('player-artwork-wrap').style.display = 'none';
  document.getElementById('timer-display').style.display = 'flex';
  document.getElementById('player-progress').style.display = 'none';

  document.getElementById('player-title').textContent = 'Minuteur libre';
  document.getElementById('player-meta').textContent = minutes + ' min · Méditation silencieuse';
  document.getElementById('player-voice-tag').style.display = 'none';
  document.getElementById('audio-loading').textContent = '';

  updateTimerDisplay();

  document.getElementById('complete-screen').classList.remove('visible');
  document.getElementById('player-main').classList.remove('hidden');
  document.getElementById('player-main').style.display = 'flex';

  openPlayerScreen();

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
  const circumference = 603;
  const progress = timerSecondsLeft / timerTotalSeconds;
  const offset = circumference * (1 - progress);
  document.getElementById('timer-ring').style.strokeDashoffset = offset;
}

function recordTimerCompletion() {
  const s = JSON.parse(localStorage.getItem('serein-stats') || '{"sessions":0,"minutes":0,"lastDate":"","streak":0}');
  s.sessions = (s.sessions || 0) + 1;
  s.minutes = (s.minutes || 0) + Math.round(timerTotalSeconds / 60);
  const today = new Date().toLocaleDateString('fr-CA');
  if (s.lastDate !== today) {
    if (s.lastDate === new Date(Date.now() - 86400000).toLocaleDateString('fr-CA')) {
      s.streak = (s.streak || 0) + 1;
    } else {
      s.streak = 1;
    }
    s.lastDate = today;
  }
  localStorage.setItem('serein-stats', JSON.stringify(s));
  loadStats();
}




// ── INTRO AUDIO ──
function launchIntroAudio() {
  launchPlayer(
    'intro',
    "Qu'est-ce que la pleine conscience ?",
    'Introduction',
    '3 min',
    'Qu-est-ce que la pleine conscience.mp3',
    'masculine',
    'assets/illustrations/player-01.jpg'
  );
}


// ── REPORT ──
function openReportSheet() {
  const title = currentSession ? currentSession.title : 'cette séance';
  document.getElementById('report-sheet-sub').textContent = `Signaler un problème avec "${title}"`;
  document.getElementById('report-sheet-backdrop').classList.add('open');
}

function closeReportSheet() {
  document.getElementById('report-sheet-backdrop').classList.remove('open');
}

function sendReport(type) {
  closeReportSheet();
  const title = currentSession ? currentSession.title : 'séance inconnue';
  const parcours = currentSession ? currentSession.parcours : '';

  let subject, body;

  if (type === 'track') {
    subject = `[Serein] Problème signalé — ${title}`;
    body = `Bonjour,

Je souhaite signaler un problème sur la séance suivante :

Séance : ${title}
Parcours : ${parcours}

Description du problème :
[merci de décrire ici ce que vous avez constaté]

---
Envoyé depuis sereinapp.fr`;
  } else {
    const currentTime = audio.currentTime ? fmt(audio.currentTime) : '0:00';
    subject = `[Serein] Problème signalé à ${currentTime} — ${title}`;
    body = `Bonjour,

Je souhaite signaler un problème à un moment précis de la séance suivante :

Séance : ${title}
Parcours : ${parcours}
Timestamp : ${currentTime}

Description du problème :
[merci de décrire ici ce que vous avez constaté]

---
Envoyé depuis sereinapp.fr`;
  }

  const mailto = `mailto:serein@cesarbroche.fr?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailto;
}


// ── INIT ──
document.addEventListener('DOMContentLoaded', () => {
  applyTheme();
  loadStats();
  restoreOfflineButtons();
  updateOfflineCount();
});
