// ── CONFIG ──
const AUDIO_BASE_URL = (typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform())
  ? 'https://audio.sereinapp.fr/'
  : 'assets/audio/';

// ── GLOBALS ──
let timerInterval = null;
let timerSecondsLeft = 0;
let timerTotalSeconds = 0;
let timerRunning = false;
let currentAmbiance = null;
let timerAudioCtx = null;
let timerStartTimestamp = 0;
let timerElapsedBeforePause = 0;

function startSilentSession() {
  try {
    timerAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = timerAudioCtx.createBuffer(1, timerAudioCtx.sampleRate, timerAudioCtx.sampleRate);
    const src = timerAudioCtx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.connect(timerAudioCtx.destination);
    src.start(0);
    if (timerAudioCtx.state === 'suspended') timerAudioCtx.resume();
  } catch(e) {}
}

function stopSilentSession() {
  if (timerAudioCtx) { timerAudioCtx.close().catch(() => {}); timerAudioCtx = null; }
}

// ── NAVIGATION ──
const SCREENS = ['home','explore','guide','settings'];

function showScreen(id) {
  SCREENS.forEach(s => {
    document.getElementById(s).classList.toggle('active', s === id);
    const btn = document.getElementById('nav-' + s);
    if (btn) btn.classList.toggle('active', s === id);
  });
  window.scrollTo(0, 0);
  if (id === 'guide') showGuideView('hub');
}

let activeThemeFilter = 'Toutes';
let activeDurationFilter = 'all';

function applyFilters() {
  document.querySelectorAll('.session-list .session-card').forEach(card => {
    const p = card.dataset.parcours || '';
    const d = card.dataset.duration || '';
    const themeMatch = (activeThemeFilter === 'Toutes' || p === activeThemeFilter);
    const durationMatch = (activeDurationFilter === 'all' || d === activeDurationFilter);
    card.style.display = (themeMatch && durationMatch) ? '' : 'none';
  });
  const showEmotionSubs = (activeThemeFilter === 'Émotions');
  document.querySelectorAll('.emotion-subgroup').forEach(el => {
    el.style.display = showEmotionSubs ? 'block' : 'none';
  });
  document.querySelectorAll('.emotion-disclaimer, .emotion-top-disclaimer, .emotion-ressources').forEach(el => {
    el.style.display = showEmotionSubs ? 'block' : 'none';
  });
  updateFilterCount();
}

function filterTab(btn) {
  document.querySelectorAll('.filter-tabs:not(.duration) .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  activeThemeFilter = btn.textContent.trim();
  applyFilters();
}

function filterDuration(btn) {
  document.querySelectorAll('.filter-tabs.duration .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  activeDurationFilter = btn.dataset.duration;
  applyFilters();
}

function updateFilterCount() {
  let count = 0;
  document.querySelectorAll('.session-list .session-card').forEach(card => {
    if (card.style.display !== 'none') count++;
  });
  const el = document.getElementById('filter-count');
  if (el) el.textContent = count === 0 ? 'Aucune séance trouvée' : count + ' séance' + (count > 1 ? 's' : '');
}

function filterParcours(label) {
  showScreen('explore');
  requestAnimationFrame(() => {
    document.querySelectorAll('.filter-tabs .tab').forEach(t => {
      if (t.textContent.trim() === label) t.click();
    });
  });
}

// ── CATALOGUE (assets/sessions.json) ──
// Les cartes de l'écran Explorer sont générées depuis le catalogue JSON :
// ajouter une séance = ajouter une entrée dans assets/sessions.json.

function durationClass(min) {
  return min <= 5 ? 'short' : (min <= 10 ? 'medium' : 'long');
}

function makeGroupHeader(name) {
  const h = document.createElement('h2');
  h.className = 'group-header';
  h.dataset.parcours = name;
  const dot = document.createElement('span');
  dot.className = 'group-dot';
  dot.setAttribute('aria-hidden', 'true');
  h.appendChild(dot);
  h.appendChild(document.createTextNode(name));
  return h;
}

function makeSessionCard(s, group, subgroupName) {
  const durationLabel = s.duration + ' min';
  const card = document.createElement('article');
  card.className = 'card session-card';
  card.dataset.parcours = group.name;
  card.dataset.duration = durationClass(s.duration);
  card.dataset.durationMin = s.duration;

  const info = document.createElement('div');
  info.className = 'session-info';
  const h3 = document.createElement('h3');
  h3.textContent = s.title;
  const meta = document.createElement('p');
  meta.textContent = subgroupName
    ? group.name + ' · ' + subgroupName + ' · ' + durationLabel
    : group.name + ' · ' + durationLabel;
  info.appendChild(h3);
  info.appendChild(meta);

  const actions = document.createElement('div');
  actions.className = 'session-actions';
  const dl = document.createElement('button');
  dl.className = 'btn-offline';
  dl.setAttribute('aria-label', 'Télécharger ' + s.title + ' pour écoute hors ligne');
  dl.dataset.filename = s.file;
  dl.textContent = '⬇';
  dl.addEventListener('click', () => toggleOfflineCache(dl, s.file));
  const launch = document.createElement('button');
  launch.className = 'btn btn-primary';
  launch.setAttribute('aria-label', 'Lancer la séance ' + s.title + ', ' + group.name + ', ' + durationLabel);
  launch.textContent = 'Lancer';
  launch.addEventListener('click', () => openVoiceOverlay(s.id, s.title, group.name, durationLabel, s.file, s.fileFem || false, group.artwork));
  actions.appendChild(dl);
  actions.appendChild(launch);

  card.appendChild(info);
  card.appendChild(actions);
  return card;
}

function makeResourcesBlock(resources) {
  const wrap = document.createElement('div');
  wrap.className = 'emotion-ressources card';
  const title = document.createElement('p');
  title.className = 'emotion-ressources-title';
  title.textContent = 'Ressources utiles';
  wrap.appendChild(title);
  resources.forEach(r => {
    const a = document.createElement('a');
    a.className = 'emotion-ressource-link';
    a.href = r.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    const name = document.createElement('span');
    name.className = 'ressource-name';
    name.textContent = r.name;
    const desc = document.createElement('span');
    desc.className = 'ressource-desc';
    desc.textContent = r.desc;
    a.appendChild(name);
    a.appendChild(desc);
    wrap.appendChild(a);
  });
  return wrap;
}

async function renderSessionList() {
  const list = document.getElementById('session-list');
  if (!list) return;
  try {
    const res = await fetch('assets/sessions.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const catalog = await res.json();
    list.textContent = '';
    catalog.groups.forEach(group => {
      list.appendChild(makeGroupHeader(group.name));
      if (group.disclaimer) {
        const d = document.createElement('p');
        d.className = 'emotion-top-disclaimer';
        d.textContent = group.disclaimer;
        list.appendChild(d);
      }
      if (group.subgroups) {
        group.subgroups.forEach(sub => {
          const label = document.createElement('div');
          label.className = 'emotion-subgroup';
          label.textContent = sub.label;
          list.appendChild(label);
          sub.sessions.forEach(s => list.appendChild(makeSessionCard(s, group, sub.name)));
        });
      } else {
        group.sessions.forEach(s => list.appendChild(makeSessionCard(s, group, null)));
      }
      if (group.resources) list.appendChild(makeResourcesBlock(group.resources));
    });
    applyFilters();
  } catch(e) {
    console.warn('[Serein catalogue]', e);
    const msg = document.createElement('p');
    msg.style.cssText = 'text-align:center;color:var(--color-muted);padding:2rem 1rem;';
    msg.textContent = 'Impossible de charger le catalogue. Vérifie ta connexion puis relance l’app.';
    list.appendChild(msg);
  }
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

// ── MEDIA SESSION (écran de verrouillage, écouteurs, notification Android) ──
function setupMediaSession(title, subtitle, artwork) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: title,
      artist: 'Serein',
      album: subtitle || 'Méditation guidée',
      artwork: artwork ? [{ src: artwork, sizes: '512x512', type: 'image/jpeg' }] : []
    });
    // togglePlay route correctement entre séance guidée, ambiance seule et minuteur
    navigator.mediaSession.setActionHandler('play', () => togglePlay());
    navigator.mediaSession.setActionHandler('pause', () => togglePlay());
    navigator.mediaSession.setActionHandler('seekbackward', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
    navigator.mediaSession.setActionHandler('seekforward', () => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 15); });
    navigator.mediaSession.setActionHandler('seekto', d => {
      if (d.seekTime != null && audio.duration) audio.currentTime = d.seekTime;
    });
    navigator.mediaSession.setActionHandler('stop', () => closePlayer());
  } catch(e) { console.warn('[Serein mediaSession]', e); }
}

