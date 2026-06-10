// Registre central des questionnaires cliniques.
//
// Champs communs : id, titre, description, items[], options[], severite()
// Champs optionnels :
//   consigne         — consigne spécifique (remplace l'instruction générique)
//   intro / outro    — messages pour questionnaires traumatiques
//   itemOptions[]    — options par item si hétérogènes (null = options globales)
//   scoreCalc()      — scoring custom (par défaut : somme)
//   sousScores()     — sous-échelles stockées en JSON dans severity
//   alerteSecurite   — { itemIndex, seuil, message } pour alerte sécurité
//   optionLayout     — 'grid' (défaut) | 'list' | 'paires' (LSAS)
//   situations[]     — labels des 24 situations (LSAS uniquement)
//   optionsAnxiete[] / optionsEvitement[] — (LSAS uniquement)

const QUESTIONNAIRES = {

  // ── PHQ-9 ──────────────────────────────────────────────────────────────────
  PHQ9: {
    id: 'PHQ9',
    titre: 'Questionnaire PHQ-9',
    description: 'Évaluation des symptômes dépressifs sur les 2 dernières semaines',
    items: [
      "Peu d'intérêt ou de plaisir à faire les choses",
      'Se sentir triste, déprimé(e) ou sans espoir',
      "Difficultés à s'endormir, rester endormi(e), ou dormir trop",
      "Se sentir fatigué(e) ou manquer d'énergie",
      "Peu d'appétit ou manger trop",
      "Se sentir dans un mauvais état — ou avoir l'impression d'être un(e) raté(e) ou d'avoir déçu sa famille ou soi-même",
      "Avoir du mal à se concentrer, par exemple pour lire le journal ou regarder la télévision",
      "Bouger ou parler si lentement que les autres auraient pu le remarquer. Ou au contraire, être si agité(e) que vous vous agitez beaucoup plus que d'habitude",
      "Penser qu'il vaudrait mieux mourir ou vous faire du mal d'une façon ou d'une autre",
    ],
    options: [
      { valeur: 0, label: 'Jamais' },
      { valeur: 1, label: 'Plusieurs jours' },
      { valeur: 2, label: 'Plus de la moitié du temps' },
      { valeur: 3, label: 'Presque tous les jours' },
    ],
    severite: (score) => {
      if (score <= 4)  return { label: 'Symptômes minimes', classe: 'minimal' };
      if (score <= 9)  return { label: 'Symptômes légers', classe: 'leger' };
      if (score <= 14) return { label: 'Symptômes modérés', classe: 'modere' };
      if (score <= 19) return { label: 'Symptômes modérément sévères', classe: 'modere-severe' };
      return { label: 'Symptômes sévères', classe: 'severe' };
    },
  },

  // ── GAD-7 ──────────────────────────────────────────────────────────────────
  GAD7: {
    id: 'GAD7',
    titre: 'Questionnaire GAD-7',
    description: 'Évaluation des symptômes anxieux sur les 2 dernières semaines',
    items: [
      'Se sentir nerveux(se), anxieux(se) ou à bout',
      "Ne pas être capable d'arrêter de s'inquiéter ou de contrôler ses inquiétudes",
      "S'inquiéter trop à propos de différentes choses",
      'Avoir du mal à se détendre',
      "Être tellement agité(e) qu'il est difficile de rester en place",
      'Devenir facilement contrarié(e) ou irritable',
      "Avoir peur que quelque chose d'horrible puisse arriver",
    ],
    options: [
      { valeur: 0, label: 'Jamais' },
      { valeur: 1, label: 'Plusieurs jours' },
      { valeur: 2, label: 'Plus de la moitié du temps' },
      { valeur: 3, label: 'Presque tous les jours' },
    ],
    severite: (score) => {
      if (score <= 4)  return { label: 'Anxiété minimale', classe: 'minimal' };
      if (score <= 9)  return { label: 'Anxiété légère', classe: 'leger' };
      if (score <= 14) return { label: 'Anxiété modérée', classe: 'modere' };
      return { label: 'Anxiété sévère', classe: 'severe' };
    },
  },

  // ── ISI ────────────────────────────────────────────────────────────────────
  ISI: {
    id: 'ISI',
    titre: 'Insomnia Severity Index (ISI)',
    description: 'Évaluation de la sévérité des troubles du sommeil',
    items: [
      "Difficulté à vous endormir",
      "Difficulté à rester endormi(e)",
      "Problèmes de réveil trop tôt",
      "Satisfaction de votre sommeil actuel",
      "Dans quelle mesure votre problème de sommeil est-il visible pour les autres (famille, amis, collègues) ?",
      "Dans quelle mesure êtes-vous préoccupé(e) par votre problème de sommeil actuel ?",
      "Dans quelle mesure votre problème de sommeil interfère-t-il avec votre fonctionnement quotidien (fatigue, humeur, concentration, mémoire) ?",
    ],
    options: [
      { valeur: 0, label: 'Aucune' },
      { valeur: 1, label: 'Légère' },
      { valeur: 2, label: 'Modérée' },
      { valeur: 3, label: 'Sévère' },
      { valeur: 4, label: 'Très sévère' },
    ],
    itemOptions: [
      null, // Q1
      null, // Q2
      null, // Q3
      [
        { valeur: 0, label: 'Très satisfait(e)' },
        { valeur: 1, label: 'Satisfait(e)' },
        { valeur: 2, label: 'Modérément satisfait(e)' },
        { valeur: 3, label: 'Insatisfait(e)' },
        { valeur: 4, label: 'Très insatisfait(e)' },
      ],
      // Q5, Q6, Q7 : même échelle "Pas du tout → Énormément"
      [
        { valeur: 0, label: 'Pas du tout' },
        { valeur: 1, label: 'Un peu' },
        { valeur: 2, label: 'Assez' },
        { valeur: 3, label: 'Beaucoup' },
        { valeur: 4, label: 'Énormément' },
      ],
      [
        { valeur: 0, label: 'Pas du tout' },
        { valeur: 1, label: 'Un peu' },
        { valeur: 2, label: 'Assez' },
        { valeur: 3, label: 'Beaucoup' },
        { valeur: 4, label: 'Énormément' },
      ],
      [
        { valeur: 0, label: 'Pas du tout' },
        { valeur: 1, label: 'Un peu' },
        { valeur: 2, label: 'Assez' },
        { valeur: 3, label: 'Beaucoup' },
        { valeur: 4, label: 'Énormément' },
      ],
    ],
    optionLayout: 'list',
    severite: (score) => {
      if (score <= 7)  return { label: "Pas d'insomnie cliniquement significative", classe: 'minimal' };
      if (score <= 14) return { label: 'Insomnie sous-clinique', classe: 'leger' };
      if (score <= 21) return { label: 'Insomnie clinique modérée', classe: 'modere' };
      return { label: 'Insomnie clinique sévère', classe: 'severe' };
    },
  },

  // ── PCL-5 ──────────────────────────────────────────────────────────────────
  PCL5: {
    id: 'PCL5',
    titre: 'PCL-5 — Liste de contrôle du TSPT (DSM-5)',
    description: 'Évaluation des symptômes de stress post-traumatique sur le dernier mois',
    consigne: "Les questions suivantes concernent des problèmes que vous avez pu avoir suite à un événement stressant. Pour chaque problème, indiquez à quel point vous en avez été perturbé(e) au cours du dernier mois.",
    intro: 'Ces questions peuvent évoquer des souvenirs difficiles. Prenez votre temps.',
    outro: 'Merci. Votre thérapeute prendra connaissance de vos réponses lors de votre prochaine séance.',
    items: [
      "Souvenirs répétés, involontaires et envahissants de l'événement stressant",
      "Rêves répétés et perturbants liés à l'événement",
      "Vous sentir ou agir comme si l'événement stressant se reproduisait (revivre l'événement)",
      "Se sentir très bouleversé(e) quand quelque chose vous rappelle l'événement stressant",
      "Réactions physiques intenses quand quelque chose vous rappelle l'événement (cœur qui bat fort, difficultés à respirer, transpiration)",
      "Éviter les souvenirs, pensées ou sentiments liés à l'événement stressant",
      "Éviter les rappels extérieurs de l'événement (personnes, lieux, conversations, activités, objets ou situations)",
      "Incapacité à se souvenir de parties importantes de l'événement stressant",
      "Croyances ou attentes négatives persistantes sur vous-même, les autres ou le monde",
      "Vous blâmer vous-même ou blâmer les autres pour l'événement stressant ou ses conséquences",
      "Émotions négatives intenses (peur, horreur, colère, culpabilité ou honte)",
      "Perte d'intérêt pour des activités que vous aimiez",
      "Sentiment de distance ou d'étrangeté vis-à-vis des autres",
      "Incapacité à ressentir des émotions positives (incapacité à éprouver de la joie, de la satisfaction ou de l'amour)",
      "Comportements irritables, accès de colère ou agressivité",
      "Prises de risques ou comportements autodestructeurs",
      "Être en état d'alerte, sur le qui-vive ou sur ses gardes",
      "Réactions de sursaut excessives",
      "Difficultés de concentration",
      "Troubles du sommeil",
    ],
    options: [
      { valeur: 0, label: 'Pas du tout' },
      { valeur: 1, label: 'Un peu' },
      { valeur: 2, label: 'Modérément' },
      { valeur: 3, label: 'Beaucoup' },
      { valeur: 4, label: 'Extrêmement' },
    ],
    severite: (score) => {
      if (score <= 32) return { label: 'Sous le seuil clinique', classe: 'minimal' };
      return { label: 'Score évocateur de TSPT', classe: 'severe' };
    },
  },

  // ── AAQ-II ─────────────────────────────────────────────────────────────────
  AAQ2: {
    id: 'AAQ2',
    titre: "AAQ-II — Questionnaire d'acceptation et d'action",
    description: "Mesure de la flexibilité psychologique et de l'évitement expérientiel",
    consigne: 'Veuillez noter dans quelle mesure chaque affirmation est vraie pour vous.',
    items: [
      "Mes expériences et souvenirs douloureux rendent difficile le fait de vivre la vie que je veux.",
      "J'ai peur de mes sentiments.",
      "Je me préoccupe de ne pas être capable de contrôler mes inquiétudes et mes sentiments.",
      "Mes souvenirs douloureux m'empêchent de mener une vie épanouissante.",
      "Mes émotions interfèrent avec la façon dont je voudrais organiser ma vie.",
      "Il me semble que la plupart des gens gèrent leur vie mieux que moi.",
      "Mes inquiétudes interfèrent avec mes activités.",
    ],
    options: [
      { valeur: 1, label: 'Jamais vrai' },
      { valeur: 2, label: 'Très rarement vrai' },
      { valeur: 3, label: 'Rarement vrai' },
      { valeur: 4, label: 'Parfois vrai' },
      { valeur: 5, label: 'Souvent vrai' },
      { valeur: 6, label: 'Presque toujours vrai' },
      { valeur: 7, label: 'Toujours vrai' },
    ],
    optionLayout: 'list',
    severite: (score) => {
      if (score <= 24) return { label: 'Flexibilité psychologique élevée', classe: 'minimal' };
      if (score <= 32) return { label: 'Flexibilité modérée', classe: 'leger' };
      return { label: 'Évitement expérientiel élevé', classe: 'severe' };
    },
  },

  // ── CFQ ────────────────────────────────────────────────────────────────────
  CFQ: {
    id: 'CFQ',
    titre: 'CFQ — Questionnaire de fusion cognitive',
    description: 'Mesure du degré de fusion cognitive',
    consigne: 'Veuillez lire attentivement chaque affirmation et indiquer à quel point elle est vraie pour vous.',
    items: [
      "Mes pensées font obstacle à ma façon d'agir.",
      "Je me bats contre mes propres pensées.",
      "Je me laisse tellement emporter par mes pensées qu'il m'est difficile de faire ce qui est important pour moi.",
      "Je me retrouve coincé(e) dans mes propres pensées.",
      "Mes pensées me semblent être la réalité.",
      "Mes pensées m'inquiètent.",
      "Il me semble difficile de mettre de la distance entre moi et mes pensées.",
    ],
    options: [
      { valeur: 1, label: 'Jamais vrai' },
      { valeur: 2, label: 'Très rarement vrai' },
      { valeur: 3, label: 'Rarement vrai' },
      { valeur: 4, label: 'Parfois vrai' },
      { valeur: 5, label: 'Souvent vrai' },
      { valeur: 6, label: 'Presque toujours vrai' },
      { valeur: 7, label: 'Toujours vrai' },
    ],
    optionLayout: 'list',
    severite: (score) => {
      if (score <= 19) return { label: 'Faible fusion cognitive', classe: 'minimal' };
      if (score <= 34) return { label: 'Fusion modérée', classe: 'modere' };
      return { label: 'Fusion cognitive élevée', classe: 'severe' };
    },
  },

  // ── QIPS ───────────────────────────────────────────────────────────────────
  QIPS: {
    id: 'QIPS',
    titre: "QIPS — Questionnaire sur les inquiétudes de Penn State",
    description: "Évaluation de la tendance à s'inquiéter",
    consigne: 'Indiquez dans quelle mesure chaque affirmation vous correspond.',
    items: [
      "Si je n'ai pas assez de temps pour tout faire, je ne m'inquiète pas.",
      "Mes inquiétudes me submergent.",
      "Je n'ai pas tendance à m'inquiéter des choses.",
      "Beaucoup de situations m'amènent à m'inquiéter.",
      "Je sais que je ne devrais pas m'inquiéter, mais je n'y peux rien.",
      "Quand je suis sous pression, je m'inquiète beaucoup.",
      "Je m'inquiète toujours pour quelque chose.",
      "Il m'est facile d'écarter des pensées inquiétantes.",
      "Dès que j'ai terminé une tâche, je commence à m'inquiéter pour tout le reste.",
      "Je ne m'inquiète jamais pour rien.",
      "Quand je ne peux rien faire au sujet d'un problème, je ne m'en inquiète plus.",
      "J'ai toujours été quelqu'un qui s'inquiète.",
      "Je remarque que je m'inquiète pour des choses.",
      "Une fois que j'ai commencé à m'inquiéter, je ne peux plus m'arrêter.",
      "Je m'inquiète tout le temps.",
      "Je m'inquiète pour mes projets jusqu'à ce qu'ils soient tous réalisés.",
    ],
    options: [
      { valeur: 1, label: 'Pas du tout typique' },
      { valeur: 2, label: 'Peu typique' },
      { valeur: 3, label: 'Assez typique' },
      { valeur: 4, label: 'Très typique' },
      { valeur: 5, label: 'Tout à fait typique' },
    ],
    // Items inversés (0-indexés) : 0, 2, 7, 9, 10
    scoreCalc: (answers) => {
      const inverses = new Set([0, 2, 7, 9, 10]);
      return answers.reduce((sum, a, i) => sum + (inverses.has(i) ? 6 - a : a), 0);
    },
    optionLayout: 'list',
    severite: (score) => {
      if (score <= 39) return { label: 'Inquiétudes dans la norme', classe: 'minimal' };
      if (score <= 59) return { label: 'Inquiétudes élevées', classe: 'modere' };
      return { label: 'Inquiétudes très élevées — évocatrices de TAG', classe: 'severe' };
    },
  },

  // ── IES-R ──────────────────────────────────────────────────────────────────
  IESR: {
    id: 'IESR',
    titre: "IES-R — Échelle d'impact des événements (révisée)",
    description: "Évaluation de l'impact d'un événement stressant sur les 7 derniers jours",
    consigne: "Voici une liste de difficultés que les gens éprouvent parfois à la suite d'un événement de vie stressant. Indiquez à quel point vous avez été perturbé(e) par chacune de ces difficultés au cours des 7 derniers jours.",
    intro: 'Ces questions peuvent évoquer des souvenirs difficiles. Prenez votre temps.',
    outro: 'Merci. Votre thérapeute prendra connaissance de vos réponses lors de votre prochaine séance.',
    items: [
      "Tout rappel de l'événement ravivait mes sentiments à ce sujet.",
      "J'avais du mal à dormir.",
      "D'autres choses continuaient de me faire penser à l'événement.",
      "Je me sentais irritable et en colère.",
      "J'évitais de me laisser bouleverser quand je pensais à l'événement ou que quelque chose me le rappelait.",
      "Je pensais à l'événement sans le vouloir.",
      "J'avais l'impression que l'événement n'avait pas eu lieu ou qu'il n'était pas réel.",
      "Je m'éloignais de tout rappel de l'événement.",
      "Des images de l'événement surgissaient dans mon esprit.",
      "J'étais facilement effrayé(e) et je sursautais.",
      "J'essayais de ne pas y penser.",
      "J'étais conscient(e) d'avoir encore beaucoup de sentiments à propos de l'événement, mais je ne m'en occupais pas.",
      "Mes sentiments à propos de l'événement étaient comme anesthésiés.",
      "Je me retrouvais à agir ou à ressentir comme si j'étais de retour à ce moment de l'événement.",
      "J'avais du mal à m'endormir.",
      "Des vagues de sentiments intenses à propos de l'événement me submergeaient.",
      "J'essayais de l'effacer de ma mémoire.",
      "J'avais du mal à me concentrer.",
      "Des rappels de l'événement provoquaient en moi des réactions physiques (sueurs, difficultés à respirer, nausées ou palpitations).",
      "Je rêvais de l'événement.",
      "Je me sentais aux aguets et sur mes gardes.",
      "J'essayais de ne pas en parler.",
    ],
    options: [
      { valeur: 0, label: 'Pas du tout' },
      { valeur: 1, label: 'Un peu' },
      { valeur: 2, label: 'Modérément' },
      { valeur: 3, label: 'Beaucoup' },
      { valeur: 4, label: 'Extrêmement' },
    ],
    sousScores: (answers) => ({
      intrusion:       [0,1,2,5,8,15,19].reduce((s,i) => s + answers[i], 0),
      evitement:       [4,6,7,10,11,12,16,21].reduce((s,i) => s + answers[i], 0),
      hyperactivation: [3,9,13,14,17,18,20].reduce((s,i) => s + answers[i], 0),
    }),
    severite: (score) => {
      if (score <= 23) return { label: 'Sous le seuil', classe: 'minimal' };
      if (score <= 32) return { label: 'TSPT probable', classe: 'modere' };
      return { label: 'TSPT sévère', classe: 'severe' };
    },
  },

  // ── AUDIT ──────────────────────────────────────────────────────────────────
  AUDIT: {
    id: 'AUDIT',
    titre: "AUDIT — Test d'identification des troubles liés à l'alcool",
    description: "Repérage d'une consommation d'alcool problématique",
    consigne: "Les questions suivantes portent sur votre consommation d'alcool au cours de l'année écoulée.",
    items: [
      "À quelle fréquence consommez-vous de l'alcool ?",
      "Combien de verres contenant de l'alcool consommez-vous un jour typique où vous buvez ?",
      "Au cours d'une même occasion, combien de fois consommez-vous six verres ou plus ?",
      "Au cours de l'année écoulée, combien de fois avez-vous constaté que vous n'étiez plus capable de vous arrêter de boire après avoir commencé ?",
      "Au cours de l'année écoulée, combien de fois votre consommation d'alcool vous a-t-elle empêché de faire ce qu'on attendait normalement de vous ?",
      "Au cours de l'année écoulée, combien de fois avez-vous eu besoin d'un premier verre pour pouvoir démarrer après avoir beaucoup bu la veille ?",
      "Au cours de l'année écoulée, combien de fois avez-vous eu un sentiment de culpabilité ou des remords après avoir bu ?",
      "Au cours de l'année écoulée, combien de fois avez-vous été incapable de vous souvenir de ce qui s'était passé la nuit précédente parce que vous aviez bu ?",
      "Avez-vous été blessé(e) ou quelqu'un d'autre a-t-il été blessé parce que vous aviez bu ?",
      "Est-ce qu'un proche, un médecin ou un autre professionnel de santé s'est préoccupé de votre consommation d'alcool ou a suggéré que vous la réduisiez ?",
    ],
    options: [
      { valeur: 0, label: 'Jamais' },
      { valeur: 1, label: "Moins d'une fois par mois" },
      { valeur: 2, label: 'Chaque mois' },
      { valeur: 3, label: 'Chaque semaine' },
      { valeur: 4, label: 'Chaque jour ou presque' },
    ],
    itemOptions: [
      [
        { valeur: 0, label: 'Jamais' },
        { valeur: 1, label: 'Une fois par mois ou moins' },
        { valeur: 2, label: 'Deux à quatre fois par mois' },
        { valeur: 3, label: 'Deux à trois fois par semaine' },
        { valeur: 4, label: 'Quatre fois ou plus par semaine' },
      ],
      [
        { valeur: 0, label: 'Un ou deux' },
        { valeur: 1, label: 'Trois ou quatre' },
        { valeur: 2, label: 'Cinq ou six' },
        { valeur: 3, label: 'Sept à neuf' },
        { valeur: 4, label: 'Dix ou plus' },
      ],
      null, null, null, null, null, null,
      [
        { valeur: 0, label: 'Non' },
        { valeur: 2, label: "Oui, mais pas au cours de l'année écoulée" },
        { valeur: 4, label: "Oui, au cours de l'année écoulée" },
      ],
      [
        { valeur: 0, label: 'Non' },
        { valeur: 2, label: "Oui, mais pas au cours de l'année écoulée" },
        { valeur: 4, label: "Oui, au cours de l'année écoulée" },
      ],
    ],
    optionLayout: 'list',
    severite: (score) => {
      if (score <= 7)  return { label: 'Consommation à faible risque', classe: 'minimal' };
      if (score <= 15) return { label: 'Consommation à risque', classe: 'leger' };
      if (score <= 19) return { label: 'Consommation nocive', classe: 'modere' };
      return { label: 'Dépendance probable', classe: 'severe' };
    },
  },

  // ── DAST-10 ────────────────────────────────────────────────────────────────
  DAST10: {
    id: 'DAST10',
    titre: 'DAST-10 — Dépistage des troubles liés aux drogues',
    description: 'Repérage d\'une consommation problématique de drogues (12 derniers mois)',
    consigne: "Par « drogues », on entend toute substance psychoactive autre que l'alcool et le tabac : cannabis, cocaïne, opiacés, médicaments détournés de leur usage, etc. Répondez par Oui ou Non.",
    items: [
      "Avez-vous utilisé des drogues autres que celles nécessaires pour des raisons médicales ?",
      "Avez-vous abusé de médicaments prescrits ?",
      "Avez-vous utilisé plusieurs drogues à la fois ?",
      "Pouvez-vous vous passer de drogues pendant une semaine ?",
      "Êtes-vous toujours capable d'arrêter de consommer quand vous le voulez ?",
      "Avez-vous eu des absences ou des « flashs » à cause de la drogue ?",
      "Avez-vous eu des conséquences négatives de votre consommation (famille, travail, santé) ?",
      "Avez-vous déjà eu des problèmes en lien avec votre consommation ?",
      "Avez-vous eu des problèmes médicaux à cause de votre consommation ?",
      "Avez-vous demandé de l'aide pour un problème lié à votre consommation ?",
    ],
    options: [
      { valeur: 0, label: 'Non' },
      { valeur: 1, label: 'Oui' },
    ],
    // Items inversés (0-indexés) : 3 et 4
    scoreCalc: (answers) => {
      const inverses = new Set([3, 4]);
      return answers.reduce((sum, a, i) => sum + (inverses.has(i) ? 1 - a : a), 0);
    },
    severite: (score) => {
      if (score === 0) return { label: 'Aucun problème signalé', classe: 'minimal' };
      if (score <= 2)  return { label: 'Niveau faible', classe: 'leger' };
      if (score <= 5)  return { label: 'Niveau modéré', classe: 'modere' };
      if (score <= 8)  return { label: 'Niveau substantiel', classe: 'modere-severe' };
      return { label: 'Niveau sévère', classe: 'severe' };
    },
  },

  // ── HAD ────────────────────────────────────────────────────────────────────
  // Items alternés Anxiété/Dépression : A1,D1,A2,D2,...,A7,D7
  // Indices pairs = Anxiété ; indices impairs = Dépression
  HAD: {
    id: 'HAD',
    titre: 'HAD — Hospital Anxiety and Depression Scale',
    description: 'Évaluation de l\'anxiété et de la dépression sur la dernière semaine',
    consigne: "Ce questionnaire aidera votre thérapeute à mieux connaître les émotions que vous éprouvez. Lisez chaque question et choisissez la réponse qui correspond le mieux à ce que vous avez éprouvé au cours de la semaine qui vient de s'écouler. Répondez spontanément, sans trop réfléchir.",
    items: [
      "Je me sens tendu(e) ou énervé(e)",                                                        // 0 — A1
      "Je prends plaisir aux mêmes choses qu'autrefois",                                         // 1 — D1
      "J'ai une sensation de peur comme si quelque chose d'horrible allait m'arriver",           // 2 — A2
      "Je ris facilement et vois le bon côté des choses",                                        // 3 — D2
      "Je me fais du souci",                                                                     // 4 — A3
      "Je suis de bonne humeur",                                                                 // 5 — D3
      "Je peux rester tranquillement assis(e) à ne rien faire et me sentir décontracté(e)",      // 6 — A4
      "J'ai l'impression de fonctionner au ralenti",                                             // 7 — D4
      "J'éprouve des sensations de peur et j'ai l'estomac noué",                                 // 8 — A5
      "Je ne m'intéresse plus à mon apparence",                                                  // 9 — D5
      "J'ai la bougeotte et n'arrive pas à tenir en place",                                      // 10 — A6
      "Je me réjouis d'avance à l'idée de faire certaines choses",                               // 11 — D6
      "J'éprouve des sensations soudaines de panique",                                           // 12 — A7
      "Je peux prendre plaisir à un bon livre ou à une bonne émission radio ou télévision",      // 13 — D7
    ],
    options: [
      { valeur: 0 }, { valeur: 1 }, { valeur: 2 }, { valeur: 3 },
    ],
    itemOptions: [
      // A1
      [{ valeur: 3, label: 'La plupart du temps' }, { valeur: 2, label: 'Souvent' }, { valeur: 1, label: 'De temps en temps' }, { valeur: 0, label: 'Jamais' }],
      // D1
      [{ valeur: 0, label: 'Oui, tout autant' }, { valeur: 1, label: 'Pas autant' }, { valeur: 2, label: 'Un peu seulement' }, { valeur: 3, label: 'Presque plus' }],
      // A2
      [{ valeur: 3, label: 'Oui, très nettement' }, { valeur: 2, label: "Oui, mais ce n'est pas trop grave" }, { valeur: 1, label: "Un peu, mais cela ne m'inquiète pas" }, { valeur: 0, label: 'Pas du tout' }],
      // D2
      [{ valeur: 0, label: 'Autant que par le passé' }, { valeur: 1, label: "Plus autant qu'avant" }, { valeur: 2, label: 'Vraiment moins qu\'avant' }, { valeur: 3, label: 'Plus du tout' }],
      // A3
      [{ valeur: 3, label: 'Très souvent' }, { valeur: 2, label: 'Assez souvent' }, { valeur: 1, label: 'Occasionnellement' }, { valeur: 0, label: 'Très occasionnellement' }],
      // D3
      [{ valeur: 3, label: 'Jamais' }, { valeur: 2, label: 'Rarement' }, { valeur: 1, label: 'Assez souvent' }, { valeur: 0, label: 'La plupart du temps' }],
      // A4
      [{ valeur: 0, label: 'Oui, quoi qu\'il arrive' }, { valeur: 1, label: 'Oui, en général' }, { valeur: 2, label: 'Rarement' }, { valeur: 3, label: 'Jamais' }],
      // D4
      [{ valeur: 3, label: 'Presque toujours' }, { valeur: 2, label: 'Très souvent' }, { valeur: 1, label: 'Parfois' }, { valeur: 0, label: 'Jamais' }],
      // A5
      [{ valeur: 0, label: 'Jamais' }, { valeur: 1, label: 'Parfois' }, { valeur: 2, label: 'Assez souvent' }, { valeur: 3, label: 'Très souvent' }],
      // D5
      [{ valeur: 3, label: 'Plus du tout' }, { valeur: 2, label: "Je n'y accorde pas autant d'attention que je le devrais" }, { valeur: 1, label: "Il se peut que je n'y fasse plus autant attention" }, { valeur: 0, label: "J'y prête autant d'attention que par le passé" }],
      // A6
      [{ valeur: 3, label: "Oui, c'est tout à fait le cas" }, { valeur: 2, label: 'Un peu' }, { valeur: 1, label: 'Pas tellement' }, { valeur: 0, label: 'Pas du tout' }],
      // D6
      [{ valeur: 0, label: "Autant qu'avant" }, { valeur: 1, label: "Un peu moins qu'avant" }, { valeur: 2, label: 'Bien moins qu\'avant' }, { valeur: 3, label: 'Presque jamais' }],
      // A7
      [{ valeur: 3, label: 'Vraiment très souvent' }, { valeur: 2, label: 'Assez souvent' }, { valeur: 1, label: 'Pas très souvent' }, { valeur: 0, label: 'Jamais' }],
      // D7
      [{ valeur: 0, label: 'Souvent' }, { valeur: 1, label: 'Parfois' }, { valeur: 2, label: 'Rarement' }, { valeur: 3, label: 'Très rarement' }],
    ],
    optionLayout: 'list',
    sousScores: (answers) => {
      const interpHAD = (s) => s <= 7 ? 'Absence de symptomatologie' : s <= 10 ? 'Cas douteux' : 'Cas certain';
      const scoreA = [0,2,4,6,8,10,12].reduce((s,i) => s + answers[i], 0);
      const scoreD = [1,3,5,7,9,11,13].reduce((s,i) => s + answers[i], 0);
      return {
        score_anxiete: scoreA,
        score_depression: scoreD,
        interpretation_anxiete: interpHAD(scoreA),
        interpretation_depression: interpHAD(scoreD),
      };
    },
    severite: (score) => {
      // Score global (0-42) — indicatif ; les sous-scores font foi
      if (score <= 14) return { label: 'Absence de symptomatologie', classe: 'minimal' };
      if (score <= 20) return { label: 'Symptomatologie douteuse', classe: 'leger' };
      return { label: 'Symptomatologie certaine', classe: 'modere' };
    },
  },

  // ── LSAS ───────────────────────────────────────────────────────────────────
  // 24 situations × 2 cotations = 48 réponses
  // answers[2i] = anxiété situation i ; answers[2i+1] = évitement situation i
  LSAS: {
    id: 'LSAS',
    titre: 'LSAS — Liebowitz Social Anxiety Scale',
    description: 'Évaluation de la phobie sociale : anxiété et évitement',
    consigne: "Pour chacune des situations suivantes, indiquez d'abord le niveau d'anxiété ou de peur que vous ressentez dans cette situation, puis dans quelle mesure vous évitez cette situation.",
    optionLayout: 'paires',
    situations: [
      "Téléphoner en public",
      "Participer au sein d'un petit groupe",
      "Manger dans un lieu public",
      "Boire en compagnie dans un lieu public",
      "Parler à des gens qui détiennent une autorité",
      "Jouer, donner une représentation ou une conférence",
      "Aller à une soirée",
      "Travailler en étant observé(e)",
      "Écrire en étant observé(e)",
      "Contacter par téléphone quelqu'un que vous ne connaissez pas très bien",
      "Parler à des gens que vous ne connaissez pas très bien",
      "Rencontrer des inconnus",
      "Uriner dans les toilettes publiques",
      "Entrer dans une pièce alors que tout le monde est déjà assis",
      "Être le centre d'attention",
      "Prendre la parole à une réunion",
      "Passer un examen",
      "Exprimer son désaccord à des gens que vous ne connaissez pas très bien",
      "Regarder dans les yeux des gens que vous ne connaissez pas très bien",
      "Faire un compte-rendu à un groupe",
      'Essayer de "draguer" quelqu\'un',
      "Rapporter des marchandises dans un magasin",
      "Donner une soirée",
      "Résister aux pressions d'un vendeur insistant",
    ],
    optionsAnxiete: [
      { valeur: 0, label: 'Aucune' },
      { valeur: 1, label: 'Légère' },
      { valeur: 2, label: 'Moyenne' },
      { valeur: 3, label: 'Sévère' },
    ],
    optionsEvitement: [
      { valeur: 0, label: 'Jamais (0 %)' },
      { valeur: 1, label: 'Occasionnel (1–33 %)' },
      { valeur: 2, label: 'Fréquent (34–66 %)' },
      { valeur: 3, label: 'Habituel (67–100 %)' },
    ],
    // items nécessaire pour validation de longueur (48 = 24 × 2)
    items: Array.from({ length: 48 }, (_, i) =>
      i % 2 === 0
        ? `Anxiété — situation ${Math.floor(i/2) + 1}`
        : `Évitement — situation ${Math.floor(i/2) + 1}`
    ),
    options: [
      { valeur: 0 }, { valeur: 1 }, { valeur: 2 }, { valeur: 3 },
    ],
    sousScores: (answers) => {
      // Performance (0-indexés) : 0,1,2,3,5,7,8,12,13,15,16,19
      // Sociale (0-indexés)     : 4,6,9,10,11,14,17,18,20,21,22,23
      const perf   = [0,1,2,3,5,7,8,12,13,15,16,19];
      const social = [4,6,9,10,11,14,17,18,20,21,22,23];
      let ap=0, ep=0, as=0, es=0;
      perf.forEach(i   => { ap += answers[2*i]; ep += answers[2*i+1]; });
      social.forEach(i => { as += answers[2*i]; es += answers[2*i+1]; });
      return {
        anxiete_performance:   ap,
        anxiete_sociale:       as,
        evitement_performance: ep,
        evitement_sociale:     es,
        total_anxiete:         ap + as,
        total_evitement:       ep + es,
      };
    },
    severite: (score) => {
      if (score <= 55)  return { label: 'Phobie sociale légère ou absente', classe: 'minimal' };
      if (score <= 65)  return { label: 'Phobie sociale modérée', classe: 'leger' };
      if (score <= 80)  return { label: 'Phobie sociale marquée', classe: 'modere' };
      if (score <= 95)  return { label: 'Phobie sociale sévère', classe: 'modere-severe' };
      return { label: 'Phobie sociale très sévère', classe: 'severe' };
    },
  },

  // ── BDI-II ─────────────────────────────────────────────────────────────────
  BDI2: {
    id: 'BDI2',
    titre: 'BDI-II — Inventaire de dépression de Beck',
    description: 'Évaluation de la sévérité de la dépression sur les deux dernières semaines',
    consigne: "Ce questionnaire comporte 21 groupes d'énoncés. Pour chaque groupe, choisissez l'énoncé qui décrit le mieux comment vous vous êtes senti(e) au cours des deux dernières semaines, incluant aujourd'hui. Si plusieurs énoncés vous conviennent également, choisissez celui avec le chiffre le plus élevé.",
    items: [
      "Tristesse",                                    // 0
      "Pessimisme",                                   // 1
      "Échecs dans le passé",                         // 2
      "Perte de plaisir",                             // 3
      "Sentiments de culpabilité",                    // 4
      "Sentiment d'être puni(e)",                     // 5
      "Sentiments négatifs envers soi-même",          // 6
      "Attitude critique envers soi",                 // 7
      "Pensées ou désirs de suicide",                 // 8
      "Pleurs",                                       // 9
      "Agitation",                                    // 10
      "Perte d'intérêt",                              // 11
      "Indécision",                                   // 12
      "Dévalorisation",                               // 13
      "Perte d'énergie",                              // 14
      "Modifications dans les habitudes de sommeil",  // 15
      "Irritabilité",                                 // 16
      "Modifications de l'appétit",                   // 17
      "Difficulté à se concentrer",                   // 18
      "Fatigue",                                      // 19
      "Perte d'intérêt pour le sexe",                 // 20
    ],
    options: [
      { valeur: 0 }, { valeur: 1 }, { valeur: 2 }, { valeur: 3 },
    ],
    itemOptions: [
      // 0 — Tristesse
      [{ valeur: 0, label: "Je ne me sens pas triste." }, { valeur: 1, label: "Je me sens très souvent triste." }, { valeur: 2, label: "Je suis tout le temps triste." }, { valeur: 3, label: "Je suis si triste ou si malheureux(se) que ce n'est pas supportable." }],
      // 1 — Pessimisme
      [{ valeur: 0, label: "Je ne suis pas découragé(e) face à mon avenir." }, { valeur: 1, label: "Je me sens plus découragé(e) qu'avant face à mon avenir." }, { valeur: 2, label: "Je ne m'attends pas à ce que les choses s'arrangent pour moi." }, { valeur: 3, label: "J'ai le sentiment que mon avenir est sans espoir et qu'il ne peut qu'empirer." }],
      // 2 — Échecs
      [{ valeur: 0, label: "Je n'ai pas le sentiment d'avoir échoué dans la vie, d'être un(e) raté(e)." }, { valeur: 1, label: "J'ai échoué plus souvent que je n'aurais dû." }, { valeur: 2, label: "Quand je pense à mon passé, je constate un grand nombre d'échecs." }, { valeur: 3, label: "J'ai le sentiment d'avoir complètement raté ma vie." }],
      // 3 — Plaisir
      [{ valeur: 0, label: "J'éprouve toujours autant de plaisir qu'avant aux choses qui me plaisent." }, { valeur: 1, label: "Je n'éprouve pas autant de plaisir aux choses qu'avant." }, { valeur: 2, label: "J'éprouve très peu de plaisir aux choses qui me plaisaient habituellement." }, { valeur: 3, label: "Je n'éprouve aucun plaisir aux choses qui me plaisaient habituellement." }],
      // 4 — Culpabilité
      [{ valeur: 0, label: "Je ne me sens pas particulièrement coupable." }, { valeur: 1, label: "Je me sens coupable pour bien des choses que j'ai faites ou que j'aurais dû faire." }, { valeur: 2, label: "Je me sens coupable la plupart du temps." }, { valeur: 3, label: "Je me sens tout le temps coupable." }],
      // 5 — Punition
      [{ valeur: 0, label: "Je n'ai pas le sentiment d'être puni(e)." }, { valeur: 1, label: "Je sens que je pourrais être puni(e)." }, { valeur: 2, label: "Je m'attends à être puni(e)." }, { valeur: 3, label: "J'ai le sentiment d'être puni(e)." }],
      // 6 — Soi
      [{ valeur: 0, label: "Mes sentiments envers moi-même n'ont pas changé." }, { valeur: 1, label: "J'ai perdu confiance en moi." }, { valeur: 2, label: "Je suis déçu(e) par moi-même." }, { valeur: 3, label: "Je ne m'aime pas du tout." }],
      // 7 — Critique
      [{ valeur: 0, label: "Je ne me blâme pas ou ne me critique pas plus que d'habitude." }, { valeur: 1, label: "Je suis plus critique envers moi-même que je ne l'étais." }, { valeur: 2, label: "Je me reproche tous mes défauts." }, { valeur: 3, label: "Je me reproche tous les malheurs qui arrivent." }],
      // 8 — Suicide (⚠️ alerteSecurite sur ce item)
      [{ valeur: 0, label: "Je ne pense pas du tout à me suicider." }, { valeur: 1, label: "Il m'arrive de penser à me suicider, mais je ne le ferai pas." }, { valeur: 2, label: "J'aimerais me suicider." }, { valeur: 3, label: "Je me suiciderais si l'occasion se présentait." }],
      // 9 — Pleurs
      [{ valeur: 0, label: "Je ne pleure pas plus qu'avant." }, { valeur: 1, label: "Je pleure plus qu'avant." }, { valeur: 2, label: "Je pleure pour la moindre petite chose." }, { valeur: 3, label: "Je voudrais pleurer mais je ne suis pas capable." }],
      // 10 — Agitation
      [{ valeur: 0, label: "Je ne suis pas plus agité(e) ou plus tendu(e) que d'habitude." }, { valeur: 1, label: "Je me sens plus agité(e) ou plus tendu(e) que d'habitude." }, { valeur: 2, label: "Je suis si agité(e) ou tendu(e) que j'ai du mal à rester tranquille." }, { valeur: 3, label: "Je suis si agité(e) ou tendu(e) que je dois continuellement bouger ou faire quelque chose." }],
      // 11 — Intérêt
      [{ valeur: 0, label: "Je n'ai pas perdu d'intérêt pour les gens ou pour les activités." }, { valeur: 1, label: "Je m'intéresse moins qu'avant aux gens et aux choses." }, { valeur: 2, label: "Je ne m'intéresse presque plus aux gens et aux choses." }, { valeur: 3, label: "J'ai du mal à m'intéresser à quoi que ce soit." }],
      // 12 — Décision
      [{ valeur: 0, label: "Je prends des décisions toujours aussi bien qu'avant." }, { valeur: 1, label: "Il m'est plus difficile que d'habitude de prendre des décisions." }, { valeur: 2, label: "J'ai beaucoup plus de mal qu'avant à prendre des décisions." }, { valeur: 3, label: "J'ai du mal à prendre n'importe quelle décision." }],
      // 13 — Valeur
      [{ valeur: 0, label: "Je pense être quelqu'un de valable." }, { valeur: 1, label: "Je ne crois pas avoir autant de valeur ni être aussi utile qu'avant." }, { valeur: 2, label: "Je me sens moins valable que les autres." }, { valeur: 3, label: "Je sens que je ne vaux absolument rien." }],
      // 14 — Énergie
      [{ valeur: 0, label: "J'ai toujours autant d'énergie qu'avant." }, { valeur: 1, label: "J'ai moins d'énergie qu'avant." }, { valeur: 2, label: "Je n'ai pas assez d'énergie pour pouvoir faire grand-chose." }, { valeur: 3, label: "J'ai trop peu d'énergie pour faire quoi que ce soit." }],
      // 15 — Sommeil (options a/b partagent le même score)
      [
        { valeur: 0, label: "Mes habitudes de sommeil n'ont pas changé." },
        { valeur: 1, label: "Je dors un peu plus que d'habitude." },
        { valeur: 1, label: "Je dors un peu moins que d'habitude." },
        { valeur: 2, label: "Je dors beaucoup plus que d'habitude." },
        { valeur: 2, label: "Je dors beaucoup moins que d'habitude." },
        { valeur: 3, label: "Je dors presque toute la journée." },
        { valeur: 3, label: "Je me réveille une ou deux heures plus tôt et je suis incapable de me rendormir." },
      ],
      // 16 — Irritabilité
      [{ valeur: 0, label: "Je ne suis pas plus irritable que d'habitude." }, { valeur: 1, label: "Je suis plus irritable que d'habitude." }, { valeur: 2, label: "Je suis beaucoup plus irritable que d'habitude." }, { valeur: 3, label: "Je suis constamment irritable." }],
      // 17 — Appétit (options a/b partagent le même score)
      [
        { valeur: 0, label: "Mon appétit n'a pas changé." },
        { valeur: 1, label: "J'ai un peu moins d'appétit que d'habitude." },
        { valeur: 1, label: "J'ai un peu plus d'appétit que d'habitude." },
        { valeur: 2, label: "J'ai beaucoup moins d'appétit que d'habitude." },
        { valeur: 2, label: "J'ai beaucoup plus d'appétit que d'habitude." },
        { valeur: 3, label: "Je n'ai pas d'appétit du tout." },
        { valeur: 3, label: "J'ai constamment envie de manger." },
      ],
      // 18 — Concentration
      [{ valeur: 0, label: "Je parviens à me concentrer toujours aussi bien qu'avant." }, { valeur: 1, label: "Je ne parviens pas à me concentrer aussi bien que d'habitude." }, { valeur: 2, label: "J'ai du mal à me concentrer longtemps sur quoi que ce soit." }, { valeur: 3, label: "Je me trouve incapable de me concentrer sur quoi que ce soit." }],
      // 19 — Fatigue
      [{ valeur: 0, label: "Je ne suis pas plus fatigué(e) que d'habitude." }, { valeur: 1, label: "Je me fatigue plus facilement que d'habitude." }, { valeur: 2, label: "Je suis trop fatigué(e) pour faire un grand nombre de choses que je faisais avant." }, { valeur: 3, label: "Je suis trop fatigué(e) pour faire la plupart des choses que je faisais avant." }],
      // 20 — Sexe
      [{ valeur: 0, label: "Je n'ai pas noté de changement récent dans mon intérêt pour le sexe." }, { valeur: 1, label: "Le sexe m'intéresse moins qu'avant." }, { valeur: 2, label: "Le sexe m'intéresse beaucoup moins maintenant." }, { valeur: 3, label: "J'ai perdu tout intérêt pour le sexe." }],
    ],
    alerteSecurite: {
      itemIndex: 8,
      seuil: 2,
      message: "Votre thérapeute prendra connaissance de vos réponses prochainement. Si vous avez besoin d'aide maintenant, vous pouvez appeler le 3114 (numéro national de prévention du suicide, disponible 24h/24).",
    },
    optionLayout: 'list',
    severite: (score) => {
      if (score <= 13) return { label: 'Dépression minimale', classe: 'minimal' };
      if (score <= 19) return { label: 'Dépression légère', classe: 'leger' };
      if (score <= 28) return { label: 'Dépression modérée', classe: 'modere' };
      return { label: 'Dépression sévère', classe: 'severe' };
    },
  },

  // ── RATHUS ─────────────────────────────────────────────────────────────────
  RATHUS: {
    id: 'RATHUS',
    titre: "Rathus — Échelle d'affirmation de soi",
    description: "Évaluation du comportement assertif",
    consigne: "Indiquez à quel degré chaque affirmation est caractéristique de votre comportement habituel.\n+3 Très vrai / +2 Plutôt vrai / +1 Un peu vrai / -1 Un peu faux / -2 Plutôt faux / -3 Vraiment faux",
    items: [
      "La plupart des gens me semblent être plus agressifs et défendre mieux leurs droits que moi.",
      "Il m'est arrivé d'hésiter par timidité au moment de donner ou d'accepter des rendez-vous.",
      "Quand la nourriture dans un restaurant ne me satisfait pas, je m'en plains au serveur.",
      "Je fais toujours attention à ne pas heurter les sentiments des autres, même lorsque je sens que l'on m'a blessé(e).",
      "Si un vendeur s'est donné beaucoup de mal à me montrer une marchandise qui ne convient pas, j'ai du mal à dire non.",
      "Lorsqu'on me demande de faire quelque chose, j'insiste pour en savoir la raison.",
      "Il y a des moments où je cherche une bonne et vigoureuse discussion.",
      "Je me bats pour arriver aussi bien que les autres dans ma profession.",
      "À vrai dire, les gens tirent souvent profit de moi.",
      "J'ai du plaisir à entreprendre des conversations avec de nouvelles connaissances ou des étrangers.",
      "Souvent je ne sais rien dire à des personnes séduisantes du sexe opposé.",
      "J'hésiterais à téléphoner à un grand établissement de commerce ou à une administration.",
      "Je préférerais poser ma candidature pour un autre travail par lettre plutôt que par un entretien personnel.",
      "Je trouve embarrassant de renvoyer une marchandise.",
      "Si un parent proche et respecté est en train de m'ennuyer, j'étoufferais mes sentiments plutôt que d'exprimer cette gêne.",
      "Il m'est arrivé d'éviter de poser des questions par peur de paraître stupide.",
      "Pendant une discussion serrée, j'ai souvent peur d'être bouleversé(e) au point de trembler de tout mon corps.",
      "Si un conférencier réputé dit quelque chose que je pense inexact, j'aimerais que le public entende aussi mon point de vue.",
      "J'évite de discuter les prix avec les représentants et les vendeurs.",
      "Lorsque j'ai fait quelque chose d'important et de valable, je m'arrange pour le faire savoir aux autres.",
      "Je suis ouvert(e) et franc(he) au sujet de mes sentiments.",
      "Si quelqu'un a répandu des histoires fausses à mon sujet, je le vois aussi vite que possible pour une explication.",
      "J'ai souvent du mal à dire non.",
      "J'ai tendance à contenir des émotions plutôt que de faire une scène.",
      "Je me plains lorsque le service est mal fait, dans un restaurant ou ailleurs.",
      "Souvent je ne sais pas quoi dire lorsqu'on me fait un compliment.",
      "Au cinéma, si un couple près de moi parle à voix haute, je lui demande de se taire.",
      "Quiconque cherche à passer devant moi dans une queue risque une bonne explication.",
      "Je suis rapide dans l'expression de mes opinions.",
      "Il y a des moments où je ne sais pas quoi dire.",
    ],
    options: [
      { valeur: -3, label: '-3 — Vraiment faux' },
      { valeur: -2, label: '-2 — Plutôt faux' },
      { valeur: -1, label: '-1 — Un peu faux' },
      { valeur: 1,  label: '+1 — Un peu vrai' },
      { valeur: 2,  label: '+2 — Plutôt vrai' },
      { valeur: 3,  label: '+3 — Très vrai' },
    ],
    // Items inversés (0-indexés) : 0,1,3,4,8,10,11,12,13,14,15,16,18,22,23,25,29
    scoreCalc: (answers) => {
      const inverses = new Set([0,1,3,4,8,10,11,12,13,14,15,16,18,22,23,25,29]);
      return answers.reduce((sum, a, i) => sum + (inverses.has(i) ? -a : a), 0);
    },
    optionLayout: 'list',
    severite: (score) => {
      if (score < -20) return { label: 'Comportement très peu affirmatif', classe: 'severe' };
      if (score <= 0)  return { label: 'Comportement peu affirmatif', classe: 'modere' };
      if (score <= 20) return { label: 'Comportement moyennement affirmatif', classe: 'leger' };
      return { label: 'Comportement affirmatif', classe: 'minimal' };
    },
  },

  // ── PHQ-15 ─────────────────────────────────────────────────────────────────
  PHQ15: {
    id: 'PHQ15',
    titre: 'PHQ-15 — Symptômes somatiques',
    description: 'Évaluation des symptômes physiques fonctionnels sur les 4 dernières semaines',
    consigne: 'Au cours des 4 dernières semaines, dans quelle mesure avez-vous été gêné(e) par les problèmes suivants ?',
    optionLayout: 'list',
    items: [
      'Douleurs stomacales',
      'Maux de dos',
      'Douleurs dans les bras, les jambes ou les articulations',
      'Règles douloureuses ou autres problèmes liés aux règles',
      'Maux de tête',
      'Douleurs thoraciques',
      'Vertiges',
      'Évanouissements',
      'Palpitations cardiaques ou accélération du rythme cardiaque',
      'Essoufflement',
      'Rapports sexuels douloureux ou autres problèmes sexuels',
      'Constipation, selles molles ou diarrhée',
      'Nausées, gaz ou indigestion',
      'Sensation de fatigue ou manque d\'énergie',
      'Difficultés à dormir',
    ],
    options: [
      { valeur: 0, label: 'Pas du tout' },
      { valeur: 1, label: 'Un peu' },
      { valeur: 2, label: 'Beaucoup' },
    ],
    itemOptions: [
      null, null, null,
      // item 4 — règles : option supplémentaire "Non concerné(e)" valeur 0
      [
        { valeur: 0, label: 'Pas du tout' },
        { valeur: 1, label: 'Un peu' },
        { valeur: 2, label: 'Beaucoup' },
        { valeur: 0, label: 'Non concerné(e)' },
      ],
      null, null, null, null, null, null, null, null, null, null, null,
    ],
    severite: (score) => {
      if (score <= 4)  return { label: 'Symptômes minimes', classe: 'minimal' };
      if (score <= 9)  return { label: 'Symptômes légers', classe: 'leger' };
      if (score <= 14) return { label: 'Symptômes modérés', classe: 'modere' };
      return { label: 'Symptômes sévères', classe: 'severe' };
    },
  },

  // ── WAI-SR ─────────────────────────────────────────────────────────────────
  WAISR: {
    id: 'WAISR',
    titre: 'WAI-SR — Alliance thérapeutique',
    description: 'Évaluation de la qualité de l\'alliance de travail avec le thérapeute',
    consigne: 'Les phrases suivantes décrivent certains aspects de votre relation avec votre thérapeute. Indiquez à quel point chaque phrase correspond à ce que vous ressentez actuellement.',
    intro: 'Ces questions portent sur votre relation avec votre thérapeute. Il n\'y a pas de bonne ou mauvaise réponse. Vos réponses aident votre thérapeute à mieux vous accompagner.',
    optionLayout: 'list',
    items: [
      'Mon thérapeute et moi nous mettons d\'accord sur les étapes à suivre pour améliorer ma situation.',
      'Ce que je fais en thérapie me donne de nouvelles façons de voir mon problème.',
      'Je crois que mon thérapeute m\'aime bien.',
      'Mon thérapeute ne comprend pas ce que j\'essaie d\'accomplir en thérapie.',
      'Je suis confiant(e) que mon thérapeute peut m\'aider.',
      'Mon thérapeute et moi travaillons vers des objectifs sur lesquels nous nous sommes mutuellement mis d\'accord.',
      'Je ressens de l\'inconfort à propos des buts de ces séances.',
      'Mon thérapeute et moi nous respectons mutuellement.',
      'Mon thérapeute et moi avons des idées différentes sur ce que sont mes vrais problèmes.',
      'Mon thérapeute et moi avons établi une bonne compréhension du type de changements qui me seraient bénéfiques.',
      'Nous nous entendons sur ce qui est important pour moi de travailler.',
      'Ce que nous faisons en thérapie est lié à mes préoccupations.',
    ],
    options: [
      { valeur: 1, label: 'Jamais' },
      { valeur: 2, label: 'Rarement' },
      { valeur: 3, label: 'Parfois' },
      { valeur: 4, label: 'Assez souvent' },
      { valeur: 5, label: 'Souvent' },
      { valeur: 6, label: 'Toujours' },
    ],
    // Items inversés (0-indexés) : 3, 6, 8 → score = 7 - réponse
    scoreCalc: (answers) => {
      const inverses = new Set([3, 6, 8]);
      return answers.reduce((sum, a, i) => sum + (inverses.has(i) ? 7 - a : a), 0);
    },
    severite: (score) => {
      if (score <= 35) return { label: 'Alliance faible', classe: 'severe' };
      if (score <= 54) return { label: 'Alliance modérée', classe: 'modere' };
      return { label: 'Alliance forte', classe: 'minimal' };
    },
  },

  // ── VQ ─────────────────────────────────────────────────────────────────────
  VQ: {
    id: 'VQ',
    titre: 'VQ — Questionnaire des valeurs',
    description: 'Évaluation de l\'engagement dans les valeurs personnelles et des obstacles à cet engagement',
    consigne: 'Les phrases suivantes concernent vos valeurs et la façon dont vous les vivez au quotidien. Pensez à la semaine qui vient de s\'écouler et indiquez dans quelle mesure chaque phrase vous correspond.',
    optionLayout: 'list',
    items: [
      'Je vivais selon mes valeurs personnelles.',
      'Mes préoccupations m\'empêchaient de faire ce que je voulais vraiment faire.',
      'Mes actions reflétaient ce qui compte vraiment pour moi.',
      'Mes émotions ou pensées douloureuses m\'empêchaient de vivre selon mes valeurs.',
      'J\'agissais en accord avec ce en quoi je crois.',
      'Je me sentais bloqué(e) et incapable d\'agir selon mes valeurs.',
      'Je faisais ce qui a du sens pour moi.',
      'Même si je voulais agir selon mes valeurs, quelque chose m\'en empêchait.',
      'Je poursuivais des activités qui m\'importent.',
      'Mes difficultés intérieures m\'empêchaient de faire ce qui compte pour moi.',
    ],
    options: [
      { valeur: 0, label: '0 — Pas du tout vrai' },
      { valeur: 1, label: '1' },
      { valeur: 2, label: '2' },
      { valeur: 3, label: '3' },
      { valeur: 4, label: '4' },
      { valeur: 5, label: '5' },
      { valeur: 6, label: '6 — Tout à fait vrai' },
    ],
    // score = progression (items pairs 0,2,4,6,8)
    scoreCalc: (answers) => [0, 2, 4, 6, 8].reduce((s, i) => s + answers[i], 0),
    sousScores: (answers) => {
      const progression = [0, 2, 4, 6, 8].reduce((s, i) => s + answers[i], 0);
      const obstruction = [1, 3, 5, 7, 9].reduce((s, i) => s + answers[i], 0);
      const interpProg = progression <= 10 ? 'Faible engagement dans les valeurs'
        : progression <= 20 ? 'Engagement modéré' : 'Engagement élevé';
      const interpObs = obstruction <= 10 ? 'Faible obstruction'
        : obstruction <= 20 ? 'Obstruction modérée' : 'Obstruction élevée';
      return { score_progression: progression, score_obstruction: obstruction, interpretation_progression: interpProg, interpretation_obstruction: interpObs };
    },
    severite: (score) => {
      if (score <= 10) return { label: 'Engagement faible dans les valeurs', classe: 'severe' };
      if (score <= 20) return { label: 'Engagement modéré dans les valeurs', classe: 'modere' };
      return { label: 'Engagement élevé dans les valeurs', classe: 'minimal' };
    },
  },

  // ── DERS ───────────────────────────────────────────────────────────────────
  DERS: {
    id: 'DERS',
    titre: 'DERS — Difficultés de régulation émotionnelle',
    description: 'Évaluation des difficultés à réguler les émotions',
    consigne: 'Indiquez dans quelle mesure chaque affirmation s\'applique à vous en général.',
    optionLayout: 'list',
    items: [
      // 1 CLARTÉ *
      'Je sais clairement ce que je ressens.',
      // 2 CONSCIENCE *
      'Je fais attention à ce que je ressens.',
      // 3 IMPULSIVITÉ
      'Quand je suis contrarié(e), j\'ai du mal à contrôler mes comportements.',
      // 4 CLARTÉ
      'J\'ai du mal à comprendre mes sentiments.',
      // 5 CLARTÉ *
      'Je comprends mes émotions.',
      // 6 CONSCIENCE *
      'Je m\'intéresse à ce que je ressens.',
      // 7 CLARTÉ *
      'Je sais exactement ce que je ressens.',
      // 8 CONSCIENCE *
      'Je prête attention à mes émotions.',
      // 9 CLARTÉ
      'J\'ai du mal à donner un sens à mes sentiments.',
      // 10 CONSCIENCE *
      'Je suis attentif(ve) à mes sentiments.',
      // 11 NON-ACCEPTATION
      'Quand je suis contrarié(e), je me sens coupable de me sentir ainsi.',
      // 12 NON-ACCEPTATION
      'Quand je suis contrarié(e), j\'ai honte de me sentir ainsi.',
      // 13 DIFFICULTÉS
      'Quand je suis contrarié(e), j\'ai du mal à me concentrer.',
      // 14 IMPULSIVITÉ
      'Quand je suis contrarié(e), je perds le contrôle de mes comportements.',
      // 15 STRATÉGIES
      'Quand je suis contrarié(e), je crois que je vais rester ainsi longtemps.',
      // 16 STRATÉGIES
      'Quand je suis contrarié(e), je crois que je vais finir par me sentir très déprimé(e).',
      // 17 CONSCIENCE *
      'Je sais ce que je ressens.',
      // 18 DIFFICULTÉS
      'Quand je suis contrarié(e), j\'ai du mal à me focaliser sur autre chose.',
      // 19 IMPULSIVITÉ
      'Quand je suis contrarié(e), je me comporte de façon incontrôlée.',
      // 20 DIFFICULTÉS
      'Quand je suis contrarié(e), j\'ai du mal à accomplir mes tâches.',
      // 21 NON-ACCEPTATION
      'Quand je suis contrarié(e), je me sens embarrassé(e) de me sentir ainsi.',
      // 22 STRATÉGIES *
      'Quand je suis contrarié(e), je sais que je peux trouver un moyen de me sentir mieux.',
      // 23 NON-ACCEPTATION
      'Quand je suis contrarié(e), je me sens mal à l\'aise avec mes propres émotions.',
      // 24 IMPULSIVITÉ
      'Quand je suis contrarié(e), je me sens hors de contrôle.',
      // 25 NON-ACCEPTATION
      'Quand je suis contrarié(e), je me sens faible.',
      // 26 DIFFICULTÉS
      'Quand je suis contrarié(e), j\'ai du mal à penser à autre chose.',
      // 27 IMPULSIVITÉ
      'Quand je suis contrarié(e), je fais des choses dont j\'ai honte par la suite.',
      // 28 STRATÉGIES
      'Quand je suis contrarié(e), je crois qu\'il n\'y a rien que je puisse faire pour me sentir mieux.',
      // 29 NON-ACCEPTATION
      'Quand je suis contrarié(e), je suis en colère contre moi-même.',
      // 30 STRATÉGIES
      'Quand je suis contrarié(e), je crois que tout ce que je peux faire c\'est de rester avec mes émotions.',
      // 31 STRATÉGIES
      'Quand je suis contrarié(e), je crois que l\'apitoiement est ma seule réaction possible.',
      // 32 IMPULSIVITÉ
      'Quand je suis contrarié(e), je fais des choses que je regrette.',
      // 33 DIFFICULTÉS
      'Quand je suis contrarié(e), j\'ai du mal à me concentrer sur autre chose.',
      // 34 CONSCIENCE *
      'Je prends le temps de comprendre ce que je ressens.',
      // 35 STRATÉGIES
      'Quand je suis contrarié(e), il faut du temps avant de me sentir mieux.',
      // 36 STRATÉGIES
      'Quand je suis contrarié(e), mes émotions semblent envahissantes.',
    ],
    options: [
      { valeur: 1, label: '1 — Presque jamais (0-10 %)' },
      { valeur: 2, label: '2 — Parfois (11-35 %)' },
      { valeur: 3, label: '3 — Environ la moitié du temps (36-65 %)' },
      { valeur: 4, label: '4 — La plupart du temps (66-90 %)' },
      { valeur: 5, label: '5 — Presque toujours (91-100 %)' },
    ],
    // Items inversés (0-indexés) : 0,1,4,5,6,7,9,16,21,33 → score = 6 - réponse
    scoreCalc: (answers) => {
      const inverses = new Set([0, 1, 4, 5, 6, 7, 9, 16, 21, 33]);
      return answers.reduce((sum, a, i) => sum + (inverses.has(i) ? 6 - a : a), 0);
    },
    sousScores: (answers) => {
      const inv = (i) => [0, 1, 4, 5, 6, 7, 9, 16, 21, 33].includes(i) ? 6 - answers[i] : answers[i];
      const sum = (indices) => indices.reduce((s, i) => s + inv(i), 0);
      return {
        nonAcceptation: sum([10, 11, 20, 22, 24, 28]),
        objectifs:      sum([12, 17, 19, 25, 32]),
        impulsivite:    sum([2, 13, 18, 23, 26, 31]),
        conscience:     sum([1, 5, 7, 9, 16, 33]),
        strategies:     sum([14, 15, 21, 27, 29, 30, 34, 35]),
        clarte:         sum([0, 3, 4, 6, 8]),
      };
    },
    severite: (score) => {
      if (score <= 72)  return { label: 'Difficultés faibles de régulation émotionnelle', classe: 'minimal' };
      if (score <= 108) return { label: 'Difficultés modérées de régulation émotionnelle', classe: 'modere' };
      if (score <= 144) return { label: 'Difficultés élevées de régulation émotionnelle', classe: 'severe' };
      return { label: 'Difficultés très élevées de régulation émotionnelle', classe: 'severe' };
    },
  },

  // ── BIS-11 ─────────────────────────────────────────────────────────────────
  BIS11: {
    id: 'BIS11',
    titre: 'BIS-11 — Impulsivité de Barratt',
    description: 'Évaluation de l\'impulsivité comportementale et cognitive',
    consigne: 'Les phrases suivantes décrivent la façon dont vous vous comportez et pensez habituellement. Indiquez dans quelle mesure chaque phrase vous correspond.',
    optionLayout: 'list',
    items: [
      'Je planifie mes tâches avec soin.',
      'Je fais les choses sans y réfléchir.',
      'Je décide rapidement.',
      'Je suis une personne sans soucis.',
      'Je ne fais pas attention.',
      'Mes pensées vont vite.',
      'Je planifie les voyages à l\'avance.',
      'Je me maîtrise.',
      'Je me concentre facilement.',
      'J\'épargne régulièrement.',
      'Je me tortille lors de spectacles ou de conférences.',
      'Je pense soigneusement aux choses.',
      'Je planifie pour avoir un emploi stable.',
      'Je dis des choses sans y réfléchir.',
      'J\'aime penser à des problèmes complexes.',
      'Je change d\'emploi.',
      'J\'agis sur une impulsion.',
      'Je m\'ennuie facilement lorsque je résous des problèmes mentaux.',
      'J\'agis sur le coup du moment.',
      'Je garde la tête sur les épaules.',
      'Je change de domicile.',
      'J\'achète des choses sur une impulsion.',
      'Je ne peux m\'arrêter de penser qu\'à une chose à la fois.',
      'Je change de loisirs.',
      'Je dépense plus que je ne gagne.',
      'Lorsque je réfléchis, des pensées étrangères me viennent.',
      'Je suis plus intéressé(e) par le présent que par l\'avenir.',
      'Je suis agité(e) lors de spectacles ou de conférences.',
      'J\'aime les casse-têtes.',
      'Je pense à l\'avenir.',
    ],
    options: [
      { valeur: 1, label: 'Rarement ou jamais' },
      { valeur: 2, label: 'Parfois' },
      { valeur: 3, label: 'Souvent' },
      { valeur: 4, label: 'Presque toujours ou toujours' },
    ],
    // Items inversés (0-indexés) : 0,3,6,7,8,9,11,12,14,19,22,25,28,29 → score = 5 - réponse
    scoreCalc: (answers) => {
      const inverses = new Set([0, 3, 6, 7, 8, 9, 11, 12, 14, 19, 22, 25, 28, 29]);
      return answers.reduce((sum, a, i) => sum + (inverses.has(i) ? 5 - a : a), 0);
    },
    sousScores: (answers) => {
      const inv = (i) => [0, 3, 6, 7, 8, 9, 11, 12, 14, 19, 22, 25, 28, 29].includes(i) ? 5 - answers[i] : answers[i];
      return {
        score_attentionnel:  [4, 5, 8, 10, 19, 23, 25, 27].reduce((s, i) => s + inv(i), 0),
        score_moteur:        [1, 2, 3, 15, 16, 18, 20, 21, 22, 24].reduce((s, i) => s + inv(i), 0),
        score_planification: [0, 6, 7, 9, 11, 12, 13, 14, 17, 26, 28, 29].reduce((s, i) => s + inv(i), 0),
      };
    },
    severite: (score) => {
      if (score <= 54) return { label: 'Impulsivité faible', classe: 'minimal' };
      if (score <= 75) return { label: 'Impulsivité moyenne', classe: 'modere' };
      return { label: 'Impulsivité élevée', classe: 'severe' };
    },
  },

};

module.exports = QUESTIONNAIRES;
