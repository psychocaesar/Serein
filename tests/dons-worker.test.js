// Serveur de dons (workers/dons) : validation, encodage des requêtes Stripe,
// et déroulé complet des deux flux avec un faux Stripe qui enregistre chaque
// appel. C'est du code qui manipule de l'argent : on vérifie aussi ce qui ne
// doit JAMAIS arriver (fuite de la clé ou des erreurs Stripe vers l'app,
// appel à Stripe quand la limitation de débit a refusé).
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const URL_WORKER = pathToFileURL(path.join(__dirname, '..', 'workers', 'dons', 'src', 'index.js')).href;
let W;
test.before(async () => { W = await import(URL_WORKER); });

const CLE_SECRETE = 'FAUSSE-CLE-SECRETE-DE-TEST';
const ENV = { STRIPE_SECRET_KEY: CLE_SECRETE, STRIPE_PRODUCT_ID: 'prod_test123' };
const ORIGINE_IOS = 'capacitor://localhost';

const demandeValide = (extra = {}) => ({
  montant: 500, email: 'donateur@exemple.fr', cleIdempotence: 'cle-test-12345678', ...extra,
});

// ── Faux Stripe : répond selon la route et enregistre chaque appel ──
function installerFauxStripe({ clientExistant = false, erreur = null } = {}) {
  const appels = [];
  const vraiFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    appels.push({ methode: init.method, chemin: u.pathname, recherche: u.search, headers: init.headers || {}, corps: init.body || '' });
    if (erreur && u.pathname === erreur.chemin) {
      return new Response(JSON.stringify({ error: { type: 'invalid_request_error', code: 'x', message: 'DETAIL_INTERNE_STRIPE' } }), { status: 400 });
    }
    const json = corps => new Response(JSON.stringify(corps), { status: 200 });
    if (u.pathname === '/v1/customers' && init.method === 'GET') return json({ data: clientExistant ? [{ id: 'cus_existant' }] : [] });
    if (u.pathname === '/v1/customers') return json({ id: 'cus_nouveau' });
    if (u.pathname === '/v1/ephemeral_keys') return json({ secret: 'ek_test_secret' });
    if (u.pathname === '/v1/payment_intents') return json({ client_secret: 'pi_test_secret' });
    if (u.pathname === '/v1/subscriptions') return json({ latest_invoice: { confirmation_secret: { client_secret: 'pi_abo_secret' } } });
    return new Response('{}', { status: 404 });
  };
  return { appels, restaurer: () => { globalThis.fetch = vraiFetch; } };
}

function requete(chemin, corps, { origine = ORIGINE_IOS, methode = 'POST' } = {}) {
  return new Request('https://dons.exemple' + chemin, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(origine ? { Origin: origine } : {}) },
    body: methode === 'POST' ? JSON.stringify(corps) : undefined,
  });
}

// ── Validation ──
test('validation : un don standard passe', () => {
  const { erreur, donnees } = W.validerDemande(demandeValide());
  assert.strictEqual(erreur, undefined);
  assert.strictEqual(donnees.montant, 500);
  assert.strictEqual(donnees.email, 'donateur@exemple.fr');
});

test('validation : bornes du montant (3 € à 1 000 €, en centimes entiers)', () => {
  assert.ok(W.validerDemande(demandeValide({ montant: 299 })).erreur, '2,99 € refusé');
  assert.ok(!W.validerDemande(demandeValide({ montant: 300 })).erreur, '3 € accepté');
  assert.ok(!W.validerDemande(demandeValide({ montant: 100000 })).erreur, '1 000 € accepté');
  assert.ok(W.validerDemande(demandeValide({ montant: 100001 })).erreur, 'au-delà refusé');
  assert.ok(W.validerDemande(demandeValide({ montant: 500.5 })).erreur, 'centimes non entiers refusés');
  assert.ok(W.validerDemande(demandeValide({ montant: '500' })).erreur, 'montant en texte refusé');
});

test('validation : e-mail et clé d\'idempotence obligatoires', () => {
  assert.ok(W.validerDemande(demandeValide({ email: 'pas-un-email' })).erreur);
  assert.ok(W.validerDemande(demandeValide({ cleIdempotence: 'court' })).erreur);
  assert.ok(W.validerDemande(demandeValide({ cleIdempotence: 'avec espace invalide' })).erreur);
});