function setMediaPlaybackState(state) {
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = state; } catch(e) {}
  }
}

function clearMediaSession() {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
  } catch(e) {}
}

function openPlayerScreen() {
  document.getElementById('player-screen').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closePlayer() {
  // Capturer avant effacement : si session guidée interrompue manuellement, proposer feedback
  const interrupted = guideMood && currentSession && !audio.ended && audio.currentTime > 5;
  const interruptedSnapshot = interrupted
    ? { mood: guideMood, duration: guideDuration, context: guideContext, title: currentSession.title }
    : null;

  // Stop all audio
  audio.pause();
  ambianceAudio.pause();
  clearMediaSession();

  // Clean up timer if active
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null; timerRunning = false; }
  const timerEngine = document.getElementById('timer-engine');
  if (timerEngine) { timerEngine.pause(); timerEngine.src = ''; }
  stopSilentSession();
  notifyNativePlayback();

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

  guideInitialized = false;
  guideMood = null;
  guideDuration = null;
  guideContext = null;

  if (interruptedSnapshot) showInterruptedFeedbackToast(interruptedSnapshot);
}

function showInterruptedFeedbackToast(snap) {
  const existing = document.getElementById('interrupted-feedback-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'interrupted-feedback-toast';
  toast.style.cssText = [
    'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
    'background:var(--card-bg, #1e1e2e)', 'border:1px solid rgba(255,255,255,.12)',
    'border-radius:16px', 'padding:.85rem 1.1rem', 'z-index:9999',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:.55rem',
    'box-shadow:0 8px 32px rgba(0,0,0,.35)', 'max-width:320px', 'width:90%',
    'animation:fadeInUp .25s ease'
  ].join(';');

  const label = document.createElement('p');
  label.textContent = 'Comment était cette séance ?';
  label.style.cssText = 'font-size:.78rem;color:rgba(255,255,255,.55);margin:0;text-align:center;';
  toast.appendChild(label);

  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:.5rem;';

  [{ label: '😮 Trop intense', value: 'intense' }, { label: '✓ Bien', value: 'ok' }, { label: '🌿 Trop doux', value: 'doux' }, { label: '✕', value: 'dismiss' }].forEach(f => {
    const btn = document.createElement('button');
    btn.textContent = f.label;
    btn.style.cssText = [
      'background:rgba(255,255,255,.08)', 'border:1px solid rgba(255,255,255,.15)',
      'border-radius:999px', 'color:rgba(255,255,255,.8)',
      'padding:.35rem .75rem', 'font-size:.75rem', 'cursor:pointer'
    ].join(';');
    btn.addEventListener('click', () => {
      if (f.value !== 'dismiss') {
        saveFeedback(snap.mood, snap.duration, snap.context, snap.title, f.value);
        recordGuidePlay(snap.title);
      }
      toast.remove();
    });
    btns.appendChild(btn);
  });

  toast.appendChild(btns);
  document.body.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 12000);
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

  // Contrôles écran de verrouillage
  setupMediaSession(title, parcours + ' · ' + duration, img);

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
    'Concentration': 'concentration',
    'Émotions': 'emotions'
  };
  const playerEl = document.getElementById('player-screen');
  playerEl.removeAttribute('data-parcours');
  const pKey = parcoursMap[parcours] || 'premiers-pas';
  playerEl.setAttribute('data-parcours', pKey);
  // Background is handled by CSS gradients per parcours — clear any leftover image
  document.getElementById('player-bg').style.backgroundImage = '';

  openPlayerScreen();

  audio.src = AUDIO_BASE_URL + voiceFolder(voice) + '/' + encodeURIComponent(filename);
  audio.load();
  audio.play().then(() => {
    document.getElementById('audio-loading').textContent = '';
    updatePlayIcon(true);
    playBell();
  }).catch(() => {
    document.getElementById('audio-loading').textContent = 'Appuie sur ▶ pour démarrer';
    updatePlayIcon(false);
  });
}

function togglePlay() {
  // Timer mode
  const timerDisplay = document.getElementById('timer-display');
  if (timerDisplay && timerDisplay.style.display === 'flex') {
    const timerEngine = document.getElementById('timer-engine');
    if (timerRunning) {
      timerRunning = false;
      clearInterval(timerInterval);
      timerElapsedBeforePause += Date.now() - timerStartTimestamp;
      timerEngine.pause();
      if (timerAudioCtx) timerAudioCtx.suspend().catch(() => {});
      updatePlayIcon(false);
      setMediaPlaybackState('paused');
    } else {
      timerRunning = true;
      timerStartTimestamp = Date.now();
      timerEngine.play().catch(() => {});
      if (timerAudioCtx) timerAudioCtx.resume().catch(() => {});
      timerInterval = setInterval(timerTick, 1000);
      updatePlayIcon(true);
      setMediaPlaybackState('playing');
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
  notifyNativePlayback();
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
  try { localStorage.setItem('serein-speed', String(s)); } catch(e) {}
}

function loadSpeed() {
  try {
    const saved = parseFloat(localStorage.getItem('serein-speed'));
    if (SPEEDS.includes(saved)) setSpeed(saved);
  } catch(e) {}
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
  if ('mediaSession' in navigator && navigator.mediaSession.setPositionState) {
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate,
        position: Math.min(audio.currentTime, audio.duration)
      });
    } catch(e) {}
  }
});

audio.addEventListener('loadedmetadata', () => {
  document.getElementById('time-total').textContent = fmt(audio.duration);
  document.getElementById('audio-loading').textContent = '';
});

audio.addEventListener('ended', () => {
  updatePlayIcon(false);
  playBell();
  document.getElementById('player-main').style.display = 'none';
  document.getElementById('player-main').classList.add('hidden');
  document.getElementById('complete-screen').classList.add('visible');
  if (currentSession) document.getElementById('complete-title').textContent = currentSession.title;
  recordCompletion();
  if (guideMood) showGuideFeedback();
});

audio.addEventListener('play', () => {
  updatePlayIcon(true);
  if (currentAmbiance && ambianceAudio.paused) ambianceAudio.play().catch(() => {});
  setMediaPlaybackState('playing');
});
audio.addEventListener('pause', () => {
  updatePlayIcon(false);
  // Interruption système (appel, autre app) : suspendre aussi l'ambiance.
  // En fin naturelle de séance (ended), l'ambiance continue pour accompagner l'écran de fin.
  if (!audio.ended && currentAmbiance && !ambianceAudio.paused) ambianceAudio.pause();
  setMediaPlaybackState('paused');
});
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
  // Mode timer libre : relancer le chronomètre avec la même durée
  if (timerTotalSeconds > 0) {
    startTimer(timerTotalSeconds / 60);
    return;
  }
  // Mode session guidée
  document.getElementById('complete-screen').classList.remove('visible');
  document.getElementById('player-main').classList.remove('hidden');
  document.getElementById('player-main').style.display = 'flex';
  audio.currentTime = 0;
  audio.play();
  if (currentAmbiance) ambianceAudio.play().catch(() => {});
}

