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

// Pile d'overlays adossée à l'historique du navigateur : le bouton retour
// (Android, navigateur) ferme l'élément du dessus au lieu de quitter l'app.
const overlayStack = [];
let suppressPop = 0;
// Enchaînement sheet → player : on réutilise l'entrée d'historique de la sheet
// pour le player (un back() suivi d'un pushState immédiat se court-circuitent).
let reuseOverlayEntry = false;

function registerOverlay(name, closeFn) {
  if (reuseOverlayEntry) {
    reuseOverlayEntry = false;
    overlayStack.push({ name, closeFn });
    return;
  }
  overlayStack.push({ name, closeFn });
  try { history.pushState({ serein: name }, ''); } catch(e) {}
}

// Ferme visuellement une sheet et marque son entrée d'historique comme
// réutilisable par l'overlay qui s'ouvre juste après (ex : player).
function handOverOverlay(name) {
  const top = overlayStack[overlayStack.length - 1];
  if (top && top.name === name) {
    overlayStack.pop();
    reuseOverlayEntry = true;
  }
}

// Fermeture déclenchée par l'UI (bouton ✕, Annuler…) : on retire l'entrée
// d'historique correspondante sans redéclencher la fermeture au popstate.
function releaseOverlay(name) {
  const idx = overlayStack.map(o => o.name).lastIndexOf(name);
  if (idx === -1) return;
  overlayStack.splice(idx, 1);
  suppressPop++;
  try { history.back(); } catch(e) { suppressPop--; }
}

window.addEventListener('popstate', () => {
  if (suppressPop > 0) { suppressPop--; return; }
  const top = overlayStack.pop();
  if (top) { top.closeFn(); return; }
  // Pile vide : retour depuis un écran secondaire → accueil.
  const home = document.getElementById('home');
  if (home && !home.classList.contains('active')) showScreen('home');
});

function showScreen(id) {
  const wasHome = document.getElementById('home').classList.contains('active');
  SCREENS.forEach(s => {
    document.getElementById(s).classList.toggle('active', s === id);
    const btn = document.getElementById('nav-' + s);
    if (btn) btn.classList.toggle('active', s === id);
  });
  window.scrollTo(0, 0);
  if (id === 'guide') showGuideView('comprendre');
  // Garde d'historique : retour depuis un écran secondaire ramène à l'accueil.
  if (id !== 'guide') {
    let g;
    while ((g = overlayStack.find(o => o.name.startsWith('guide-')))) releaseOverlay(g.name);
  }
  if (id === 'home') {
    releaseOverlay('screen');
    renderResumeCard();
    renderDailySuggestion();
    updateMoodChips();
  } else if (wasHome && !overlayStack.some(o => o.name === 'screen')) {
    registerOverlay('screen', () => showScreen('home'));
  }
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
  document.querySelectorAll('#session-list .emotion-subgroup').forEach(el => {
    el.style.display = showEmotionSubs ? 'block' : 'none';
  });
  document.querySelectorAll('#session-list .emotion-disclaimer, #session-list .emotion-top-disclaimer, #session-list .emotion-ressources').forEach(el => {
    el.style.display = showEmotionSubs ? 'block' : 'none';
  });
  // Note éditoriale : seulement sur le catalogue complet, pas sur une liste filtrée
  const footer = document.getElementById('catalog-footer');
  if (footer) footer.style.display = (activeThemeFilter === 'Toutes' && activeDurationFilter === 'all') ? '' : 'none';
  updateFilterCount();
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
  if (el) el.textContent = count === 0 ? '' : count + ' séance' + (count > 1 ? 's' : '');
  const empty = document.getElementById('filter-empty');
  if (empty) empty.style.display = count === 0 ? '' : 'none';
}

function resetFilters() {
  const allBtn = document.querySelector('.filter-tabs.duration .tab[data-duration="all"]');
  if (allBtn) {
    document.querySelectorAll('.filter-tabs.duration .tab').forEach(t => t.classList.remove('active'));
    allBtn.classList.add('active');
    activeDurationFilter = 'all';
  }
  setExploreParcours(null);
}

// Les cartes parcours d'Explorer servent de filtre : une carte sélectionnée
// filtre la liste, la retaper (ou « Tout voir ») revient à toutes les séances.
function setExploreParcours(label) {
  activeThemeFilter = label || 'Toutes';
  document.querySelectorAll('.explore-parcours .path-card').forEach(card => {
    const h3 = card.querySelector('h3');
    card.classList.toggle('selected', !!label && h3 && h3.textContent === label);
  });
  applyFilters();
}

function exploreParcoursClick(label) {
  setExploreParcours(activeThemeFilter === label ? null : label);
}