// ── Encodage des requêtes Stripe ──
test('encodage : clés imbriquées au format Stripe', () => {
  const corps = new URLSearchParams(W.encoderFormulaire({
    items: [{ price_data: { currency: 'eur', recurring: { interval: 'month' } } }],
    expand: ['latest_invoice.confirmation_secret'],
    automatic_payment_methods: { enabled: true },
    ignore: undefined,
  }));
  assert.strictEqual(corps.get('items[0][price_data][currency]'), 'eur');
  assert.strictEqual(corps.get('items[0][price_data][recurring][interval]'), 'month');
  assert.strictEqual(corps.get('expand[0]'), 'latest_invoice.confirmation_secret');
  assert.strictEqual(corps.get('automatic_payment_methods[enabled]'), 'true');
  assert.strictEqual(corps.has('ignore'), false, 'les valeurs absentes ne sont pas envoyées');
});

// ── Flux complets ──
test('don ponctuel : client créé, paiement idempotent, seul le secret du paiement revient', async () => {
  const faux = installerFauxStripe();
  try {
    const rep = await W.default.fetch(requete('/don/ponctuel', demandeValide()), ENV);
    assert.strictEqual(rep.status, 200);
    const corps = await rep.json();
    assert.deepStrictEqual(corps, { clientSecret: 'pi_test_secret' });

    const pi = faux.appels.find(a => a.chemin === '/v1/payment_intents');
    const params = new URLSearchParams(pi.corps);
    assert.strictEqual(params.get('amount'), '500');
    assert.strictEqual(params.get('currency'), 'eur');
    assert.strictEqual(params.get('payment_method_types[0]'), 'card', 'carte uniquement (Apple Pay et Google Pay inclus)');
    assert.strictEqual(params.has('payment_method_types[1]'), false, 'ni Link, ni MB WAY, ni autre moyen');
    assert.strictEqual(params.has('automatic_payment_methods[enabled]'), false);
    assert.strictEqual(params.get('metadata[type_don]'), 'ponctuel');
    assert.strictEqual(params.get('customer'), 'cus_nouveau');
    assert.strictEqual(pi.headers['Idempotency-Key'], 'cle-test-12345678-paiement');
    assert.strictEqual(pi.headers['Stripe-Version'], W.STRIPE_VERSION_SERVEUR);
    assert.strictEqual(pi.headers.Authorization, `Bearer ${CLE_SECRETE}`);
  } finally { faux.restaurer(); }
});

test('don mensuel : abonnement incomplet, secret lu dans confirmation_secret', async () => {
  const faux = installerFauxStripe();
  try {
    const rep = await W.default.fetch(requete('/don/mensuel', demandeValide({ montant: 1000 })), ENV);
    assert.strictEqual(rep.status, 200);
    assert.strictEqual((await rep.json()).clientSecret, 'pi_abo_secret');

    const abo = faux.appels.find(a => a.chemin === '/v1/subscriptions');
    const params = new URLSearchParams(abo.corps);
    assert.strictEqual(params.get('items[0][price_data][unit_amount]'), '1000');
    assert.strictEqual(params.get('items[0][price_data][product]'), 'prod_test123');
    assert.strictEqual(params.get('items[0][price_data][recurring][interval]'), 'month');
    assert.strictEqual(params.get('payment_behavior'), 'default_incomplete');
    assert.strictEqual(params.get('payment_settings[save_default_payment_method]'), 'on_subscription');
    assert.strictEqual(params.get('payment_settings[payment_method_types][0]'), 'card');
    assert.strictEqual(params.has('payment_settings[payment_method_types][1]'), false);
    assert.strictEqual(params.get('expand[0]'), 'latest_invoice.confirmation_secret');
  } finally { faux.restaurer(); }
});

test('collecte minimale : seul l\'e-mail atteint Stripe, même si on envoie plus', async () => {
  // Pas de reçu fiscal (association non reconnue d'intérêt général) : aucune
  // raison de transmettre un nom ou une adresse. Un client modifié ou
  // malveillant qui en envoie quand même ne doit rien faire passer.
  const faux = installerFauxStripe();
  try {
    const demande = demandeValide({ recuFiscal: true, nom: 'Camille Martin', adresse: '1 rue des Lilas', ville: 'Paris' });
    await W.default.fetch(requete('/don/ponctuel', demande), ENV);
    const tout = faux.appels.map(a => decodeURIComponent(a.corps + a.recherche)).join(' ');
    assert.ok(!tout.includes('Camille Martin'), 'le nom ne doit jamais être transmis');
    assert.ok(!tout.includes('rue des Lilas'), 'l\'adresse ne doit jamais être transmise');
    assert.ok(!tout.includes('recu_'), 'aucune trace de reçu fiscal');
    assert.ok(tout.includes('donateur@exemple.fr'), 'l\'e-mail, lui, est bien transmis');
  } finally { faux.restaurer(); }
});