// ── OFFLINE depuis le player ──
const AUDIO_CACHE = 'serein-audio';

function voiceFolder(voice) {
  return voice === 'feminine' ? 'feminin' : 'masculin';
}

function currentAudioFolder() {
  return voiceFolder(currentSession && currentSession.voice);
}

async function toolbarOffline() {
  if (!currentOfflineFilename) return;
  const btn = document.getElementById('toolbar-offline-btn');
  if (!('caches' in window)) { alert('Cache non disponible sur ce navigateur.'); return; }
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const url = AUDIO_BASE_URL + currentAudioFolder() + '/' + encodeURIComponent(currentOfflineFilename);
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
    const cache = await caches.open(AUDIO_CACHE);
    const url = AUDIO_BASE_URL + currentAudioFolder() + '/' + encodeURIComponent(currentOfflineFilename);
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
    notifyNativePlayback();
    return;
  }
  currentAmbiance = file;
  ambianceAudio.src = AUDIO_BASE_URL + 'ambiance/' + file;
  ambianceAudio.volume = parseFloat(document.getElementById('ambiance-volume-slider').value);
  ambianceAudio.play().catch(() => {});
  const id = 'amb-' + file.replace('.mp3','').replace('bruit-blanc','blanc');
  const btn = document.getElementById(id);
  if (btn) btn.classList.add('active');
  document.getElementById('ambiance-volume-wrap').style.display = 'flex';
  const label = file.replace('.mp3','').replace('bruit-blanc','Bruit blanc');
  updateAmbianceTag(label);
  notifyNativePlayback();
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
    const cache = await caches.open(AUDIO_CACHE);
    const url = AUDIO_BASE_URL + voiceFolder(btn.dataset.voice) + '/' + encodeURIComponent(filename);
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
    const cache = await caches.open(AUDIO_CACHE);
    const keys = await cache.keys();
    const tag = document.getElementById('offline-count-tag');
    if (tag) tag.textContent = keys.length + ' séance' + (keys.length > 1 ? 's' : '');
  } catch(e) { console.warn('[Serein cache]', e); }
}

async function restoreOfflineButtons() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(AUDIO_CACHE);
    const btns = Array.from(document.querySelectorAll('.btn-offline[data-filename]'));
    await Promise.all(btns.map(async btn => {
      const fn = btn.dataset.filename;
      if (!fn) return;
      const match = await cache.match(AUDIO_BASE_URL + voiceFolder(btn.dataset.voice) + '/' + encodeURIComponent(fn));
      if (match) { btn.classList.add('cached'); btn.textContent = '✓'; }
    }));
  } catch(e) { console.warn('[Serein cache]', e); }
}

// ── STATS ──
function isYesterday(dateStr) {
  if (!dateStr) return false;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dateStr === yesterday.toLocaleDateString('fr-CA');
}

function getStats() {
  try {
    return JSON.parse(localStorage.getItem('serein-stats') || '{}');
  } catch(e) { return {}; }
}

function loadStats() {
  const s = getStats();
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
  try {
    const s = getStats();
    s.sessions = (s.sessions || 0) + 1;
    const dur = currentSession ? (parseFloat(currentSession.duration) || Math.round((audio.duration || 0) / 60)) : 0;
    s.minutes = (s.minutes || 0) + dur;
    const today = new Date().toLocaleDateString('fr-CA');
    if (s.lastDate !== today) {
      s.streak = isYesterday(s.lastDate) ? (s.streak || 0) + 1 : 1;
    }
    s.lastDate = today;
    localStorage.setItem('serein-stats', JSON.stringify(s));
    loadStats();
  } catch(e) { console.warn('[Serein stats]', e); }
}

// ── THÈME ──
function setThemeMode(mode) {
  if (mode === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    localStorage.setItem('serein-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('serein-theme', 'dark');
  }
  updateThemeSegButtons();
}

function updateThemeSegButtons() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const segLight = document.getElementById('seg-light');
  const segDark = document.getElementById('seg-dark');
  if (segLight) segLight.classList.toggle('active', isLight);
  if (segDark) segDark.classList.toggle('active', !isLight);
}

function toggleTheme() { setThemeMode(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); }

function applyTheme() {
  const t = localStorage.getItem('serein-theme');
  if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
  updateThemeSegButtons();
}

const AMBIANCE_LABELS = { '': 'Aucun', 'pluie.mp3': 'Pluie', 'foret.mp3': 'Forêt', 'vagues.mp3': 'Vagues', 'feu.mp3': 'Feu', 'bruit-blanc.mp3': 'Blanc' };

function openAmbianceSettings() {
  const saved = localStorage.getItem('serein-ambiance-default') || '';
  document.querySelectorAll('.ambiance-settings-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === saved);
  });
  document.getElementById('ambiance-settings-backdrop').classList.add('open');
}