function filterParcours(label) {
  showScreen('explore');
  setExploreParcours(label);
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
  card.dataset.title = s.title;

  const info = document.createElement('div');
  info.className = 'session-info';
  const h3 = document.createElement('h3');
  h3.textContent = s.title;
  const meta = document.createElement('p');
  meta.textContent = subgroupName
    ? group.name + ' · ' + subgroupName + ' · ' + durationLabel
    : group.name + ' · ' + durationLabel;
  info.appendChild(h3);
  if (s.desc) {
    const desc = document.createElement('p');
    desc.className = 'session-desc';
    desc.textContent = s.desc;
    info.appendChild(desc);
  }
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

let CATALOG = null; // catalogue chargé — réutilisé par la suggestion du moment et les compteurs

// Titres des séances déjà écoutées (historique partagé avec le guide)
function getListenedTitles() {
  try {
    return new Set((JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')).map(e => e.title));
  } catch(e) { return new Set(); }
}

// Coche ✓ sur les séances déjà écoutées
function updateSessionChecks() {
  const listened = getListenedTitles();
  document.querySelectorAll('.session-list .session-card').forEach(card => {
    const h3 = card.querySelector('h3');
    if (!h3) return;
    const done = listened.has(card.dataset.title);
    let check = h3.querySelector('.session-done-check');
    if (done && !check) {
      check = document.createElement('span');
      check.className = 'session-done-check';
      check.textContent = '✓';
      check.setAttribute('aria-label', 'Séance déjà écoutée');
      h3.appendChild(check);
    } else if (!done && check) {
      check.remove();
    }
  });
}

// Compteurs des cartes parcours : "7 séances" ou "3/7 séances" (calculés, plus de valeurs codées en dur)
function updatePathCardCounts() {
  if (!CATALOG) return;
  const listened = getListenedTitles();
  CATALOG.groups.forEach(group => {
    const sessions = group.subgroups ? group.subgroups.flatMap(sub => sub.sessions) : group.sessions;
    const done = sessions.filter(s => listened.has(s.title)).length;
    document.querySelectorAll('.path-card').forEach(card => {
      const h3 = card.querySelector('h3');
      const meta = card.querySelector('.meta');
      if (!h3 || !meta || h3.textContent !== group.name) return;
      meta.textContent = done > 0
        ? done + '/' + sessions.length + ' séances'
        : sessions.length + ' séances';
    });
  });
}

async function renderSessionList() {
  const list = document.getElementById('session-list');
  if (!list) return;
  try {
    const res = await fetch('assets/sessions.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const catalog = await res.json();
    CATALOG = catalog;
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
    updateSessionChecks();
    updatePathCardCounts();
    renderDailySuggestion();
  } catch(e) {
    console.warn('[Serein catalogue]', e);
    const msg = document.createElement('p');
    msg.style.cssText = 'text-align:center;color:var(--color-muted);padding:2rem 1rem;';
    msg.textContent = 'Impossible de charger le catalogue. Vérifie ta connexion puis relance l’app.';
    list.appendChild(msg);
  }
}

// ── VOICE OVERLAY ──
// Le choix de voix est mémorisé : l'overlay ne s'affiche qu'au tout premier
// lancement d'une séance à deux voix, puis se change dans les Réglages.
const VOICE_KEY = 'serein-voice';
let pendingSession = null;
let selectedVoice = 'masculine';
let voiceOverlayMode = 'launch'; // 'launch' | 'settings'

function getSavedVoice() {
  const v = localStorage.getItem(VOICE_KEY);
  return v === 'masculine' || v === 'feminine' ? v : null;
}

function voiceLabel(voice) {
  return voice === 'feminine' ? 'Voix féminine · Daïdrée' : 'Voix masculine · César';
}

function updateVoiceSettingLabel() {
  const el = document.getElementById('voice-default-label');
  if (!el) return;
  const saved = getSavedVoice();
  el.textContent = (saved ? (saved === 'feminine' ? 'Daïdrée' : 'César') : 'Au 1er lancement') + ' ›';
}

function openVoiceOverlay(id, title, parcours, duration, filenameMasc, filenameFem, artwork) {
  pendingSession = { id, title, parcours, duration, filenameMasc, filenameFem, artwork };
  if (!filenameFem) {
    launchPlayer(id, title, parcours, duration, filenameMasc, 'masculine', artwork);
    return;
  }
  const saved = getSavedVoice();
  if (saved) {
    const filename = saved === 'feminine' ? filenameFem : filenameMasc;
    launchPlayer(id, title, parcours, duration, filename, saved, artwork);
    return;
  }
  voiceOverlayMode = 'launch';
  selectedVoice = 'masculine';
  document.getElementById('voice-sheet-hint').style.display = '';
  document.getElementById('voice-sheet-launch').textContent = '▶ Lancer la séance';
  document.querySelectorAll('.voice-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('vopt-masculine').classList.add('selected');
  document.getElementById('voice-overlay').classList.add('open');
  registerOverlay('voice', () => document.getElementById('voice-overlay').classList.remove('open'));
}

// Depuis les Réglages : même sheet, mais on enregistre sans lancer de séance.
function openVoiceSettings() {
  voiceOverlayMode = 'settings';
  pendingSession = null;
  selectedVoice = getSavedVoice() || 'masculine';
  document.getElementById('voice-sheet-hint').style.display = 'none';
  document.getElementById('voice-sheet-launch').textContent = 'Enregistrer';
  document.querySelectorAll('.voice-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('vopt-' + selectedVoice).classList.add('selected');
  document.getElementById('voice-overlay').classList.add('open');
  registerOverlay('voice', () => document.getElementById('voice-overlay').classList.remove('open'));
}

function selectVoiceOption(voice) {
  selectedVoice = voice;
  document.querySelectorAll('.voice-option').forEach(o => o.classList.remove('selected'));
  document.getElementById('vopt-' + voice).classList.add('selected');
}

function closeVoiceOverlay() {
  document.getElementById('voice-overlay').classList.remove('open');
  releaseOverlay('voice');
}

function confirmVoiceAndLaunch() {
  try { localStorage.setItem(VOICE_KEY, selectedVoice); } catch(e) {}
  updateVoiceSettingLabel();
  haptic('light');
  if (voiceOverlayMode === 'settings' || !pendingSession) { closeVoiceOverlay(); return; }
  // Mode lancement : fermeture visuelle + l'entrée d'historique passe au player
  document.getElementById('voice-overlay').classList.remove('open');
  handOverOverlay('voice');
  const s = pendingSession;
  const filename = selectedVoice === 'feminine' && s.filenameFem ? s.filenameFem : s.filenameMasc;
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
  const el = document.getElementById('player-screen');
  const wasOpen = el.classList.contains('open');
  el.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (!wasOpen) registerOverlay('player', closePlayer);
  else reuseOverlayEntry = false; // replay : déjà enregistré, rien à réutiliser
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

  releaseOverlay('options');
  releaseOverlay('player');
  renderResumeCard();
  renderDailySuggestion();

  if (interruptedSnapshot) showInterruptedFeedbackToast(interruptedSnapshot);
}

function showInterruptedFeedbackToast(snap) {
  const existing = document.getElementById('interrupted-feedback-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'interrupted-feedback-toast';
  toast.style.cssText = [
    'position:fixed', 'bottom:80px', 'left:50%', 'transform:translateX(-50%)',
    'background:var(--color-surface-2)', 'border:1px solid var(--color-border)',
    'border-radius:16px', 'padding:.85rem 1.1rem', 'z-index:9999',
    'display:flex', 'flex-direction:column', 'align-items:center', 'gap:.55rem',
    'box-shadow:0 8px 32px rgba(0,0,0,.35)', 'max-width:320px', 'width:90%',
    'animation:fadeInUp .25s ease'
  ].join(';');

  const label = document.createElement('p');
  label.textContent = 'Comment était cette séance ?';
  label.style.cssText = 'font-size:.78rem;color:var(--color-muted);margin:0;text-align:center;';
  toast.appendChild(label);

  const btns = document.createElement('div');
  btns.style.cssText = 'display:flex;gap:.5rem;';

  [{ label: '😮 Trop intense', value: 'intense' }, { label: '✓ Bien', value: 'ok' }, { label: '🌿 Trop doux', value: 'doux' }, { label: '✕', value: 'dismiss' }].forEach(f => {
    const btn = document.createElement('button');
    btn.textContent = f.label;
    btn.style.cssText = [
      'background:var(--color-primary-light)', 'border:1px solid var(--color-border)',
      'border-radius:999px', 'color:var(--color-text)',
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
  const sheet = document.getElementById('options-sheet');
  const opening = !sheet.classList.contains('open');
  sheet.classList.toggle('open');
  if (opening) registerOverlay('options', () => sheet.classList.remove('open'));
  else releaseOverlay('options');
}

function launchPlayer(id, title, parcours, duration, filename, voice, artwork, resumeAt) {
  currentSession = { id, title, parcours, duration, filename, voice, artwork };
  currentOfflineFilename = filename;
  pendingResumeTime = (typeof resumeAt === 'number' && resumeAt > 0) ? resumeAt : null;

  // Artwork + fond flou
  const img = artwork || 'assets/logo.png';
  document.getElementById('player-artwork-img').src = img;
  document.getElementById('player-bg').style.backgroundImage = 'url(' + img + ')';

  // Infos
  document.getElementById('player-title').textContent = title;
  document.getElementById('player-meta').textContent = parcours + ' · ' + duration;
  document.getElementById('player-voice-tag').textContent = voice === 'feminine' ? 'Voix féminine · Daïdrée' : 'Voix masculine · César';

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
    if (!pendingResumeTime) playBell();
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
  haptic('light');
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
  saveResumePoint();
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
  if (pendingResumeTime && pendingResumeTime < audio.duration - 5) {
    audio.currentTime = pendingResumeTime;
  }
  pendingResumeTime = null;
});

audio.addEventListener('ended', () => {
  updatePlayIcon(false);
  playBell();
  haptic('success');
  clearResumePoint();
  document.getElementById('player-main').style.display = 'none';
  document.getElementById('player-main').classList.add('hidden');
  document.getElementById('complete-screen').classList.add('visible');
  if (currentSession) document.getElementById('complete-title').textContent = currentSession.title;
  recordCompletion();
  // Feedback de fin pour toutes les séances (sauf la mini-séance d'observation
  // du guide, qui enchaîne sur sa propre conversation).
  if (currentSession && currentSession.id !== 'observation') showCompletionFeedback();
});

// ── REPRISE DE LECTURE ──
// La position est sauvegardée pendant l'écoute ; une carte « Reprendre »
// sur l'accueil permet de relancer la séance là où elle s'était arrêtée.
const RESUME_KEY = 'serein-resume';
let pendingResumeTime = null;
let lastResumeSave = 0;

function saveResumePoint() {
  if (!currentSession || !audio.duration || currentSession.id === 'intro' || currentSession.id === 'observation') return;
  const now = Date.now();
  if (now - lastResumeSave < 5000) return; // throttle 5 s
  lastResumeSave = now;
  // Trop tôt ou presque fini : rien à reprendre
  if (audio.currentTime < 30 || audio.currentTime > audio.duration * 0.95) return;
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify({
      session: currentSession,
      time: Math.floor(audio.currentTime),
      total: Math.floor(audio.duration),
      ts: now
    }));
  } catch(e) {}
}

function clearResumePoint() {
  try { localStorage.removeItem(RESUME_KEY); } catch(e) {}
  renderResumeCard();
}

function getResumePoint() {
  try {
    const r = JSON.parse(localStorage.getItem(RESUME_KEY) || 'null');
    if (!r || !r.session || !r.time) return null;
    if (Date.now() - (r.ts || 0) > 14 * 24 * 3600 * 1000) return null; // expiré (14 j)
    return r;
  } catch(e) { return null; }
}

function renderResumeCard() {
  const block = document.getElementById('resume-block');
  if (!block) return;
  const r = getResumePoint();
  const playerOpen = document.getElementById('player-screen').classList.contains('open');
  if (!r || playerOpen) { block.style.display = 'none'; return; }
  document.getElementById('resume-title').textContent = r.session.title;
  const remaining = Math.max(0, r.total - r.time);
  document.getElementById('resume-meta').textContent =
    r.session.parcours + ' · ' + fmt(remaining) + ' restantes';
  const card = document.getElementById('resume-card');
  card.setAttribute('aria-label', 'Reprendre ' + r.session.title + ' à ' + fmt(r.time));
  card.onclick = () => {
    const s = r.session;
    launchPlayer(s.id, s.title, s.parcours, s.duration, s.filename, s.voice, s.artwork, r.time);
  };
  block.style.display = '';
  // Une seule carte contextuelle à la fois : Reprendre prime sur la suggestion
  const sugg = document.getElementById('suggestion-block');
  if (sugg) sugg.style.display = 'none';
}

// ── SUGGESTION DU MOMENT ──
// Pour les utilisateurs réguliers : une séance adaptée à l'heure, à un tap.
const SUGGESTION_ICONS = {
  lune:   '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>',
  vent:   '<svg class="icon-svg" viewBox="0 0 24 24"><path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2"/></svg>',
  cible:  '<svg class="icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
  soleil: '<svg class="icon-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>'
};

function pickSuggestion() {
  if (!CATALOG) return null;
  const h = new Date().getHours();
  let pick;
  if (h >= 21 || h < 5)      pick = { group: 'Sommeil',       icon: 'lune',   label: 'Pour préparer la nuit' };
  else if (h < 10)           pick = { group: 'Respirer',      icon: 'soleil', label: 'Pour bien démarrer la journée' };
  else if (h < 18)           pick = { group: 'Concentration', icon: 'cible',  label: 'Pour rester dans la zone' };
  else                       pick = { group: 'Émotions', sub: 'Stress', icon: 'vent', label: 'Pour souffler après la journée' };
  const group = CATALOG.groups.find(g => g.name === pick.group);
  if (!group) return null;
  let sessions = group.subgroups
    ? (pick.sub ? (group.subgroups.find(s => s.name === pick.sub) || group.subgroups[0]).sessions : group.subgroups.flatMap(s => s.sessions))
    : group.sessions;
  if (!sessions || !sessions.length) return null;
  // Privilégier une séance pas encore écoutée ; varier selon le jour sinon
  const listened = getListenedTitles();
  const fresh = sessions.filter(s => !listened.has(s.title));
  const pool = fresh.length ? fresh : sessions;
  const dayIdx = Math.floor(Date.now() / 86400000) % pool.length;
  return { session: pool[dayIdx], group, icon: pick.icon, label: pick.label };
}

function renderDailySuggestion() {
  const block = document.getElementById('suggestion-block');
  if (!block) return;
  const stats = getStats();
  const hasResume = !!getResumePoint();
  if ((stats.sessions || 0) === 0 || hasResume) { block.style.display = 'none'; return; }
  const sugg = pickSuggestion();
  if (!sugg) { block.style.display = 'none'; return; }
  const s = sugg.session;
  document.getElementById('suggestion-emoji').innerHTML = SUGGESTION_ICONS[sugg.icon] || SUGGESTION_ICONS.vent;
  document.getElementById('suggestion-label').textContent = sugg.label;
  document.getElementById('suggestion-title').textContent = s.title;
  document.getElementById('suggestion-meta').textContent = sugg.group.name + ' · ' + s.duration + ' min';
  const card = document.getElementById('suggestion-card');
  card.setAttribute('aria-label', 'Lancer la séance suggérée : ' + s.title + ', ' + s.duration + ' minutes');
  card.onclick = () => openVoiceOverlay(s.id, s.title, sugg.group.name, s.duration + ' min', s.file, s.fileFem || false, sugg.group.artwork);
  block.style.display = '';
}

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
  if (welcomeBlock) welcomeBlock.style.display = hasSession ? 'none' : 'block';
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
    // Historique partagé : alimente les coches « déjà écoutée », la progression
    // des parcours et les recommandations du guide.
    if (currentSession && currentSession.id !== 'intro' && currentSession.id !== 'observation') {
      recordGuidePlay(currentSession.title);
      updateSessionChecks();
      updatePathCardCounts();
    }
  } catch(e) { console.warn('[Serein stats]', e); }
}

// ── THÈME ──
// Trois modes : light / dark / auto (par défaut, suit prefers-color-scheme).
// Le script anti-flash du <head> applique le même calcul avant le premier rendu.
const lightSchemeQuery = window.matchMedia('(prefers-color-scheme: light)');

function getThemeMode() {
  const t = localStorage.getItem('serein-theme');
  return (t === 'light' || t === 'dark') ? t : 'auto';
}

function setThemeMode(mode) {
  localStorage.setItem('serein-theme', mode);
  applyTheme();
}

function updateThemeSegButtons() {
  const mode = getThemeMode();
  ['light', 'auto', 'dark'].forEach(m => {
    const btn = document.getElementById('seg-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });
}

function applyTheme() {
  const mode = getThemeMode();
  const light = mode === 'light' || (mode === 'auto' && lightSchemeQuery.matches);
  if (light) document.documentElement.setAttribute('data-theme', 'light');
  else document.documentElement.removeAttribute('data-theme');
  updateThemeSegButtons();
}

// Le système change de thème pendant que l'app est ouverte (ex. bascule auto au coucher du soleil)
lightSchemeQuery.addEventListener('change', () => { if (getThemeMode() === 'auto') applyTheme(); });

const AMBIANCE_LABELS = { '': 'Aucun', 'pluie.mp3': 'Pluie', 'foret.mp3': 'Forêt', 'vagues.mp3': 'Vagues', 'feu.mp3': 'Feu', 'bruit-blanc.mp3': 'Blanc' };

function openAmbianceSettings() {
  const saved = localStorage.getItem('serein-ambiance-default') || '';
  document.querySelectorAll('.ambiance-settings-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === saved);
  });
  document.getElementById('ambiance-settings-backdrop').classList.add('open');
  registerOverlay('ambiance-settings', () => document.getElementById('ambiance-settings-backdrop').classList.remove('open'));
}

function closeAmbianceSettings() {
  document.getElementById('ambiance-settings-backdrop').classList.remove('open');
  releaseOverlay('ambiance-settings');
}

function selectAmbianceDefault(btn) {
  document.querySelectorAll('.ambiance-settings-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const val = btn.dataset.value;
  localStorage.setItem('serein-ambiance-default', val);
  const label = document.getElementById('ambiance-default-label');
  if (label) label.textContent = (AMBIANCE_LABELS[val] || 'Aucun') + ' ›';
  haptic('light');
  setTimeout(closeAmbianceSettings, 300);
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

// « Comprendre » (articles + FAQ) est la racine de l'onglet Apprendre ;
// le chat et le lecteur d'article sont des sous-vues (retour → comprendre).
const GUIDE_DEPTH = { comprendre: 0, chat: 1, article: 1 };
let currentGuideView = 'comprendre';

function showGuideView(view) {
  const comprendre = document.getElementById('guide-comprendre');
  const chat = document.getElementById('guide-chat');
  const article = document.getElementById('guide-article');
  if (!comprendre) return;
  const from = currentGuideView;
  currentGuideView = view;
  comprendre.style.display = view === 'comprendre' ? '' : 'none';
  chat.style.display = view === 'chat' ? '' : 'none';
  if (article) article.style.display = view === 'article' ? '' : 'none';
  if (view === 'chat') initGuide();
  window.scrollTo(0, 0);
  // Bouton retour : chaque niveau de profondeur du guide est une entrée d'historique
  const dFrom = GUIDE_DEPTH[from] || 0;
  const dTo = GUIDE_DEPTH[view] || 0;
  if (dTo > dFrom) {
    for (let d = dFrom + 1; d <= dTo; d++) {
      registerOverlay('guide-' + d, () => showGuideView('comprendre'));
    }
  } else if (dTo < dFrom) {
    for (let d = dFrom; d > dTo; d--) releaseOverlay('guide-' + d);
  }
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

Pour commencer, il n'est pas nécessaire de s'isoler pendant des heures. Une minute suffit. Laisse ta respiration suivre son rythme naturel. Observe l'air entrer et sortir. Si une pensée surgit, note simplement sa présence, puis reviens à la sensation physique de l'air. C'est le premier pas vers une meilleure flexibilité psychologique.`
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

- **Le dos droit :** La colonne vertébrale s'érige naturellement, respectant sa courbure. Imagine un fil invisible qui tire doucement le sommet du crâne vers le plafond.

- **Les épaules relâchées :** Elles s'abaissent loin des oreilles, libérant la cage thoracique pour faciliter la respiration.

- **Les mains au repos :** Simplement posées à plat sur les cuisses ou réunies au centre des genoux.

L'immobilité n'est pas une règle absolue. Si une douleur aiguë apparaît, l'ajustement de la posture, fait en pleine conscience, fait partie intégrante de la pratique.`
  },

  'pensees': {
    title: 'Que faire des pensées ?',
    meta: 'Les laisser passer · 3 min de lecture',
    md: `C'est l'idée reçue la plus fréquente et la plus décourageante : "Je n'arrive pas à méditer, je n'arrive pas à faire le vide dans ma tête."

Soyons clairs : le cerveau est conçu pour produire des pensées. Essayer d'arrêter de penser est aussi impossible que d'essayer d'arrêter son cœur de battre par la seule force de la volonté. L'objectif de la pleine conscience n'est pas de supprimer les pensées, mais de changer la relation que l'on entretient avec elles.

### La défusion cognitive : tu n'es pas tes pensées

En TCC, on utilise le concept de "défusion cognitive". Habituellement, nous sommes "fusionnés" avec nos pensées : si l'esprit dit "je n'y arriverai pas", on le croit immédiatement.

La méditation permet de faire un pas de recul. Elle nous apprend à regarder **nos** pensées, plutôt qu'à regarder le monde **à travers** nos pensées. Une pensée devient un simple événement mental, comme un son ou une sensation physique. Elle apparaît, existe un instant, puis disparaît, si on ne l'alimente pas.

### La technique de l'étiquetage

Quand une pensée surgit pendant la pratique et détourne l'attention, voici l'approche à adopter :

1. **L'accueillir :** Ne lutte pas contre la distraction. Remarque simplement que l'esprit s'est égaré.

2. **L'étiqueter :** Pose un mot mental neutre sur ce qui t'a distrait ("pensée", "souvenir", "planification"). Cela crée instantanément une distance.

3. **Laisser passer :** Ramène doucement, mais fermement, ton attention vers ton point d'ancrage (la respiration ou le corps).

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
    localStorage.removeItem('serein-mood-log');
    localStorage.removeItem('serein-support-shown');
    document.documentElement.classList.remove('has-sessions');
    loadStats();
  } catch(e) {}
}

// ── GUIDE CHATBOT ──
// Chaque entrée = une recommandation principale + des alternatives.
// Format : { main: { id, reason }, alts: [{ id, reason }] } — seul l'id de la
// séance est stocké : titre, fichier, durée, parcours et artwork sont résolus
// depuis le catalogue (sessions.json) au moment de l'affichage, ce qui évite
// toute dérive entre le guide et le catalogue.
const GUIDE_MAP = {
  'stress': {
    'court': {
      'corps':   { main: { id: 's6', reason: "Régule le système nerveux en quelques respirations" }, alts: [{ id: 's5', reason: 'Court et ciblé pour couper la tension physique' }] },
      'tete':    { main: { id: 's5', reason: "Rapide et ciblé pour couper le mental net" }, alts: [{ id: 's16', reason: "Pour ancrer l'attention ici et maintenant" }] },
      'default': { main: { id: 's5', reason: 'Rapide et ciblé pour couper le stress net' }, alts: [{ id: 's16', reason: "Pour ancrer l'attention ici et maintenant" }] }
    },
    'moyen': {
      'corps':   { main: { id: 's4', reason: "Relâche les tensions physiques stockées dans le corps" }, alts: [{ id: 's6', reason: "Régule le système nerveux rapidement" }] },
      'tete':    { main: { id: 's6', reason: 'Régule le système nerveux en quelques minutes' }, alts: [{ id: 's31', reason: "Pour sortir du mode urgence mental" }] },
      'default': { main: { id: 's6', reason: 'Régule le système nerveux en quelques minutes' }, alts: [{ id: 's31', reason: "Pour sortir du mode urgence" }] }
    },
    'long': {
      'corps':   { main: { id: 's4', reason: "Pour relâcher en profondeur les tensions physiques" }, alts: [{ id: 's29', reason: "Travaille directement sur les tensions corporelles du stress" }] },
      'tete':    { main: { id: 's31', reason: "Pour déposer le mental en mode urgence" }, alts: [{ id: 's4', reason: "Redescendre dans le corps pour sortir du mental" }] },
      'default': { main: { id: 's6', reason: 'Régule le système nerveux en profondeur' }, alts: [{ id: 's4', reason: 'Pour relâcher les tensions physiques du stress' }] }
    }
  },
  'anxiete': {
    'court': {
      'soudaine': { main: { id: 's11', reason: "Technique d'ancrage pour calmer l'agitation vite" }, alts: [{ id: 's10', reason: "Active le système parasympathique rapidement" }] },
      'fond':     { main: { id: 's16', reason: "Pour sortir du flot de pensées anxieuses de fond" }, alts: [{ id: 's11', reason: "Ancrage sensoriel pour calmer le fond d'inquiétude" }] },
      'default':  { main: { id: 's11', reason: "Technique d'ancrage pour calmer l'agitation vite" }, alts: [{ id: 's16', reason: 'Pour sortir du flot de pensées anxieuses' }] }
    },
    'moyen': {
      'soudaine': { main: { id: 's10', reason: "La respiration 4-7-8 active le système parasympathique" }, alts: [{ id: 's13', reason: "Recentre l'attention sur le présent par les sens" }] },
      'fond':     { main: { id: 's13', reason: "Ancrage sensoriel pour sortir du fond d'inquiétude" }, alts: [{ id: 's10', reason: "Régule le souffle pour apaiser l'inquiétude chronique" }] },
      'default':  { main: { id: 's10', reason: "La respiration 4-7-8 active le système parasympathique" }, alts: [{ id: 's13', reason: "Recentre l'attention sur le présent par les sens" }] }
    },
    'long': {
      'soudaine': { main: { id: 's24', reason: "Travailler directement la réaction physique à l'anxiété soudaine" }, alts: [{ id: 's14', reason: "Pour travailler sur les ruminations qui alimentent l'anxiété" }] },
      'fond':     { main: { id: 's14', reason: 'Pour travailler directement sur les ruminations de fond' }, alts: [{ id: 's12', reason: 'Approche douce, laisser passer plutôt que résister' }] },
      'default':  { main: { id: 's14', reason: 'Pour travailler directement sur les ruminations' }, alts: [{ id: 's12', reason: 'Approche douce, laisser passer plutôt que résister' }] }
    }
  },
  'sommeil': {
    'court': {
      'precoucher': { main: { id: 's7', reason: "Prépare le corps et l'esprit au coucher" }, alts: [{ id: 's6', reason: "Pour calmer le système nerveux avant de dormir" }] },
      'reveil':     { main: { id: 's8', reason: "Spécialement conçu pour les réveils en pleine nuit" }, alts: [{ id: 's10', reason: 'Technique reconnue pour se rendormir rapidement' }] },
      'default':    { main: { id: 's7', reason: "Prépare le corps et l'esprit au coucher" }, alts: [{ id: 's6', reason: "Pour calmer le système nerveux avant de dormir" }] }
    },
    'moyen': {
      'precoucher': { main: { id: 's7', reason: "Coupe le flux mental de la journée" }, alts: [{ id: 's20', reason: "Relaxation progressive pour glisser vers le sommeil" }] },
      'reveil':     { main: { id: 's8', reason: "Spécialement conçu pour les réveils à 3h du matin" }, alts: [{ id: 's7', reason: "Pour se recoucher sereinement" }] },
      'default':    { main: { id: 's7', reason: "Coupe le flux mental de la journée" }, alts: [{ id: 's10', reason: "Technique reconnue pour faciliter l'endormissement" }] }
    },
    'long': {
      'precoucher': { main: { id: 's19', reason: "Accompagne doucement vers un endormissement profond" }, alts: [{ id: 's8', reason: "Pour une nuit complète apaisée" }] },
      'reveil':     { main: { id: 's8', reason: 'Pour les nuits agitées et les réveils à 3h' }, alts: [{ id: 's7', reason: 'Prépare en douceur un endormissement profond' }] },
      'default':    { main: { id: 's8', reason: 'Pour les nuits agitées et les réveils à 3h' }, alts: [{ id: 's7', reason: 'Prépare en douceur un endormissement profond' }] }
    }
  },
  // Humeurs sans Q3 — structure plate conservée
  'fatigue': {
    'court': { 'default': { main: { id: 's16', reason: 'Court et doux pour recharger sans effort' }, alts: [{ id: 's1', reason: 'Idéal pour une première pause dans la journée' }] } },
    'moyen': { 'default': { main: { id: 's17', reason: 'Pour se recharger en douceur sans se juger' }, alts: [{ id: 's4', reason: 'Relâche les tensions physiques accumulées' }, { id: 's45', reason: "Quand la fatigue vient d'une perte d'élan intérieur" }] } },
    'long':  { 'default': { main: { id: 's8', reason: "Si la fatigue vient d'un sommeil perturbé" }, alts: [{ id: 's18', reason: 'Pour trouver un point de stabilité dans la journée' }, { id: 's45', reason: "Quand la fatigue cache une perte de sens ou d'envie" }] } }
  },
  'brouillard': {
    'court': { 'default': { main: { id: 's2', reason: "Parfois s'arrêter suffit à y voir plus clair" }, alts: [{ id: 's16', reason: "Pour sortir du flou en se recentrant sur le souffle" }] } },
    'moyen': { 'default': { main: { id: 's3', reason: "Prendre du recul sur le flux mental" }, alts: [{ id: 's15', reason: "Pour clarifier l'esprit et retrouver le focus" }, { id: 's45', reason: "Quand le brouillard cache une perte d'envie ou d'élan" }] } },
    'long':  { 'default': { main: { id: 's18', reason: "Construire un point de stabilité mental durable" }, alts: [{ id: 's3', reason: "Pour observer le brouillard sans s'y perdre" }] } }
  },
  'concentration': {
    'court': { 'default': { main: { id: 's15', reason: "Clarifie l'esprit avant une tâche importante" }, alts: [{ id: 's16', reason: 'Plus court, pour une mise en route rapide' }] } },
    'moyen': { 'default': { main: { id: 's15', reason: "Prépare le mental à entrer dans la zone" }, alts: [{ id: 's3', reason: "Pour vider le mental avant de se concentrer" }] } },
    'long':  { 'default': { main: { id: 's33', reason: 'Pour atteindre un état de concentration profonde' }, alts: [{ id: 's32', reason: "Prépare l'esprit avant une session de travail intense" }] } }
  },
  'colere': {
    'court': { 'default': { main: { id: 's37', reason: "Décharger l'énergie de la colère immédiatement, sans l'alimenter" }, alts: [{ id: 's44', reason: "Quand l'irritation couve plutôt qu'elle n'éclate" }] } },
    'moyen': { 'default': { main: { id: 's44', reason: "Pour traverser l'irritation et revenir au calme" }, alts: [{ id: 's37', reason: "Pour une décharge rapide si la colère remonte" }] } },
    'long':  { 'default': { main: { id: 's44', reason: "Pour aller en profondeur dans ce que l'irritabilité exprime" }, alts: [{ id: 's26', reason: "Déposer la tension et la colère accumulées sur la journée" }] } }
  },
  'tristesse': {
    'court': { 'default': { main: { id: 's40', reason: "Accueillir l'humeur difficile sans la combattre" }, alts: [{ id: 's17', reason: "Pour s'accompagner avec douceur dans les moments durs" }] } },
    'moyen': { 'default': { main: { id: 's40', reason: "Traverser la tristesse ou la mauvaise humeur avec douceur" }, alts: [{ id: 's45', reason: "Réamorcer l'élan quand tout semble terne" }] } },
    'long':  { 'default': { main: { id: 's45', reason: "Réamorcer l'élan quand la tristesse ou le vide s'installe" }, alts: [{ id: 's40', reason: "Pour traverser une tristesse de fond avec douceur" }] } }
  }
};

// ── Résolution des recommandations ──
// Le guide ne stocke que des ids : tout le reste vient du catalogue.
const GUIDE_EMOJIS = { 'Premiers pas': '🌱', 'Stress': '😮‍💨', 'Colère': '😤', 'Tristesse': '☁️', 'Émotions': '🌿', 'Sommeil': '🌙', 'Respirer': '🌬️', 'Anxiété': '🤍', 'Concentration': '🎯' };

function findSessionById(id) {
  if (!CATALOG) return null;
  for (const group of CATALOG.groups) {
    const lists = group.subgroups
      ? group.subgroups.map(sub => ({ sub, sessions: sub.sessions }))
      : [{ sub: null, sessions: group.sessions }];
    for (const { sub, sessions } of lists) {
      const session = sessions.find(s => s.id === id);
      if (session) return { session, group, sub };
    }
  }
  return null;
}

function recFromSession(session, group, sub, reason) {
  return {
    title: session.title,
    parcours: group.name,
    duration: session.duration + ' min',
    file: session.file,
    fileFem: session.fileFem || false,
    emoji: (sub && GUIDE_EMOJIS[sub.name]) || GUIDE_EMOJIS[group.name] || '🌿',
    artwork: group.artwork,
    reason
  };
}

function resolveRec(ref) {
  const found = findSessionById(ref.id);
  if (!found) {
    console.warn('[Serein guide] id introuvable dans le catalogue :', ref.id);
    return null;
  }
  return recFromSession(found.session, found.group, found.sub, ref.reason);
}

function resolveEntry(rawEntry) {
  const main = resolveRec(rawEntry.main);
  if (!main) return null;
  return { main, alts: (rawEntry.alts || []).map(resolveRec).filter(Boolean) };
}

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
          if (!e.main || !e.main.id) warnings.push(`GUIDE_MAP: pas de 'main.id' pour ${mood}/${dur}/${ctxKey}`);
          if (!e.alts) warnings.push(`GUIDE_MAP: pas de 'alts' pour ${mood}/${dur}/${ctxKey}`);
          else e.alts.forEach((a, i) => { if (!a.id) warnings.push(`GUIDE_MAP: alt ${i} sans id pour ${mood}/${dur}/${ctxKey}`); });
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
const MOOD_LOG_KEY = 'serein-mood-log';
const SUPPORT_SHOWN_KEY = 'serein-support-shown';

// ── Validation : accueillir ce que la personne vient de dire avant d'enchaîner ──
const MOOD_VALIDATIONS = {
  stress: [
    "Le stress, c'est ton corps qui veut bien faire, un peu trop fort.",
    "Faire une pause quand ça monte, c'est déjà agir dessus."
  ],
  anxiete: [
    "L'anxiété est inconfortable, mais elle ne te met pas en danger.",
    "La remarquer, c'est déjà reprendre un peu de prise."
  ],
  colere: [
    "La colère est une information, pas un défaut.",
    "Une émotion qui monte cherche surtout à être entendue."
  ],
  tristesse: [
    "La tristesse a le droit d'être là.",
    "Elle n'a pas besoin d'être réparée pour mériter de l'attention."
  ],
  fatigue: [
    "La fatigue se respecte.",
    "Le repos est une forme de pratique à part entière."
  ],
  brouillard: [
    "Le brouillard mental se dissipe rarement en forçant.",
    "Clarifier l'esprit commence souvent par ralentir."
  ],
  sommeil: [
    "Le sommeil se prépare, il ne se force pas.",
    "Ralentir avant de dormir, c'est déjà se mettre dans de bonnes conditions."
  ],
  concentration: [
    "Rassembler l'attention quelques minutes fait souvent gagner du temps.",
    "Mieux vaut dix minutes posées qu'une heure dispersée."
  ]
};

function pickValidation(mood) {
  const pool = MOOD_VALIDATIONS[mood];
  return pool ? pool[Math.floor(Math.random() * pool.length)] : "OK, on va trouver ce qu'il te faut.";
}

// Journal local des humeurs choisies (30 jours) — sert uniquement au filet de
// sécurité ci-dessous, comme tout le reste : rien ne quitte l'appareil.
function recordMoodChoice(mood) {
  try {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const log = JSON.parse(localStorage.getItem(MOOD_LOG_KEY) || '[]').filter(e => e.ts > cutoff);
    log.push({ mood, ts: Date.now() });
    localStorage.setItem(MOOD_LOG_KEY, JSON.stringify(log));
  } catch(e) {}
}

// Filet de sécurité : si la tristesse revient souvent (3+ fois sur 7 jours),
// orienter doucement vers de vraies ressources — au plus une fois par semaine.
function maybeOfferSupport() {
  if (guideMood !== 'tristesse') return;
  try {
    const week = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - parseInt(localStorage.getItem(SUPPORT_SHOWN_KEY) || '0', 10) < week) return;
    const log = JSON.parse(localStorage.getItem(MOOD_LOG_KEY) || '[]');
    if (log.filter(e => e.mood === 'tristesse' && e.ts > Date.now() - week).length < 3) return;
    const emotions = CATALOG && CATALOG.groups.find(g => g.name === 'Émotions');
    if (!emotions || !emotions.resources) return;
    const wrap = document.querySelector('#guide-result .guide-result-wrap');
    if (!wrap) return;
    localStorage.setItem(SUPPORT_SHOWN_KEY, String(Date.now()));
    const note = document.createElement('div');
    note.className = 'guide-support-note';
    const p = document.createElement('p');
    p.textContent = "Je remarque que la tristesse revient souvent ces derniers temps. Une appli peut accompagner, mais en parler à quelqu'un aide davantage. Si tu en ressens le besoin :";
    note.appendChild(p);
    note.appendChild(makeResourcesBlock(emotions.resources));
    wrap.insertBefore(note, wrap.querySelector('.guide-restart'));
  } catch(e) {}
}

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

// Applique le biais d'intensité : « trop intense » → alternative plus douce
// en principal ; « trop doux » → alternative plus longue/profonde en principal.
function applyFeedbackToEntry(entry, mood, duration, context) {
  if (!entry) return entry;
  const bias = getIntensityBias(mood, duration, context);
  if (!bias || !entry.alts || entry.alts.length === 0) return entry;

  const result = { main: entry.main, alts: [...entry.alts] };

  if (bias === 'softer') {
    const softerAlt = result.alts.find(a =>
      parseInt(a.duration) <= parseInt(result.main.duration)
    );
    if (softerAlt) {
      const idx = result.alts.indexOf(softerAlt);
      result.alts[idx] = { ...result.main, reason: result.main.reason + ' (ajusté selon tes retours)' };
      result.main = { ...softerAlt, reason: softerAlt.reason + ' (plus doux, selon tes préférences)' };
    }
  } else if (bias === 'harder') {
    const harderAlt = result.alts.find(a =>
      parseInt(a.duration) >= parseInt(result.main.duration)
    );
    if (harderAlt) {
      const idx = result.alts.indexOf(harderAlt);
      result.alts[idx] = { ...result.main, reason: result.main.reason + ' (ajusté selon tes retours)' };
      result.main = { ...harderAlt, reason: harderAlt.reason + ' (plus profond, selon tes préférences)' };
    }
  }
  return result;
}

// Retour par séance : une séance précise jugée « trop intense » à répétition
// (≥ 2 fois sur 30 jours) est rétrogradée en alternative quand elle sort en principal.
function getIntenseTitles() {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    if (!raw) return new Set();
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const counts = {};
    for (const e of JSON.parse(raw)) {
      if (e.rating === 'intense' && e.title && e.ts > cutoff) counts[e.title] = (counts[e.title] || 0) + 1;
    }
    return new Set(Object.keys(counts).filter(t => counts[t] >= 2));
  } catch(e) { return new Set(); }
}

function applyTitleFeedback(entry) {
  if (!entry || !entry.alts || entry.alts.length === 0) return entry;
  const intense = getIntenseTitles();
  if (!intense.has(entry.main.title)) return entry;
  const idx = entry.alts.findIndex(a => !intense.has(a.title));
  if (idx === -1) return entry;
  const promoted = entry.alts[idx];
  const alts = [...entry.alts];
  alts[idx] = { ...entry.main, reason: entry.main.reason + ' (tu l\'as souvent trouvée intense)' };
  return { main: { ...promoted, reason: promoted.reason + ' (plus adaptée, selon tes retours)' }, alts };
}

// Variété : si tout (principal + alternatives) a déjà été écouté récemment,
// pioche une séance fraîche du même thème directement dans le catalogue.
const MOOD_PARCOURS = {
  stress:        { group: 'Émotions', sub: 'Stress' },
  anxiete:       { group: 'Anxiété' },
  colere:        { group: 'Émotions', sub: 'Colère' },
  tristesse:     { group: 'Émotions', sub: 'Tristesse' },
  fatigue:       { group: 'Premiers pas' },
  brouillard:    { group: 'Concentration' },
  sommeil:       { group: 'Sommeil' },
  concentration: { group: 'Concentration' }
};

function applyCatalogVariety(entry, mood, duration) {
  if (!entry || !CATALOG) return entry;
  const played = new Set(getRecentHistory().map(e => e.title));
  if (![entry.main, ...entry.alts].every(r => played.has(r.title))) return entry;
  const target = MOOD_PARCOURS[mood];
  if (!target) return entry;
  const group = CATALOG.groups.find(g => g.name === target.group);
  if (!group) return entry;
  const sub = target.sub && group.subgroups ? group.subgroups.find(s => s.name === target.sub) : null;
  const pool = sub ? sub.sessions
    : (group.subgroups ? group.subgroups.flatMap(s => s.sessions) : group.sessions);
  const maxMin = duration === 'court' ? 6 : (duration === 'moyen' ? 10 : 99);
  const inEntry = new Set([entry.main.title, ...entry.alts.map(a => a.title)]);
  const fresh = pool.find(s => !played.has(s.title) && !inEntry.has(s.title) && s.duration <= maxMin)
             || pool.find(s => !played.has(s.title) && !inEntry.has(s.title));
  if (!fresh) return entry;
  const rec = recFromSession(fresh, group, sub, 'Pour varier : une séance du même thème que tu n\'as pas encore écoutée');
  return { main: rec, alts: [entry.main, ...entry.alts].slice(0, 2) };
}

// Feedback en fin de séance — pour les séances guidées (contexte du guide)
// comme pour les séances lancées directement (mood/contexte inconnus).
function showCompletionFeedback() {
  const completeScreen = document.getElementById('complete-screen');
  if (!completeScreen) return;

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
        // Hors guide, mood/durée/contexte sont inconnus : le retour reste
        // rattaché au titre et nourrit les recommandations.
        saveFeedback(guideMood || null, guideDuration || null, guideContext || null, currentSession.title, f.value);
      }
      haptic('light');
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

// ── Chips d'humeur de l'accueil ──
// Un tap ouvre le guide conversationnel avec la première réponse déjà donnée.
let pendingHomeMood = null;

function openGuideMood(value) {
  pendingHomeMood = value;
  guideInitialized = false; // repart sur une conversation propre
  showScreen('guide');
  showGuideView('chat');
}

// Concentration déconseillée la nuit : le chip suit la même règle que le chat.
function updateMoodChips() {
  const chip = document.getElementById('mood-chip-concentration');
  if (chip) chip.style.display = isConcentrationBlocked() ? 'none' : '';
}

async function initGuide() {
  if (guideInitialized) return;
  guideInitialized = true;

  const win = document.getElementById('chat-window');
  const res = document.getElementById('guide-result');
  win.innerHTML = '';
  res.style.display = 'none';
  res.innerHTML = '';

  // Humeur pré-choisie depuis l'accueil : conversation neuve, pas de reprise
  if (pendingHomeMood) {
    guideMood = null;
    guideDuration = null;
    guideContext = null;
    clearSessionSnapshot();
    startFreshGuide();
    return;
  }

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
  if (pendingHomeMood) {
    const mood = pendingHomeMood;
    pendingHomeMood = null;
    onMoodChoice(mood);
    return;
  }
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
  recordMoodChoice(value);

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

  // Accueillir ce qui vient d'être dit avant d'enchaîner sur les questions
  await delay(450);
  addBotBubble(pickValidation(value));

  // Q2 contextuelle uniquement pour stress/anxiete/sommeil — les autres moods
  // n'ont pas de sous-question car leur recommandation est uniforme quelle que
  // soit la nuance (ex: fatigue, brouillard, concentration, colere, tristesse).
  if (CONTEXT_QUESTIONS[value]) {
    await delay(500);
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

  // Ids → séances du catalogue, puis personnalisation locale :
  // historique récent → variété catalogue → retours par séance → biais d'intensité
  const resolved = resolveEntry(rawEntry);
  if (!resolved) { showRestartError(); return; }
  let entry = applyHistoryToEntry(resolved);
  entry = applyCatalogVariety(entry, guideMood, guideDuration);
  entry = applyTitleFeedback(entry);
  entry = applyFeedbackToEntry(entry, guideMood, guideDuration, guideContext);

  await delay(400);
  addBotBubble('Voilà ce que je te recommande :');
  await delay(400);
  showGuideResult(entry);
  maybeOfferSupport();
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
  registerOverlay('timer-sheet', () => document.getElementById('timer-sheet-backdrop').classList.remove('open'));
}

function closeTimerSheet() {
  document.getElementById('timer-sheet-backdrop').classList.remove('open');
  releaseOverlay('timer-sheet');
}

function startTimer(minutes) {
  haptic('light');
  // Fermeture visuelle de la sheet ; son entrée d'historique passe au player
  document.getElementById('timer-sheet-backdrop').classList.remove('open');
  handOverOverlay('timer-sheet');
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

  setupMediaSession('Minuteur libre', minutes + ' min · Méditation silencieuse', window.location.origin + '/assets/icon-512.png');

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
    haptic('success');
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
  registerOverlay('report', () => document.getElementById('report-sheet-backdrop').classList.remove('open'));
}

function closeReportSheet() {
  document.getElementById('report-sheet-backdrop').classList.remove('open');
  releaseOverlay('report');
}

function sendReport(type) {
  closeReportSheet();
  const title = currentSession ? currentSession.title : 'séance inconnue';
  const parcours = currentSession ? currentSession.parcours : '';

  let subject, body;

  if (type === 'track') {
    subject = `[Serein] Problème signalé : ${title}`;
    body = `Bonjour,

Je souhaite signaler un problème sur la séance suivante :

Séance : ${title}
Parcours : ${parcours}

Description du problème :
[décris ici ce que tu as constaté]

---
Envoyé depuis sereinapp.fr`;
  } else {
    const currentTime = audio.currentTime ? fmt(audio.currentTime) : '0:00';
    subject = `[Serein] Problème signalé à ${currentTime} : ${title}`;
    body = `Bonjour,

Je souhaite signaler un problème à un moment précis de la séance suivante :

Séance : ${title}
Parcours : ${parcours}
Timestamp : ${currentTime}

Description du problème :
[décris ici ce que tu as constaté]

---
Envoyé depuis sereinapp.fr`;
  }

  const mailto = `mailto:serein@cesarbroche.fr?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(mailto, '_blank');
}


// ── DON ──
function openDon() {
  const url = 'https://www.helloasso.com/associations/sereinapp/formulaires/1';
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
  window.open(url, isNative ? '_system' : '_blank', 'noopener,noreferrer');
}

function openPrivacyPolicy() {
  const url = 'https://sereinapp.fr/privacy.html';
  const isNative = typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
  window.open(url, isNative ? '_system' : '_blank', 'noopener,noreferrer');
}

// ── EXPORT / IMPORT DES DONNÉES (local-first, aucun serveur) ──
const DATA_KEYS = [
  'serein-stats', 'serein-history', 'serein-feedback', 'serein-guide-session',
  'serein-theme', 'serein-speed', 'serein-bells', 'serein-wifi-only',
  'serein-ambiance-default', 'serein-reminder-enabled', 'serein-reminder-time',
  'serein-voice', 'serein-resume', 'serein-mood-log'
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

// ── HAPTICS (natif uniquement, silencieux sur le web) ──
function haptic(kind) {
  try {
    const H = window.Capacitor?.Plugins?.Haptics;
    if (!H || !window.Capacitor?.isNativePlatform?.()) return;
    if (kind === 'success') H.notification({ type: 'SUCCESS' });
    else H.impact({ style: kind === 'medium' ? 'MEDIUM' : 'LIGHT' });
  } catch(e) {}
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

// ── ACCESSIBILITÉ CLAVIER ──
// Les cartes interactives (parcours, guide, minuteur…) sont des éléments
// non-button avec role="button" : Entrée et Espace doivent les activer.
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('[role="button"][tabindex], [role="article"][tabindex]');
  if (!el || el.tagName === 'BUTTON' || el.tagName === 'A' || el.tagName === 'INPUT') return;
  e.preventDefault();
  el.click();
});

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
  updateVoiceSettingLabel();
  renderResumeCard();
  updateMoodChips();
  await renderSessionList();
  restoreOfflineButtons();
  updateOfflineCount();

  // Slider de progression : navigation au clavier (±15 s, Début/Fin)
  const progressTrack = document.getElementById('progress-track');
  progressTrack.addEventListener('keydown', e => {
    if (!audio.duration) return;
    if (e.key === 'ArrowLeft')       audio.currentTime = Math.max(0, audio.currentTime - 15);
    else if (e.key === 'ArrowRight') audio.currentTime = Math.min(audio.duration, audio.currentTime + 15);
    else if (e.key === 'Home')       audio.currentTime = 0;
    else if (e.key === 'End')        audio.currentTime = Math.max(0, audio.duration - 3);
    else return;
    e.preventDefault();
  });

  // Tap sur le fond = fermer la sheet (geste standard des bottom sheets)
  const BACKDROP_CLOSERS = {
    'voice-overlay': closeVoiceOverlay,
    'timer-sheet-backdrop': closeTimerSheet,
    'ambiance-settings-backdrop': closeAmbianceSettings,
    'report-sheet-backdrop': closeReportSheet
  };
  Object.entries(BACKDROP_CLOSERS).forEach(([id, close]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', e => { if (e.target === el) close(); });
  });
  // Options du player : tap en dehors de la sheet la referme
  document.getElementById('player-main').addEventListener('click', () => {
    const sheet = document.getElementById('options-sheet');
    if (sheet.classList.contains('open')) toggleOptionsSheet();
  });

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

  // Swipe right to go back from article reader
  const articleView = document.getElementById('guide-article');
  let artSwipeX = 0, artSwipeY = 0;
  articleView.addEventListener('touchstart', e => {
    artSwipeX = e.touches[0].clientX;
    artSwipeY = e.touches[0].clientY;
  }, { passive: true });
  articleView.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - artSwipeX;
    const dy = Math.abs(e.changedTouches[0].clientY - artSwipeY);
    if (dx > 60 && dy < 50) showGuideView('comprendre');
  }, { passive: true });
});