test('client existant : réutilisé, jamais modifié', async () => {
  // Le point d'accès n'est pas authentifié : connaître l'e-mail de quelqu'un
  // ne doit pas permettre de toucher à sa fiche chez Stripe.
  const faux = installerFauxStripe({ clientExistant: true });
  try {
    const rep = await W.default.fetch(requete('/don/ponctuel', demandeValide()), ENV);
    assert.strictEqual(rep.status, 200);
    const pi = faux.appels.find(a => a.chemin === '/v1/payment_intents');
    assert.strictEqual(new URLSearchParams(pi.corps).get('customer'), 'cus_existant');
    const ecritures = faux.appels.filter(a => a.chemin.startsWith('/v1/customers') && a.methode === 'POST');
    assert.strictEqual(ecritures.length, 0, 'aucune écriture sur un client existant');
  } finally { faux.restaurer(); }
});

test('cartes enregistrées : jamais exposées à l\'app', async () => {
  // Sans authentification, une clé éphémère ou l'identifiant du client
  // permettraient à quiconque connaît l'e-mail d'un donateur de voir ses
  // cartes enregistrées dans la feuille de paiement, et de payer avec.
  for (const type of ['ponctuel', 'mensuel']) {
    const faux = installerFauxStripe({ clientExistant: true });
    try {
      const rep = await W.default.fetch(requete('/don/' + type, demandeValide()), ENV);
      assert.deepStrictEqual(Object.keys(await rep.json()), ['clientSecret'], type);
      assert.ok(!faux.appels.some(a => a.chemin === '/v1/ephemeral_keys'), type + ' : aucune clé éphémère');
    } finally { faux.restaurer(); }
  }
});

// ── Ce qui ne doit jamais arriver ──
test('une erreur Stripe ne fuite pas vers l\'app', async () => {
  const faux = installerFauxStripe({ erreur: { chemin: '/v1/payment_intents' } });
  const vraiConsole = console.error;
  console.error = () => {};
  try {
    const rep = await W.default.fetch(requete('/don/ponctuel', demandeValide()), ENV);
    assert.strictEqual(rep.status, 502);
    const texte = await rep.text();
    assert.ok(!texte.includes('DETAIL_INTERNE_STRIPE'), 'le détail Stripe reste dans les journaux du Worker');
    assert.ok(!texte.includes(CLE_SECRETE), 'la clé secrète ne sort jamais');
  } finally { faux.restaurer(); console.error = vraiConsole; }
});

test('limitation de débit : refus → 429 et aucun appel à Stripe', async () => {
  const faux = installerFauxStripe();
  try {
    const env = { ...ENV, LIMITEUR: { limit: async () => ({ success: false }) } };
    const rep = await W.default.fetch(requete('/don/ponctuel', demandeValide()), env);
    assert.strictEqual(rep.status, 429);
    assert.strictEqual(faux.appels.length, 0);
  } finally { faux.restaurer(); }
});

test('CORS : origine inconnue refusée, préflight accepté pour l\'app', async () => {
  const faux = installerFauxStripe();
  try {
    const refus = await W.default.fetch(requete('/don/ponctuel', demandeValide(), { origine: 'https://site-tiers.exemple' }), ENV);
    assert.strictEqual(refus.status, 403);
    assert.strictEqual(faux.appels.length, 0);

    const preflight = await W.default.fetch(requete('/don/ponctuel', null, { methode: 'OPTIONS' }), ENV);
    assert.strictEqual(preflight.status, 204);
    assert.strictEqual(preflight.headers.get('Access-Control-Allow-Origin'), ORIGINE_IOS);
  } finally { faux.restaurer(); }
});

test('configuration incomplète : clé absente ou produit mensuel absent', async () => {
  const faux = installerFauxStripe();
  const vraiConsole = console.error;
  console.error = () => {};
  try {
    const sansCle = await W.default.fetch(requete('/don/ponctuel', demandeValide()), { STRIPE_PRODUCT_ID: 'prod_x' });
    assert.strictEqual(sansCle.status, 500);

    const sansProduit = await W.default.fetch(requete('/don/mensuel', demandeValide()), { STRIPE_SECRET_KEY: CLE_SECRETE });
    assert.strictEqual(sansProduit.status, 502);
  } finally { faux.restaurer(); console.error = vraiConsole; }
});