function selectAmbianceDefault(btn) {
  document.querySelectorAll('.ambiance-settings-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const val = btn.dataset.value;
  localStorage.setItem('serein-ambiance-default', val);
  const label = document.getElementById('ambiance-default-label');
  if (label) label.textContent = (AMBIANCE_LABELS[val] || 'Aucun') + ' ›';
  setTimeout(() => document.getElementById('ambiance-settings-backdrop').classList.remove('open'), 300);
}

function savePref(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch(e) {}
}

function loadPrefs() {
  try {
    const bells = document.getElementById('bells-toggle');
    if (bells) bells.checked = localStorage.getItem('serein-bells') === 'true';
    const wifi = document.getElementById('wifi-toggle');
    if (wifi) wifi.checked = localStorage.getItem('serein-wifi-only') === 'true';
    const ambianceVal = localStorage.getItem('serein-ambiance-default') || '';
    const ambianceLabel = document.getElementById('ambiance-default-label');
    if (ambianceLabel) ambianceLabel.textContent = (AMBIANCE_LABELS[ambianceVal] || 'Aucun') + ' ›';
    loadReminderPrefs();
  } catch(e) {}
}

// ── RAPPEL QUOTIDIEN ──

const REMINDER_MESSAGES = [
  'C\'est le moment de ta pause méditation 🌿',
  'Une minute pour toi. Serein t\'attend.',
  'Prends une grande inspiration. C\'est l\'heure de méditer.',
  'Ta pratique quotidienne t\'attend 🌙',
  'Un instant de calme, rien que pour toi.',
];

function loadReminderPrefs() {
  const enabled = localStorage.getItem('serein-reminder-enabled') === 'true';
  const time = localStorage.getItem('serein-reminder-time') || '21:00';
  const toggle = document.getElementById('reminder-toggle');
  const btn = document.getElementById('reminder-time-btn');
  const input = document.getElementById('reminder-time-input');
  if (toggle) toggle.checked = enabled;
  if (btn) { btn.textContent = time + ' ›'; btn.style.display = enabled ? '' : 'none'; }
  if (input) input.value = time;
}

function openReminderTimePicker() {
  const input = document.getElementById('reminder-time-input');
  if (!input) return;
  input.style.pointerEvents = 'auto';
  input.focus();
  input.click();
  setTimeout(() => { input.style.pointerEvents = 'none'; }, 500);
}

function onReminderTimeChange(val) {
  if (!val) return;
  localStorage.setItem('serein-reminder-time', val);
  const btn = document.getElementById('reminder-time-btn');
  if (btn) btn.textContent = val + ' ›';
  const [h, m] = val.split(':').map(Number);
  scheduleReminder(h, m);
}

async function onReminderToggle(enabled) {
  localStorage.setItem('serein-reminder-enabled', enabled);
  const btn = document.getElementById('reminder-time-btn');
  if (btn) btn.style.display = enabled ? '' : 'none';
  if (enabled) {
    const time = localStorage.getItem('serein-reminder-time') || '21:00';
    const [h, m] = time.split(':').map(Number);
    const ok = await scheduleReminder(h, m);
    if (!ok) {
      // Permission refusée — on remet le toggle à off
      localStorage.setItem('serein-reminder-enabled', 'false');
      const toggle = document.getElementById('reminder-toggle');
      if (toggle) toggle.checked = false;
      if (btn) btn.style.display = 'none';
    }
  } else {
    cancelReminder();
  }
}

async function scheduleReminder(hour, minute) {
  try {
    const LC = window.Capacitor?.Plugins?.LocalNotifications;
    if (!LC) return false;

    const perm = await LC.requestPermissions();
    if (perm.display !== 'granted') return false;

    // Annuler l'éventuel rappel existant
    await LC.cancel({ notifications: [{ id: 1001 }] }).catch(() => {});

    const msg = REMINDER_MESSAGES[Math.floor(Math.random() * REMINDER_MESSAGES.length)];
    await LC.schedule({
      notifications: [{
        id: 1001,
        title: 'Serein',
        body: msg,
        schedule: { on: { hour, minute }, repeats: true },
        smallIcon: 'ic_notification',
        iconColor: '#2e7d52',
      }]
    });
    return true;
  } catch(e) {
    return false;
  }
}

async function cancelReminder() {
  try {
    const LC = window.Capacitor?.Plugins?.LocalNotifications;
    if (!LC) return;
    await LC.cancel({ notifications: [{ id: 1001 }] });
  } catch(e) {}
}

function showGuideView(view) {
  const hub = document.getElementById('guide-hub');
  const comprendre = document.getElementById('guide-comprendre');
  const chat = document.getElementById('guide-chat');
  const article = document.getElementById('guide-article');
  if (!hub) return;
  hub.style.display = view === 'hub' ? '' : 'none';
  comprendre.style.display = view === 'comprendre' ? '' : 'none';
  chat.style.display = view === 'chat' ? '' : 'none';
  if (article) article.style.display = view === 'article' ? '' : 'none';
  if (view === 'chat') initGuide();
  window.scrollTo(0, 0);
}

// ── ARTICLES ──
function mdInline(t) {
  return t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

function mdToHTML(md) {
  const lines = md.split('\n');
  let html = '', inUl = false, inOl = false;
  const closeList = () => {
    if (inUl) { html += '</ul>'; inUl = false; }
    if (inOl) { html += '</ol>'; inOl = false; }
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) {
      // blank line inside a list: peek ahead to continue list if next non-empty line is still a list item
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const next = lines[j] ? lines[j].trim() : '';
      if ((inUl && next.startsWith('- ')) || (inOl && /^\d+\./.test(next))) { i = j - 1; continue; }
      closeList(); continue;
    }
    if (line.startsWith('### ')) {
      closeList();
      html += `<h3>${mdInline(line.slice(4))}</h3>`;
    } else if (line.startsWith('- ')) {
      if (inOl) { html += '</ol>'; inOl = false; }
      if (!inUl) { html += '<ul>'; inUl = true; }
      html += `<li>${mdInline(line.slice(2))}</li>`;
    } else if (/^\d+\.\s/.test(line)) {
      if (inUl) { html += '</ul>'; inUl = false; }
      if (!inOl) { html += '<ol>'; inOl = true; }
      html += `<li>${mdInline(line.replace(/^\d+\.\s+/, ''))}</li>`;
    } else {
      closeList();
      html += `<p>${mdInline(line)}</p>`;
    }
  }
  closeList();
  return html;
}

const ARTICLES = {
  'pleine-conscience': {
    title: 'La pleine conscience, en quelques respirations',
    meta: 'Les bases · 4 min de lecture',
    md: `La pleine conscience n'est ni une évasion, ni une technique de relaxation mystique. En psychologie, elle se définit simplement comme le fait de porter son attention, de manière intentionnelle et sans jugement, sur l'instant présent.

La majeure partie de notre temps est passée en "pilote automatique". L'esprit vagabonde : il anticipe les problèmes de demain ou rumine les événements d'hier. La pleine conscience permet de ramener l'attention sur l'ici et maintenant, rompant ainsi ce cycle de vagabondage mental.

### Comment ça fonctionne ?

En termes cognitifs, méditer est un entraînement de l'attention. Il s'agit de choisir un point d'ancrage (comme la respiration) et d'y maintenir sa concentration.

Le processus se déroule toujours en trois étapes :

1. **L'ancrage :** L'attention est posée sur le souffle.

2. **La distraction :** Naturellement, l'esprit s'évade vers une pensée, un souvenir ou un son.

3. **Le retour :** On prend conscience de cette distraction et on choisit, délibérément, de ramener l'attention sur l'ancrage.

C'est précisément ce mouvement de retour qui constitue la musculation de l'esprit. Chaque fois que l'on ramène son attention, on renforce les circuits neuronaux liés à la régulation émotionnelle et à la concentration.

### L'exercice de base

Pour commencer, il n'est pas nécessaire de s'isoler pendant des heures. Une minute suffit. Laissez votre respiration suivre son rythme naturel. Observez l'air entrer et sortir. Si une pensée surgit, notez simplement sa présence, puis revenez à la sensation physique de l'air. C'est le premier pas vers une meilleure flexibilité psychologique.`
  },

  'pourquoi-mediter': {
    title: 'Pourquoi méditer ?',
    meta: 'L\'essentiel en 3 minutes',
    md: `Les bénéfices de la méditation de pleine conscience font aujourd'hui l'objet d'un large consensus scientifique. Loin d'être une solution miracle qui effacerait les problèmes, elle agit comme un régulateur du système nerveux et cognitif.

### Développer la flexibilité psychologique

Face à un événement stressant, notre cerveau a tendance à réagir de manière automatique et impulsive. La méditation permet de créer un espace entre le stimulus (ce qui se passe) et la réponse (comment on réagit). Cette capacité à faire une pause permet de choisir une action adaptée plutôt que de subir une réaction automatique.

### Réduire la rumination

Les TCC montrent que la souffrance psychologique est souvent maintenue par la rumination (le fait de tourner en boucle sur des pensées négatives). Méditer entraîne l'esprit à observer ces pensées comme de simples événements mentaux passagers, et non comme des vérités absolues. On apprend ainsi à désamorcer les spirales de stress.

### Les effets sur le corps et l'esprit

Une pratique régulière démontre plusieurs effets mesurables :

- **Baisse de la réactivité au stress :** Diminution de l'activation de l'amygdale (la zone du cerveau gérant la peur).

- **Meilleure régulation émotionnelle :** Capacité accrue à traverser les émotions inconfortables sans s'y noyer.

- **Amélioration de la concentration :** L'entraînement de l'attention limite la fatigue mentale liée au multitâche.

Méditer, c'est finalement s'entraîner sur un coussin à développer des compétences que l'on utilisera ensuite dans la vie de tous les jours.`
  },

  'posture': {
    title: 'Trouver sa posture',
    meta: 'Assis, allongé, en marchant · 2 min de lecture',
    md: `L'image de la personne méditant en position du lotus, d'une souplesse absolue, est un mythe tenace. En réalité, la posture physique sert un seul objectif : soutenir l'état mental. Le corps et l'esprit étant liés, une posture adéquate favorise la clarté et l'attention.

### Le principe : l'équilibre entre détente et vigilance

Une bonne posture de méditation repose sur un équilibre subtil. Si le corps est trop relâché (par exemple, allongé dans un lit), le cerveau associe cette position au sommeil, favorisant la somnolence. À l'inverse, si le corps est trop rigide, la douleur et la tension deviennent des distractions majeures.

L'objectif est de trouver une position digne, droite et alerte, sans effort excessif.

### Les points de repère pour s'installer

Que l'on choisisse une chaise, un coussin ou un banc de méditation, quelques principes ergonomiques s'appliquent :

- **L'ancrage :** Les pieds sont bien à plat sur le sol (ou les genoux reposent sur le coussin), offrant une base stable.

- **Le dos droit :** La colonne vertébrale s'érige naturellement, respectant sa courbure. Imaginez un fil invisible qui tire doucement le sommet du crâne vers le plafond.

- **Les épaules relâchées :** Elles s'abaissent loin des oreilles, libérant la cage thoracique pour faciliter la respiration.

- **Les mains au repos :** Simplement posées à plat sur les cuisses ou réunies au centre des genoux.

L'immobilité n'est pas une règle absolue. Si une douleur aiguë apparaît, l'ajustement de la posture, fait en pleine conscience, fait partie intégrante de la pratique.`
  },

  'pensees': {
    title: 'Que faire des pensées ?',
    meta: 'Les laisser passer · 3 min de lecture',
    md: `C'est l'idée reçue la plus fréquente et la plus décourageante : "Je n'arrive pas à méditer, je n'arrive pas à faire le vide dans ma tête."

Soyons clairs : le cerveau est conçu pour produire des pensées. Essayer d'arrêter de penser est aussi impossible que d'essayer d'arrêter son cœur de battre par la seule force de la volonté. L'objectif de la pleine conscience n'est pas de supprimer les pensées, mais de changer la relation que l'on entretient avec elles.

### La défusion cognitive : vous n'êtes pas vos pensées

En TCC, on utilise le concept de "défusion cognitive". Habituellement, nous sommes "fusionnés" avec nos pensées : si l'esprit dit "je n'y arriverai pas", on le croit immédiatement.

La méditation permet de faire un pas de recul. Elle nous apprend à regarder **nos** pensées, plutôt qu'à regarder le monde **à travers** nos pensées. Une pensée devient un simple événement mental, comme un son ou une sensation physique. Elle apparaît, existe un instant, puis disparaît, si on ne l'alimente pas.

### La technique de l'étiquetage

Quand une pensée surgit pendant la pratique et détourne l'attention, voici l'approche à adopter :

1. **L'accueillir :** Ne luttez pas contre la distraction. Remarquez simplement que l'esprit s'est égaré.

2. **L'étiqueter :** Posez un mot mental neutre sur ce qui vous a distrait ("pensée", "souvenir", "planification"). Cela crée instantanément une distance.

3. **Laisser passer :** Ramenez doucement, mais fermement, votre attention vers votre point d'ancrage (la respiration ou le corps).

Le succès de la méditation ne se mesure pas à l'absence de pensées, mais à la capacité de s'en rendre compte de plus en plus vite pour revenir à l'instant présent.`
  },

  'quotidien': {
    title: 'Méditer au quotidien',
    meta: 'Créer une habitude douce · 2 min de lecture',
    md: `Intégrer la méditation dans une vie déjà bien remplie peut sembler complexe. Pourtant, les sciences du comportement sont formelles : la régularité prime de loin sur la durée. Il est psychologiquement et neurologiquement plus efficace de méditer 5 minutes par jour que 45 minutes une fois par mois.

### Créer une micro-habitude

Pour qu'un nouveau comportement s'installe, il doit être facile à déclencher. L'astuce consiste à associer la méditation à une habitude déjà existante.

- Méditer 3 minutes juste après s'être brossé les dents.

- Lancer une séance courte une fois installé dans les transports en commun.

- S'accorder 5 minutes de respiration avant de démarrer l'ordinateur au travail.

### La pratique informelle

La pleine conscience ne se limite pas aux séances formelles, les yeux fermés. Elle peut s'inviter dans les gestes les plus banals. La pratique informelle consiste à porter une attention totale à une action habituelle :

- **Prendre une douche :** Se concentrer uniquement sur la température de l'eau, le bruit des gouttes et l'odeur du savon, au lieu de planifier sa journée.

- **Marcher :** Sentir le contact des pieds avec le sol à chaque pas.

- **Écouter :** Être pleinement présent lors d'une conversation, sans préparer mentalement sa prochaine réponse.

Chaque instant de la journée offre une opportunité de s'entraîner. Même en cas de baisse de motivation, s'asseoir et ne prendre que trois grandes respirations conscientes est déjà une victoire sur le pilote automatique.`
  }
};

function openArticle(slug) {
  const art = ARTICLES[slug];
  if (!art) return;
  document.getElementById('article-title').textContent = art.title;
  document.getElementById('article-meta').textContent = art.meta;
  document.getElementById('article-body').innerHTML = mdToHTML(art.md);
  showGuideView('article');
}

function toggleFaq(item) {
  const isOpen = item.classList.contains('open');
  document.querySelectorAll('.faq-item.open').forEach(i => {
    i.classList.remove('open');
    i.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
  });
  if (!isOpen) {
    item.classList.add('open');
    item.querySelector('.faq-question').setAttribute('aria-expanded', 'true');
  }
}

function confirmResetProgress() {
  if (!confirm('Réinitialiser toute ta progression ?\n\nCette action supprimera tes statistiques et ton historique de séances. Elle est irréversible.')) return;
  try {
    localStorage.removeItem('serein-stats');
    localStorage.removeItem('serein-history');
    localStorage.removeItem('serein-feedback');
    document.documentElement.classList.remove('has-sessions');
    loadStats();
  } catch(e) {}
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
        alts: [{ title: 'Le scan corporel — découvrir ses sensations', parcours: 'Premiers pas', duration: '10 min', file: 'Le scan corporel.mp3', fileFem: 'Le scan corporel — découvrir ses sensations.mp3', emoji: '🌿', artwork: 'assets/illustrations/player-01.jpg', reason: 'Relâche les tensions physiques accumulées' }, { title: 'Retrouver le goût des choses', parcours: 'Émotions', duration: '8 min', file: 'Retrouver le gout des choses.mp3', fileFem: false, emoji: '🌱', artwork: 'assets/illustrations/player-02.jpg', reason: "Quand la fatigue vient d'une perte d'élan intérieur" }]
      }
    },
    'long': {
      'default': {
        main: { title: 'Réveils nocturnes — retrouver le calme', parcours: 'Sommeil', duration: '18 min', file: 'Reveils nocturnes.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/player-03.jpg', reason: "Si la fatigue vient d'un sommeil perturbé" },
        alts: [{ title: 'Mon ancre personnelle', parcours: 'Premiers pas', duration: '6 min', file: 'Mon ancre personnelle.mp3', fileFem: false, emoji: '⚓', artwork: 'assets/illustrations/player-01.jpg', reason: 'Pour trouver un point de stabilité dans la journée' }, { title: 'Retrouver le goût des choses', parcours: 'Émotions', duration: '8 min', file: 'Retrouver le gout des choses.mp3', fileFem: false, emoji: '🌱', artwork: 'assets/illustrations/player-02.jpg', reason: "Quand la fatigue cache une perte de sens ou d'envie" }]
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
        alts: [{ title: 'Mise en route mentale', parcours: 'Concentration', duration: '7 min', file: 'Mise en route mentale.mp3', fileFem: false, emoji: '🎯', artwork: 'assets/illustrations/player-06.jpg', reason: "Pour clarifier l'esprit et retrouver le focus" }, { title: 'Retrouver le goût des choses', parcours: 'Émotions', duration: '8 min', file: 'Retrouver le gout des choses.mp3', fileFem: false, emoji: '🌱', artwork: 'assets/illustrations/player-02.jpg', reason: "Quand le brouillard cache une perte d'envie ou d'élan" }]
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
  },
  'colere': {
    'court': {
      'default': {
        main: { title: 'SOS Colère - décharger sans exploser', parcours: 'Émotions', duration: '5 min', file: 'SOS Colère.mp3', fileFem: false, emoji: '😤', artwork: 'assets/illustrations/player-02.jpg', reason: "Décharger l'énergie de la colère immédiatement, sans l'alimenter" },
        alts: [{ title: "Traverser l'irritabilité", parcours: 'Émotions', duration: '9 min', file: 'Traverser l-irritabilité.mp3', fileFem: false, emoji: '🌊', artwork: 'assets/illustrations/player-02.jpg', reason: "Quand l'irritation couve plutôt qu'elle n'éclate" }]
      }
    },
    'moyen': {
      'default': {
        main: { title: "Traverser l'irritabilité", parcours: 'Émotions', duration: '9 min', file: 'Traverser l-irritabilité.mp3', fileFem: false, emoji: '🌊', artwork: 'assets/illustrations/player-02.jpg', reason: "Pour traverser l'irritation et revenir au calme" },
        alts: [{ title: 'SOS Colère - décharger sans exploser', parcours: 'Émotions', duration: '5 min', file: 'SOS Colère.mp3', fileFem: false, emoji: '😤', artwork: 'assets/illustrations/player-02.jpg', reason: "Pour une décharge rapide si la colère remonte" }]
      }
    },
    'long': {
      'default': {
        main: { title: "Traverser l'irritabilité", parcours: 'Émotions', duration: '9 min', file: 'Traverser l-irritabilité.mp3', fileFem: false, emoji: '🌊', artwork: 'assets/illustrations/player-02.jpg', reason: "Pour aller en profondeur dans ce que l'irritabilité exprime" },
        alts: [{ title: 'Fin de journée - déposer le poids', parcours: 'Émotions', duration: '10 min', file: 'Fin de journee - deposer le poids.mp3', fileFem: false, emoji: '🌙', artwork: 'assets/illustrations/player-02.jpg', reason: "Déposer la tension et la colère accumulées sur la journée" }]
      }
    }
  },
  'tristesse': {
    'court': {
      'default': {
        main: { title: 'Tristesse & mauvaise humeur', parcours: 'Émotions', duration: '8 min', file: 'Tristesse et Mauvaise humeur.mp3', fileFem: false, emoji: '☁️', artwork: 'assets/illustrations/player-02.jpg', reason: "Accueillir l'humeur difficile sans la combattre" },
        alts: [{ title: 'La bienveillance envers soi', parcours: 'Premiers pas', duration: '5 min', file: 'La bienveillance envers soi.mp3', fileFem: false, emoji: '💚', artwork: 'assets/illustrations/player-01.jpg', reason: "Pour s'accompagner avec douceur dans les moments durs" }]
      }
    },
    'moyen': {
      'default': {
        main: { title: 'Tristesse & mauvaise humeur', parcours: 'Émotions', duration: '8 min', file: 'Tristesse et Mauvaise humeur.mp3', fileFem: false, emoji: '☁️', artwork: 'assets/illustrations/player-02.jpg', reason: "Traverser la tristesse ou la mauvaise humeur avec douceur" },
        alts: [{ title: 'Retrouver le goût des choses', parcours: 'Émotions', duration: '8 min', file: 'Retrouver le gout des choses.mp3', fileFem: false, emoji: '🌱', artwork: 'assets/illustrations/player-02.jpg', reason: "Réamorcer l'élan quand tout semble terne" }]
      }
    },
    'long': {
      'default': {
        main: { title: 'Retrouver le goût des choses', parcours: 'Émotions', duration: '8 min', file: 'Retrouver le gout des choses.mp3', fileFem: false, emoji: '🌱', artwork: 'assets/illustrations/player-02.jpg', reason: "Réamorcer l'élan quand la tristesse ou le vide s'installe" },
        alts: [{ title: 'Tristesse & mauvaise humeur', parcours: 'Émotions', duration: '8 min', file: 'Tristesse et Mauvaise humeur.mp3', fileFem: false, emoji: '☁️', artwork: 'assets/illustrations/player-02.jpg', reason: "Pour traverser une tristesse de fond avec douceur" }]
      }
    }
  }
};

