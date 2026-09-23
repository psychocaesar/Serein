// Écran de don, côté app : lecture des montants saisis, formatage, et surtout
// les conditions d'affichage. Le don ne doit JAMAIS apparaître sur iOS sans
// Apple Pay configuré — la guideline 3.2.1(vi) l'exige, et un bouton de don
// sans Apple Pay risquerait un rejet de l'app entière à la revue Apple.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createSandbox } = require('./harness');

const PWA_DIR = path.join(__dirname, '..', 'app', 'pwa');

const { sandbox } = createSandbox();

const SHIM = `
;globalThis.__dons = {
  parseMontantSaisi: parseMontantSaisi,
  formatEuros: formatEuros,
  donsDisponibles: donsDisponibles,
  DONS_CONFIG: DONS_CONFIG,
  DON_PALIERS: DON_PALIERS,
  DON_MONTANT_MIN: DON_MONTANT_MIN,
  initialiserDons: initialiserDons,
  demarrerStripe: demarrerStripe,
};`;

const src = fs.readFileSync(path.join(PWA_DIR, 'app.js'), 'utf8');
vm.createContext(sandbox);
vm.runInContext(src + '\n' + SHIM, sandbox, { filename: 'app.js' });

const D = sandbox.__dons;

test('montant saisi : virgule, point, symbole € et espaces acceptés', () => {
  assert.strictEqual(D.parseMontantSaisi('4,50'), 450);
  assert.strictEqual(D.parseMontantSaisi('4.50'), 450);
  assert.strictEqual(D.parseMontantSaisi('12'), 1200);
  assert.strictEqual(D.parseMontantSaisi(' 12 € '), 1200);
  assert.strictEqual(D.parseMontantSaisi('4,35'), 435, 'pas d\'erreur d\'arrondi flottant');
});

test('montant saisi : entrées illisibles rejetées', () => {
  assert.strictEqual(D.parseMontantSaisi('abc'), null);
  assert.strictEqual(D.parseMontantSaisi('4,555'), null, 'pas plus de deux décimales');
  assert.strictEqual(D.parseMontantSaisi('-5'), null);
  assert.strictEqual(D.parseMontantSaisi(''), null);
});

test('formatage en euros à la française', () => {
  // Intl insère une espace insécable avant le symbole : on la normalise.
  const norm = s => s.replace(/[  ]/g, ' ');
  assert.strictEqual(norm(D.formatEuros(500)), '5 €');
  assert.strictEqual(norm(D.formatEuros(450)), '4,50 €');
});

test('paliers : aucun sous le minimum de 3 €', () => {
  for (const type of ['mensuel', 'ponctuel']) {
    for (const centimes of D.DON_PALIERS[type]) {
      assert.ok(centimes >= D.DON_MONTANT_MIN, `${type} : palier ${centimes} sous le minimum`);
    }
  }
});

// ── Conditions d'affichage ──
function configurer({ plateforme, plugin = true, config = {} }) {
  Object.assign(D.DONS_CONFIG, { apiUrl: '', stripePublishableKey: '', applePayMerchantId: '' }, config);
  sandbox.Capacitor = {
    getPlatform: () => plateforme,
    isNativePlatform: () => plateforme !== 'web',
    Plugins: plugin ? { Stripe: {} } : {},
  };
}
const COMPLET = { apiUrl: 'https://dons.exemple', stripePublishableKey: 'pk_test_x' };

test('don masqué tant que le serveur et la clé publiable ne sont pas renseignés', () => {
  configurer({ plateforme: 'android' });
  assert.strictEqual(D.donsDisponibles(), false);
});

test('iOS : don masqué sans Merchant ID Apple Pay, même tout le reste configuré', () => {
  configurer({ plateforme: 'ios', config: COMPLET });
  assert.strictEqual(D.donsDisponibles(), false, 'guideline 3.2.1(vi) : Apple Pay obligatoire');

  configurer({ plateforme: 'ios', config: { ...COMPLET, applePayMerchantId: 'merchant.fr.sereinapp.app' } });
  assert.strictEqual(D.donsDisponibles(), true);
});

test('Android : don disponible dès que serveur et clé sont configurés', () => {
  configurer({ plateforme: 'android', config: COMPLET });
  assert.strictEqual(D.donsDisponibles(), true);
});

test('sans le plugin Stripe (web, build ancien) : don masqué', () => {
  configurer({ plateforme: 'android', plugin: false, config: COMPLET });
  assert.strictEqual(D.donsDisponibles(), false);
});

test('Stripe n\'est pas démarré au lancement, seulement au moment d\'un don', async () => {
  // Son SDK contacte les serveurs de Stripe dès l'initialisation : pour qui
  // médite sans jamais donner, rien ne doit quitter l'appareil.
  configurer({ plateforme: 'android', config: COMPLET });
  const appels = { initialize: 0, ecouteurs: [] };
  sandbox.Capacitor.Plugins.Stripe = {
    initialize: async () => { appels.initialize++; },
    addListener: evt => { appels.ecouteurs.push(evt); },
  };
  await D.initialiserDons();
  assert.strictEqual(appels.initialize, 0, 'aucune initialisation au lancement');
  assert.deepStrictEqual(Array.from(appels.ecouteurs).sort(),
    ['paymentSheetCanceled', 'paymentSheetCompleted', 'paymentSheetFailed'],
    'les écouteurs restent posés au lancement (Android peut recréer l\'Activity)');

  await D.demarrerStripe(sandbox.Capacitor.Plugins.Stripe);
  await D.demarrerStripe(sandbox.Capacitor.Plugins.Stripe);
  assert.strictEqual(appels.initialize, 1, 'une seule initialisation, au premier don');
});
