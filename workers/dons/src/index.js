// Serveur de dons de Serein (Cloudflare Worker).
//
// Seul rôle : préparer un paiement Stripe pour l'app, qui l'affiche ensuite
// dans la feuille de paiement native (Apple Pay / Google Pay / carte). La clé
// secrète Stripe ne peut pas vivre dans l'app — elle est déposée ici via
// `npx wrangler secret put STRIPE_SECRET_KEY`, jamais dans ce dépôt (public).
//
// Aucun webhook : Stripe confirme le paiement côté app et envoie lui-même la
// confirmation par e-mail au donateur.

const STRIPE_API = 'https://api.stripe.com/v1';

// Version épinglée pour les appels serveur : `confirmation_secret` (qui porte
// le secret du premier paiement d'un abonnement) n'existe qu'à partir de la
// version « basil ». L'épingler rend le comportement indépendant de la
// version par défaut du compte Stripe.
export const STRIPE_VERSION_SERVEUR = '2025-06-30.basil';

// Version attendue par les SDK mobiles Stripe embarqués par
// @capacitor-community/stripe (stripe-ios 26.x) : une clé éphémère créée avec
// une autre version est rejetée par la feuille de paiement.
export const STRIPE_VERSION_SDK_MOBILE = '2020-08-27';

// En centimes. Le minimum limite le poids des frais fixes Stripe (0,25 €) et
// décourage le « card testing » (tests de cartes volées par petits montants).
export const MONTANT_MIN = 300;
export const MONTANT_MAX = 100000;

const MESSAGE_GENERIQUE = 'Le don n’a pas pu être préparé. Réessaie dans un instant.';
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_CLE = /^[A-Za-z0-9_-]{8,100}$/;

// Validation côté serveur : l'app valide aussi, mais seul ce contrôle compte
// — n'importe qui peut appeler ce point d'accès directement.
// Seul l'e-mail est accepté comme donnée personnelle : pas de reçu fiscal,
// l'association n'étant pas reconnue d'intérêt général (en émettre serait
// illégal). Tout autre champ envoyé est ignoré et n'atteint jamais Stripe.
export function validerDemande(body) {
  if (!body || typeof body !== 'object') return { erreur: 'Requête invalide.' };

  const montant = body.montant;
  if (!Number.isInteger(montant) || montant < MONTANT_MIN || montant > MONTANT_MAX) {
    return { erreur: 'Montant invalide.' };
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (email.length > 254 || !RE_EMAIL.test(email)) return { erreur: 'Adresse e-mail invalide.' };

  if (typeof body.cleIdempotence !== 'string' || !RE_CLE.test(body.cleIdempotence)) {
    return { erreur: 'Requête invalide.' };
  }

  return { donnees: { montant, email, cleIdempotence: body.cleIdempotence } };
}

// Encode un objet en corps de formulaire au format attendu par Stripe
// (clés imbriquées entre crochets : items[0][price_data][currency]=eur).
export function encoderFormulaire(objet) {
  const params = new URLSearchParams();
  const ajouter = (cle, valeur) => {
    if (valeur === undefined || valeur === null) return;
    if (Array.isArray(valeur)) { valeur.forEach((v, i) => ajouter(`${cle}[${i}]`, v)); return; }
    if (typeof valeur === 'object') {
      for (const [k, v] of Object.entries(valeur)) ajouter(`${cle}[${k}]`, v);
      return;
    }
    params.append(cle, String(valeur));
  };
  for (const [cle, valeur] of Object.entries(objet)) ajouter(cle, valeur);
  return params.toString();
}

async function appelStripe(env, methode, chemin, params, { idempotence, version } = {}) {
  const headers = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Stripe-Version': version || STRIPE_VERSION_SERVEUR,
  };
  let url = STRIPE_API + chemin;
  const init = { method: methode, headers };
  if (params) {
    const corps = encoderFormulaire(params);
    if (methode === 'GET') {
      url += '?' + corps;
    } else {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      init.body = corps;
    }
  }
  // Idempotence : si l'app renvoie la même demande (réseau instable, double
  // tap), Stripe rejoue la réponse d'origine au lieu de créer un 2e paiement.
  if (idempotence) headers['Idempotency-Key'] = idempotence;

  const reponse = await fetch(url, init);
  const donnees = await reponse.json().catch(() => ({}));
  if (!reponse.ok) {
    const e = new Error(`Stripe ${methode} ${chemin} → ${reponse.status}`);
    e.stripe = donnees.error ? { type: donnees.error.type, code: donnees.error.code } : null;
    throw e;
  }
  return donnees;
}

// Réutilise le client Stripe de cette adresse s'il existe : le portail de
// gestion des dons mensuels retrouve le donateur par son e-mail. Un client
// existant n'est jamais modifié : ce point d'accès n'est pas authentifié.
async function clientPour(env, d) {
  const liste = await appelStripe(env, 'GET', '/customers', { email: d.email, limit: 1 });
  if (liste.data && liste.data.length > 0) return liste.data[0].id;

  const client = await appelStripe(env, 'POST', '/customers', {
    email: d.email,
    metadata: { source: 'app_serein' },
  }, { idempotence: `${d.cleIdempotence}-client` });
  return client.id;
}