let guideMood = null;
let guideDuration = null;
let guideContext = null;
let guideInitialized = false;

// Vérifie que toutes les combinaisons mood × duration sont bien couvertes
if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
  (function validateGuideMap() {
    const durations = ['court', 'moyen', 'long'];
    const warnings = [];
    for (const mood of Object.keys(GUIDE_MAP)) {
      for (const dur of durations) {
        if (!GUIDE_MAP[mood][dur]) {
          warnings.push(`GUIDE_MAP: combinaison manquante → ${mood} / ${dur}`);
          continue;
        }
        const entries = GUIDE_MAP[mood][dur];
        if (!entries.default && Object.keys(entries).length === 0) {
          warnings.push(`GUIDE_MAP: aucune entrée pour ${mood} / ${dur}`);
        }
        for (const ctxKey of Object.keys(entries)) {
          const e = entries[ctxKey];
          if (!e.main) warnings.push(`GUIDE_MAP: pas de 'main' pour ${mood}/${dur}/${ctxKey}`);
          if (!e.alts)  warnings.push(`GUIDE_MAP: pas de 'alts' pour ${mood}/${dur}/${ctxKey}`);
        }
      }
    }
    if (warnings.length) console.warn('[Serein] GUIDE_MAP validation:\n' + warnings.join('\n'));
  })();
}

