const express = require('express');
const router = express.Router();
const db = require('../db/schema');
const QUESTIONNAIRES = require('../questionnaires');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getItemOptions(q, index) {
  return (q.itemOptions && q.itemOptions[index]) || q.options;
}

function validateAnswers(q, answers) {
  if (answers.length !== q.items.length) {
    return `Nombre de réponses incorrect (attendu ${q.items.length}, reçu ${answers.length})`;
  }
  for (let i = 0; i < answers.length; i++) {
    let opts;
    if (q.optionLayout === 'paires') {
      opts = (i % 2 === 0) ? q.optionsAnxiete : q.optionsEvitement;
    } else {
      opts = getItemOptions(q, i);
    }
    const valid = opts.map(o => o.valeur);
    if (!valid.includes(answers[i])) {
      return `Valeur invalide pour la question ${i + 1} (valeur ${answers[i]} non autorisée)`;
    }
  }
  return null;
}

function calcScore(q, answers) {
  if (q.scoreCalc) return q.scoreCalc(answers);
  return answers.reduce((sum, a) => sum + a, 0);
}

function buildSeverityStr(q, score, answers) {
  const sev = q.severite(score);
  if (!q.sousScores) return sev.label;
  const ss = q.sousScores(answers);
  return JSON.stringify({ label: sev.label, ...ss });
}

function parseQuestionnaires(row) {
  if (row.questionnaires) {
    try { return JSON.parse(row.questionnaires); } catch (_) {}
  }
  return [row.questionnaire];
}

function buildQPayload(q, indexActuel, total) {
  const payload = {
    questionnaire: q.id,
    titre: q.titre,
    description: q.description,
    consigne: q.consigne || null,
    intro: q.intro || null,
    outro: q.outro || null,
    optionLayout: q.optionLayout || 'grid',
    indexActuel,
    total,
  };

  if (q.optionLayout === 'paires') {
    payload.situations = q.situations;
    payload.optionsAnxiete = q.optionsAnxiete;
    payload.optionsEvitement = q.optionsEvitement;
    payload.items = q.items;
  } else {
    payload.items = q.items;
    payload.options = q.options;
    payload.itemOptions = q.itemOptions
      ? q.itemOptions.map(io => io || q.options)
      : null;
  }

  return payload;
}

// ── Middleware auth ───────────────────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.PSYGEST_API_KEY) {
    return res.status(401).json({ erreur: 'Non autorisé' });
  }
  next();
}

// ── Routes publiques ──────────────────────────────────────────────────────────

router.post('/valider-code', (req, res) => {
  const { code } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ erreur: 'Code invalide' });
  }

  const row = db.prepare(
    'SELECT * FROM codes WHERE code = ? AND expires_at > unixepoch()'
  ).get(code.trim().toUpperCase());

  if (!row) {
    return res.status(404).json({ erreur: 'Code inconnu ou expiré' });
  }

  const questionnaires = parseQuestionnaires(row);

  // Trouver le premier questionnaire non encore soumis
  const completed = db.prepare('SELECT questionnaire FROM responses WHERE code = ?')
    .all(row.code).map(r => r.questionnaire);
  const remaining = questionnaires.filter(q => !completed.includes(q));

  if (!remaining.length) {
    return res.status(404).json({ erreur: 'Tous les questionnaires de ce code ont déjà été complétés.' });
  }

  const currentSlug = remaining[0];
  const q = QUESTIONNAIRES[currentSlug];
  if (!q) return res.status(500).json({ erreur: 'Questionnaire introuvable' });

  const indexActuel = questionnaires.indexOf(currentSlug);
  const consentRow = db.prepare('SELECT 1 FROM consentements WHERE code = ?').get(row.code);

  res.json({
    ...buildQPayload(q, indexActuel, questionnaires.length),
    consentementDonne: !!consentRow,
  });
});

router.post('/consentement', (req, res) => {
  const { code, timestamp } = req.body;
  if (!code) return res.status(400).json({ erreur: 'Code manquant' });

  const row = db.prepare(
    'SELECT * FROM codes WHERE code = ? AND expires_at > unixepoch()'
  ).get(code.trim().toUpperCase());

  if (!row) return res.status(404).json({ erreur: 'Code inconnu ou expiré' });

  db.prepare(
    'INSERT OR IGNORE INTO consentements (code, date_consentement) VALUES (?, ?)'
  ).run(row.code, timestamp || new Date().toISOString());

  res.json({ ok: true });
});

