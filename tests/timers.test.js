// Teste la logique différée du minuteur libre — impossible à couvrir avant
// l'horloge contrôlable de harness.js, parce que les sandbox stubaient
// setTimeout/setInterval en no-op : tout ce qui devait se produire « plus
// tard » ne se produisait jamais en test.
//
// Les deux bugs gardés ici sont réels, trouvés à l'audit de septembre 2026 :
//  - un setInterval orphelin créé 1,5 s APRÈS la fermeture du player ;
//  - timerTotalSeconds jamais remis à zéro, qui faisait relancer un minuteur
//    au lieu de rejouer la séance guidée.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSandbox } = require('./harness');

const PWA_DIR = path.join(__dirname, '..', 'app', 'pwa');

// Le minuteur touche beaucoup d'éléments du DOM : le stub universel absorbe
// tout, seul le comportement temporel nous intéresse ici.
const { sandbox, clock } = createSandbox();

const SHIM = `
;globalThis.__timers = {
  startTimer: startTimer,
  closePlayer: closePlayer,
  launchPlayer: launchPlayer,
  state: function () {
    return {
      running: timerRunning,
      hasInterval: timerInterval !== null,
      hasPendingStart: timerStartTimeout !== null,
      totalSeconds: timerTotalSeconds,
      secondsLeft: timerSecondsLeft,
    };
  },
};`;

const src = fs.readFileSync(path.join(PWA_DIR, 'app.js'), 'utf8');
vm.createContext(sandbox);
vm.runInContext(src + '\n' + SHIM, sandbox, { filename: 'app.js' });

const T = sandbox.__timers;

test('le décompte démarre bien après le délai de lancement', () => {
  T.startTimer(5);
  assert.strictEqual(T.state().running, false, 'le décompte ne doit pas partir immédiatement');
  assert.strictEqual(T.state().hasPendingStart, true, 'un démarrage différé doit être armé');

  clock.tick(1500);
  const s = T.state();
  assert.strictEqual(s.running, true, 'le décompte doit tourner après le délai');
  assert.strictEqual(s.hasInterval, true, 'un intervalle de décompte doit être armé');

  T.closePlayer();
});

test('le décompte avance réellement avec le temps', () => {
  T.startTimer(5);
  clock.tick(1500);
  assert.strictEqual(T.state().secondsLeft, 300, '5 min = 300 s au démarrage');

  clock.tick(10000); // 10 s
  assert.strictEqual(T.state().secondsLeft, 290, 'après 10 s il doit rester 290 s');

  T.closePlayer();
});

test('fermer le player avant la fin du délai ne laisse pas de minuteur fantôme', () => {
  T.startTimer(5);
  assert.strictEqual(T.state().hasPendingStart, true);

  // Fermeture pendant les 1,5 s : le démarrage différé doit être annulé.
  T.closePlayer();
  assert.strictEqual(T.state().hasPendingStart, false, 'le démarrage différé doit être annulé à la fermeture');

  // Bien au-delà du délai : rien ne doit s'être créé après coup.
  clock.tick(5000);
  const s = T.state();
  assert.strictEqual(s.running, false, 'aucun décompte ne doit tourner après fermeture');
  assert.strictEqual(s.hasInterval, false, 'aucun intervalle orphelin ne doit avoir été créé');
});

test('lancer une séance guidée sort du mode minuteur (« Rejouer » ne relance pas le chrono)', () => {
  T.startTimer(10);
  clock.tick(1500);
  assert.strictEqual(T.state().totalSeconds, 600, 'le minuteur doit être actif');
  T.closePlayer();

  // replaySession() teste `timerTotalSeconds > 0` pour décider s'il relance un
  // minuteur ou rejoue la séance : lancer une séance guidée doit remettre ce
  // marqueur à zéro, sinon « Rejouer » relance un minuteur silencieux.
  T.launchPlayer('s1', 'Séance de test', 'Premiers pas', '5 min', 'x.mp3', 'masculine', null);
  assert.strictEqual(T.state().totalSeconds, 0, 'une séance guidée doit sortir du mode minuteur');

  T.closePlayer();
});