let pendingGuideRec = null;

const GUIDE_SESSION_KEY = 'serein-guide-session';

function saveSessionSnapshot() {
  try {
    sessionStorage.setItem(GUIDE_SESSION_KEY, JSON.stringify({
      mood: guideMood, duration: guideDuration, context: guideContext,
      ts: Date.now()
    }));
  } catch(e) {}
}

function clearSessionSnapshot() {
  try { sessionStorage.removeItem(GUIDE_SESSION_KEY); } catch(e) {}
}

function getSessionSnapshot() {
  try {
    const raw = sessionStorage.getItem(GUIDE_SESSION_KEY);
    if (!raw) return null;
    const snap = JSON.parse(raw);
    if (Date.now() - snap.ts > 5 * 60 * 1000) { clearSessionSnapshot(); return null; }
    return snap;
  } catch(e) { return null; }
}

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
  clearSessionSnapshot();
  document.getElementById('guide-result').style.display = 'none';
  initGuide();
}

// ── Filtrage horaire ──
function getCurrentHour() {
  return new Date().getHours();
}

function isConcentrationBlocked() {
  const h = getCurrentHour();
  return h >= 22 || h < 6;
}

const HISTORY_KEY = 'serein-history';
const FEEDBACK_KEY = 'serein-feedback';

function getRecentHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
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
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch(e) {}
}