function metadataDon(type) {
  return { type_don: type, source: 'app_serein' };
}

async function cleEphemere(env, clientId, d) {
  const cle = await appelStripe(env, 'POST', '/ephemeral_keys', { customer: clientId }, {
    version: STRIPE_VERSION_SDK_MOBILE,
    idempotence: `${d.cleIdempotence}-cle`,
  });
  return cle.secret;
}

export async function preparerPonctuel(env, d) {
  const clientId = await clientPour(env, d);
  const cle = await cleEphemere(env, clientId, d);
  const paiement = await appelStripe(env, 'POST', '/payment_intents', {
    amount: d.montant,
    currency: 'eur',
    customer: clientId,
    receipt_email: d.email,
    description: 'Don ponctuel à Sereinapp Méditation',
    automatic_payment_methods: { enabled: true },
    metadata: metadataDon('ponctuel'),
  }, { idempotence: `${d.cleIdempotence}-paiement` });
  return { clientSecret: paiement.client_secret, clientId, cleEphemere: cle };
}

// Un abonnement à montant libre : le prix est créé à la volée (price_data)
// sur le produit « Don mensuel ». S'il n'est jamais payé (feuille de paiement
// fermée), Stripe le fait expirer seul au bout de 23 h — rien à nettoyer.
export async function preparerMensuel(env, d) {
  if (!env.STRIPE_PRODUCT_ID) throw new Error('STRIPE_PRODUCT_ID manquant');
  const clientId = await clientPour(env, d);
  const cle = await cleEphemere(env, clientId, d);
  const abonnement = await appelStripe(env, 'POST', '/subscriptions', {
    customer: clientId,
    items: [{
      price_data: {
        currency: 'eur',
        product: env.STRIPE_PRODUCT_ID,
        unit_amount: d.montant,
        recurring: { interval: 'month' },
      },
    }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    description: 'Don mensuel à Sereinapp Méditation',
    metadata: metadataDon('mensuel'),
    expand: ['latest_invoice.confirmation_secret'],
  }, { idempotence: `${d.cleIdempotence}-abonnement` });

  const secret = abonnement.latest_invoice
    && abonnement.latest_invoice.confirmation_secret
    && abonnement.latest_invoice.confirmation_secret.client_secret;
  if (!secret) throw new Error('confirmation_secret absent de la réponse Stripe');
  return { clientSecret: secret, clientId, cleEphemere: cle };
}

function reponseJson(corps, statut, cors) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...(cors || {}) },
  });
}

export default {
  async fetch(requete, env) {
    const origine = requete.headers.get('Origin') || '';
    const autorisees = (env.ORIGINES_AUTORISEES || 'capacitor://localhost,https://localhost')
      .split(',').map(s => s.trim()).filter(Boolean);
    const cors = autorisees.includes(origine) ? { 'Access-Control-Allow-Origin': origine, Vary: 'Origin' } : null;

    if (requete.method === 'OPTIONS') {
      if (!cors) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          ...cors,
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const type = { '/don/ponctuel': 'ponctuel', '/don/mensuel': 'mensuel' }[new URL(requete.url).pathname];
    if (requete.method !== 'POST' || !type) return reponseJson({ erreur: 'Introuvable.' }, 404, cors);
    // Pas une frontière de sécurité (un script peut forger l'en-tête Origin),
    // mais empêche un site tiers d'utiliser ce point d'accès depuis un navigateur.
    if (!cors) return reponseJson({ erreur: 'Origine non autorisée.' }, 403, null);

    // La vraie protection contre le « card testing » : limiter les tentatives
    // par IP (liaison optionnelle, déclarée dans wrangler.toml).
    if (env.LIMITEUR) {
      const ip = requete.headers.get('CF-Connecting-IP') || 'inconnue';
      const { success } = await env.LIMITEUR.limit({ key: ip });
      if (!success) return reponseJson({ erreur: 'Trop de tentatives. Réessaie dans une minute.' }, 429, cors);
    }

    if (!env.STRIPE_SECRET_KEY) {
      console.error('[dons] STRIPE_SECRET_KEY absente — déposer avec `npx wrangler secret put STRIPE_SECRET_KEY`');
      return reponseJson({ erreur: MESSAGE_GENERIQUE }, 500, cors);
    }

    let body;
    try { body = await requete.json(); } catch { return reponseJson({ erreur: 'Requête invalide.' }, 400, cors); }
    const { erreur, donnees } = validerDemande(body);
    if (erreur) return reponseJson({ erreur }, 400, cors);

    try {
      const resultat = type === 'ponctuel' ? await preparerPonctuel(env, donnees) : await preparerMensuel(env, donnees);
      return reponseJson(resultat, 200, cors);
    } catch (e) {
      // Le détail part dans les journaux du Worker (`npx wrangler tail`),
      // jamais vers l'app : il pourrait révéler la configuration du compte.
      console.error('[dons]', e.message, JSON.stringify(e.stripe || {}));
      return reponseJson({ erreur: MESSAGE_GENERIQUE }, 502, cors);
    }
  },
};