router.post('/soumettre', (req, res) => {
  const { code, answers } = req.body;
  if (!code || !Array.isArray(answers)) {
    return res.status(400).json({ erreur: 'Données manquantes' });
  }

  const row = db.prepare(
    'SELECT * FROM codes WHERE code = ? AND expires_at > unixepoch()'
  ).get(code.trim().toUpperCase());

  if (!row) {
    return res.status(404).json({ erreur: 'Code inconnu ou expiré' });
  }

  const questionnaires = parseQuestionnaires(row);

  // Questionnaire en cours = premier non encore soumis
  const completed = db.prepare('SELECT questionnaire FROM responses WHERE code = ?')
    .all(row.code).map(r => r.questionnaire);
  const remaining = questionnaires.filter(q => !completed.includes(q));

  if (!remaining.length) {
    return res.status(400).json({ erreur: 'Tous les questionnaires ont déjà été complétés.' });
  }

  const currentSlug = remaining[0];
  const q = QUESTIONNAIRES[currentSlug];
  if (!q) return res.status(500).json({ erreur: 'Questionnaire introuvable' });

  if (row.used && questionnaires.length === 1) {
    return res.status(404).json({ erreur: 'Code déjà utilisé' });
  }

  const erreur = validateAnswers(q, answers);
  if (erreur) return res.status(400).json({ erreur });

  const score = calcScore(q, answers);
  const severityStr = buildSeverityStr(q, score, answers);
  const consentRow = db.prepare('SELECT 1 FROM consentements WHERE code = ?').get(row.code);
  const consentementRecueilli = consentRow ? 1 : 0;

  // Insérer la réponse pour ce questionnaire
  db.prepare(
    'INSERT INTO responses (code, questionnaire, answers, score, severity, consentement_recueilli) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(row.code, currentSlug, JSON.stringify(answers), score, severityStr, consentementRecueilli);

  // Alerte sécurité
  let alerteSecurite = null;
  if (q.alerteSecurite) {
    const { itemIndex, seuil, message } = q.alerteSecurite;
    if (answers[itemIndex] >= seuil) alerteSecurite = message;
  }

  // Vérifier s'il reste des questionnaires
  const newCompleted = [...completed, currentSlug];
  const newRemaining = questionnaires.filter(q => !newCompleted.includes(q));

  if (newRemaining.length === 0) {
    // Tout complété — marquer le code comme utilisé
    db.prepare('UPDATE codes SET used = 1, used_at = unixepoch() WHERE code = ?').run(row.code);

    const sev = q.severite(score);
    return res.json({
      ok: true,
      termine: true,
      score,
      severite: sev.label,
      outro: q.outro || null,
      alerteSecurite,
    });
  }

  // Il reste des questionnaires — renvoyer le suivant
  const nextSlug = newRemaining[0];
  const nextQ = QUESTIONNAIRES[nextSlug];
  if (!nextQ) return res.status(500).json({ erreur: 'Questionnaire suivant introuvable' });

  const nextIndex = questionnaires.indexOf(nextSlug);
  return res.json({
    ok: true,
    termine: false,
    alerteSecurite,
    suivant: buildQPayload(nextQ, nextIndex, questionnaires.length),
  });
});

// ── Routes internes (PsyGest desktop) ────────────────────────────────────────

router.get('/resultats', authMiddleware, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM responses WHERE exported = 0 ORDER BY submitted_at ASC'
  ).all();
  res.json(rows);
});

router.post('/resultats/exporter', authMiddleware, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ erreur: 'ids requis' });
  }
  const placeholders = ids.map(() => '?').join(',');
  db.prepare(`UPDATE responses SET exported = 1 WHERE id IN (${placeholders})`).run(...ids);
  res.json({ ok: true });
});

router.post('/codes', authMiddleware, (req, res) => {
  const { questionnaire, questionnaires: questionnairesBody, ttl_heures = 72 } = req.body;

  // Accepter un tableau ou un slug unique
  const slugs = questionnairesBody
    ? (Array.isArray(questionnairesBody) ? questionnairesBody : [questionnairesBody])
    : (questionnaire ? [questionnaire] : []);

  if (!slugs.length) {
    return res.status(400).json({ erreur: 'Questionnaire(s) requis' });
  }
  for (const s of slugs) {
    if (!QUESTIONNAIRES[s]) return res.status(400).json({ erreur: `Questionnaire inconnu : ${s}` });
  }

  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  const { randomBytes } = require('crypto');
  const bytes = randomBytes(8);
  for (const b of bytes) code += charset[b % charset.length];

  const expires_at = Math.floor(Date.now() / 1000) + ttl_heures * 3600;

  db.prepare(
    'INSERT INTO codes (code, questionnaire, questionnaires, expires_at) VALUES (?, ?, ?, ?)'
  ).run(code, slugs[0], JSON.stringify(slugs), expires_at);

  res.json({ code, questionnaires: slugs, questionnaire: slugs[0], expires_at });
});

router.get('/questionnaires', authMiddleware, (req, res) => {
  const liste = Object.values(QUESTIONNAIRES).map(q => ({
    id: q.id,
    titre: q.titre,
    description: q.description,
    nbItems: q.optionLayout === 'paires' ? q.situations.length : q.items.length,
  }));
  res.json(liste);
});

module.exports = router;