function applyHistoryToEntry(entry) {
  if (!entry) return entry;
  const history = getRecentHistory();
  const played = new Set(history.map(e => e.title));
  const result = { main: entry.main, alts: [...(entry.alts || [])] };
  if (played.has(result.main.title) && result.alts.length > 0) {
    const freshAltIdx = result.alts.findIndex(a => !played.has(a.title));
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
  saveSessionSnapshot();
  addUserBubble(contextLabels[value] || value);
  clearChoices();
  askDuration();
}

async function askDuration() {
  await delay(400);
  addBotBubble('Combien de temps as-tu ?');
  await delay(400);
  addChoices([
    { label: '⚡ 5 minutes', value: 'court' },
    { label: '🌿 5–10 minutes', value: 'moyen' },
    { label: '🌊 Plus de 10 minutes', value: 'long' }
  ], onDurationChoice);
}

function saveFeedback(mood, duration, context, sessionTitle, rating) {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    const all = raw ? JSON.parse(raw) : [];
    all.push({ mood, duration, context, title: sessionTitle, rating, ts: Date.now() });
    const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
    localStorage.setItem(FEEDBACK_KEY, JSON.stringify(all.filter(e => e.ts > cutoff)));
  } catch(e) {}
}

function getIntensityBias(mood, duration, context) {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    if (!raw) return null;
    const all = JSON.parse(raw);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const relevant = all.filter(e =>
      e.mood === mood &&
      e.duration === duration &&
      (e.context === context || !context) &&
      e.ts > cutoff
    );
    if (relevant.length < 2) return null;

    let intense = 0, doux = 0;
    for (const e of relevant) {
      if (e.rating === 'intense') intense++;
      else if (e.rating === 'doux') doux++;
    }
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

  const onEnded = async () => {
    audio.removeEventListener('ended', onEnded);
    guideMood = prevMood; // restaurer pour ne pas bloquer showGuideFeedback si besoin

    await delay(800);
    closePlayer();
    await delay(400);
    addBotBubble('Comment tu te sens après cette pause ?');
    await delay(600);
    addChoices([
      { label: '💪 Corps tendu, besoin de relâcher',   value: 'stress_corps' },
      { label: '🧠 Tête agitée, pensées qui tournent', value: 'stress_tete'  },
      { label: '😴 Fatigué(e), besoin de repos',       value: 'fatigue'      },
      { label: '🌿 Ça va, je n\'ai plus besoin',       value: 'done'         },
    ], async (v) => {
      clearChoices();

      if (v === 'done') {
        addUserBubble("Ça va, merci");
        await delay(400);
        addBotBubble('Parfait. Prends soin de toi 🌿');
        guideInitialized = false; // permet de relancer le guide proprement
        return;
      }

      const mapping = {
        stress_corps: { mood: 'stress',  context: 'corps' },
        stress_tete:  { mood: 'stress',  context: 'tete'  },
        fatigue:      { mood: 'fatigue', context: null     },
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
    });
  };

  audio.addEventListener('ended', onEnded);
}

async function initGuide() {
  if (guideInitialized) return;
  guideInitialized = true;

  const win = document.getElementById('chat-window');
  const res = document.getElementById('guide-result');
  win.innerHTML = '';
  res.style.display = 'none';
  res.innerHTML = '';

  // Reprendre une session interrompue (< 5 min) si elle existe
  const snap = getSessionSnapshot();
  if (snap && snap.mood) {
    guideMood = snap.mood;
    guideDuration = snap.duration;
    guideContext = snap.context;

    await delay(200);
    addBotBubble('On reprend là où on s\'était arrêtés 👋');
    await delay(400);
    addChoices([
      { label: '✓ Oui, continue', value: 'resume' },
      { label: '↩ Recommencer', value: 'restart'  }
    ], async (v) => {
      clearChoices();
      if (v === 'resume') {
        addUserBubble('Oui, continue');
        askDuration();
      } else {
        addUserBubble('Recommencer');
        guideMood = null; guideDuration = null; guideContext = null;
        clearSessionSnapshot();
        await delay(400);
        startFreshGuide();
      }
    });
    return;
  }

  guideMood = null;
  guideDuration = null;
  guideContext = null;
  clearSessionSnapshot();
  startFreshGuide();
}

async function startFreshGuide() {
  const hour = getCurrentHour();
  const greeting = (hour >= 6 && hour < 12) ? 'Bonjour'
    : (hour >= 12 && hour < 18) ? 'Bon après-midi'
    : 'Bonsoir';

  await delay(200);
  addBotBubble(greeting + ' 👋 Comment tu te sens en ce moment ?');
  await delay(400);
  showMoodChoices();
}

function showMoodChoices() {
  const choices = [
    { label: '😮‍💨 Stressé(e)',                value: 'stress'        },
    { label: '😰 Anxieux/se',                 value: 'anxiete'       },
    { label: '😤 En colère / irritable',       value: 'colere'        },
    { label: '😔 Mauvaise humeur / tristesse', value: 'tristesse'     },
    { label: '😴 Fatigué(e)',                 value: 'fatigue'       },
    { label: '😶 Brouillard mental',           value: 'brouillard'    },
    { label: '🌙 Difficultés à dormir',        value: 'sommeil'       },
    { label: '🎯 Besoin de concentration',     value: 'concentration' },
    { label: '🤷 Je ne sais pas vraiment',     value: 'unknown'       },
  ];

  if (isConcentrationBlocked()) {
    choices.find(c => c.value === 'concentration').disabled = true;
  }

  addChoices(choices, onMoodChoice);
}


async function onMoodChoice(value) {
  const labels = {
    stress: 'Stressé(e)', anxiete: 'Anxieux/se', fatigue: 'Fatigué(e)',
    brouillard: 'Brouillard mental', sommeil: 'Difficultés à dormir',
    concentration: 'Besoin de concentration', unknown: 'Je ne sais pas vraiment',
    colere: 'En colère / irritable', tristesse: 'Mauvaise humeur / tristesse'
  };
  addUserBubble(labels[value] || value);
  clearChoices();

  // Mode "Je ne sais pas"
  if (value === 'unknown') {
    await delay(400);
    addBotBubble("Pas de problème. Je te propose une petite pause de 2 minutes pour t'observer, puis on reprend ensemble.");
    await delay(600);
    addChoices([
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
    });
    return;
  }

  guideMood = value;
  saveSessionSnapshot();

  // Bloquer Concentration après 22h
  if (value === 'concentration' && isConcentrationBlocked()) {
    await delay(400);
    addBotBubble("À cette heure-ci, une séance de concentration risque de te tenir éveillé(e). Tu ne veux pas plutôt essayer quelque chose de plus doux ?");
    await delay(400);
    addChoices([
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
    });
    return;
  }

  // Q2 contextuelle uniquement pour stress/anxiete/sommeil — les autres moods
  // n'ont pas de sous-question car leur recommandation est uniforme quelle que
  // soit la nuance (ex: fatigue, brouillard, concentration, colere, tristesse).
  if (CONTEXT_QUESTIONS[value]) {
    await delay(400);
    addBotBubble(CONTEXT_QUESTIONS[value].question);
    await delay(400);
    addChoices(CONTEXT_QUESTIONS[value].choices, onContextChoice);
  } else {
    askDuration();
  }
}


async function showRestartError() {
  await delay(400);
  addBotBubble("Quelque chose s'est mal passé. On recommence ?");
  await delay(400);
  addChoices([{ label: '↩ Recommencer', value: 'restart' }], () => { restartGuide(); });
}

async function onDurationChoice(value) {
  guideDuration = value;
  addUserBubble({ court: '5 minutes', moyen: '5–10 minutes', long: 'Plus de 10 minutes' }[value]);
  clearChoices();

  const moodMap = GUIDE_MAP[guideMood];
  if (!moodMap) { showRestartError(); return; }
  const durationMap = moodMap[value];
  if (!durationMap) { showRestartError(); return; }

  const contextKey = guideContext && durationMap[guideContext] ? guideContext : 'default';
  const rawEntry = durationMap[contextKey];
  if (!rawEntry) { showRestartError(); return; }

  // Appliquer historique PUIS feedback
  let entry = applyHistoryToEntry(rawEntry);
  entry = applyFeedbackToEntry(entry, guideMood, guideDuration, guideContext);

  await delay(400);
  addBotBubble('Voilà ce que je te recommande :');
  await delay(400);
  showGuideResult(entry);
}



function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function addBotBubble(text) {
  const win = document.getElementById('chat-window');
  const row = document.createElement('div');
  row.className = 'chat-bot-row';
  const avatar = document.createElement('div');
  avatar.className = 'chat-bot-avatar';
  avatar.textContent = '🌿';
  const div = document.createElement('div');
  div.className = 'chat-bubble bot';
  div.textContent = text;
  row.appendChild(avatar);
  row.appendChild(div);
  win.appendChild(row);
  win.scrollTop = win.scrollHeight;
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
    if (c.disabled) btn.disabled = true;
    btn.onclick = () => {
      wrap.querySelectorAll('.chat-choice').forEach(b => { b.disabled = true; });
      cb(c.value);
    };
    wrap.appendChild(btn);
  });
  win.appendChild(wrap); win.scrollTop = win.scrollHeight;
}

function clearChoices() {
  const el = document.getElementById('current-choices');
  if (el) el.remove();
}


// ── MINUTEUR LIBRE ──
const bell = new Audio(AUDIO_BASE_URL + 'cloche.mp3');

function playBell() {
  if (localStorage.getItem('serein-bells') !== 'true') return;
  bell.currentTime = 0;
  bell.play().catch(() => {});
}

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
  playerEl.dataset.parcours = 'timer';
  document.getElementById('player-bg').style.backgroundImage = '';

  document.getElementById('player-artwork-wrap').style.display = 'none';
  document.getElementById('timer-display').style.display = 'flex';
  document.getElementById('player-progress').style.display = 'none';

  document.getElementById('player-title').textContent = 'Minuteur libre';
  document.getElementById('player-meta').textContent = minutes + ' min · Méditation silencieuse';
  document.getElementById('player-voice-tag').style.display = 'none';
  document.getElementById('audio-loading').textContent = '';

  setupMediaSession('Minuteur libre', minutes + ' min · Méditation silencieuse', 'assets/logo.png');

  updateTimerDisplay();

  document.getElementById('complete-screen').classList.remove('visible');
  document.getElementById('player-main').classList.remove('hidden');
  document.getElementById('player-main').style.display = 'flex';

  openPlayerScreen();

  timerElapsedBeforePause = 0;

  const timerEngine = document.getElementById('timer-engine');
  timerEngine.src = AUDIO_BASE_URL + 'timer-' + minutes + 'min.mp3';
  timerEngine.load();
  // Le MP3 démarre avec la cloche intégrée — pas de bell.play() séparé.
  // Si le fichier est absent on replie sur AudioContext + cloche seule.
  timerEngine.play().catch(() => {
    bell.currentTime = 0;
    bell.play().catch(() => {});
    startSilentSession();
  });

  setTimeout(() => {
    timerRunning = true;
    timerStartTimestamp = Date.now();
    updatePlayIcon(true);
    timerInterval = setInterval(timerTick, 1000);
  }, 1500);
}

function timerTick() {
  if (!timerRunning) return;
  const elapsed = timerElapsedBeforePause + (Date.now() - timerStartTimestamp);
  timerSecondsLeft = Math.max(0, timerTotalSeconds - Math.floor(elapsed / 1000));
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
  try {
    const s = getStats();
    s.sessions = (s.sessions || 0) + 1;
    s.minutes = (s.minutes || 0) + Math.round(timerTotalSeconds / 60);
    const today = new Date().toLocaleDateString('fr-CA');
    if (s.lastDate !== today) {
      s.streak = isYesterday(s.lastDate) ? (s.streak || 0) + 1 : 1;
      s.lastDate = today;
    }
    localStorage.setItem('serein-stats', JSON.stringify(s));
    loadStats();
  } catch(e) { console.warn('[Serein stats]', e); }
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
  window.open(mailto, '_blank');
}


// ── EXPORT / IMPORT DES DONNÉES (local-first, aucun serveur) ──
const DATA_KEYS = [
  'serein-stats', 'serein-history', 'serein-feedback', 'serein-guide-session',
  'serein-theme', 'serein-speed', 'serein-bells', 'serein-wifi-only',
  'serein-ambiance-default', 'serein-reminder-enabled', 'serein-reminder-time'
];

function exportData() {
  const payload = { app: 'serein', version: 1, exportedAt: new Date().toISOString(), data: {} };
  DATA_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) payload.data[k] = v;
  });
  const json = JSON.stringify(payload, null, 2);
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
  if (isNative && navigator.clipboard) {
    // Le téléchargement de Blob ne fonctionne pas dans la WebView native :
    // on passe par le presse-papiers.
    navigator.clipboard.writeText(json).then(
      () => alert('Données copiées dans le presse-papiers.\nColle-les dans une note ou un fichier pour les conserver.'),
      () => alert('Impossible de copier les données.')
    );
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'serein-donnees-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function importData() {
  document.getElementById('import-file-input').click();
}

function handleImportFile(input) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      if (!payload || payload.app !== 'serein' || !payload.data) {
        alert('Ce fichier ne ressemble pas à une sauvegarde Serein.');
        return;
      }
      if (!confirm('Remplacer les données actuelles par cette sauvegarde ?')) return;
      DATA_KEYS.forEach(k => {
        if (k in payload.data) localStorage.setItem(k, payload.data[k]);
      });
      applyTheme();
      loadSpeed();
      loadStats();
      loadPrefs();
      alert('Données restaurées.');
    } catch(e) {
      alert('Fichier illisible : ' + e.message);
    }
  };
  reader.readAsText(file);
}

// ── PONT NATIF : état de lecture ──
// Android ne démarre le service de premier plan (lecture écran verrouillé)
// que si quelque chose joue réellement (voir MainActivity / PlaybackStatePlugin).
function notifyNativePlayback() {
  try {
    const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PlaybackState;
    if (!P) return;
    const timerEngine = document.getElementById('timer-engine');
    const playing = (!audio.paused && !audio.ended)
      || (!!currentAmbiance && !ambianceAudio.paused)
      || timerRunning
      || !!(timerEngine && timerEngine.src && !timerEngine.paused);
    P.setPlaying({ playing: !!playing });
  } catch(e) {}
}

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
  // Stockage persistant : évite que le navigateur purge les séances
  // téléchargées hors ligne sous pression de stockage.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
  applyTheme();
  loadSpeed();
  loadStats();
  loadPrefs();
  await renderSessionList();
  restoreOfflineButtons();
  updateOfflineCount();

  // Swipe down to close ambient sound sheet
  const optionsSheet = document.getElementById('options-sheet');
  let swipeStartY = 0;
  optionsSheet.addEventListener('touchstart', e => {
    swipeStartY = e.touches[0].clientY;
  }, { passive: true });
  optionsSheet.addEventListener('touchend', e => {
    const delta = e.changedTouches[0].clientY - swipeStartY;
    if (delta > 60) toggleOptionsSheet();
  }, { passive: true });
});