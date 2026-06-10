(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const ecrans = {
    code:          $('ecran-code'),
    questionnaire: $('ecran-questionnaire'),
    securite:      $('ecran-securite'),
    consentement:  $('ecran-consentement'),
    confirmation:  $('ecran-confirmation'),
  };

  let codeActuel = '';
  let questionnaireActuel = null;
  let alerteSecuriteEnAttente = null;

  function afficher(nom) {
    for (const [k, el] of Object.entries(ecrans)) {
      if (!el) continue;
      el.hidden = k !== nom;
      el.classList.toggle('actif', k === nom);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function setBusy(btn, busy) {
    btn.disabled = busy;
    btn.querySelector('.btn-texte').hidden = busy;
    btn.querySelector('.btn-spinner').hidden = !busy;
  }

  // ── Écran sécurité (BDI-II item 9) ────────────────────────────────────────
  window.passerConfirmation = function () {
    afficher('confirmation');
  };

  // ── Écran 1 : saisie du code ───────────────────────────────────────────────

  $('form-code').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = $('erreur-code');
    errEl.textContent = '';

    const code = $('input-code').value.trim().toUpperCase();
    if (code.length < 4) {
      errEl.textContent = "Veuillez saisir votre code d'accès.";
      return;
    }

    const btn = $('btn-valider');
    setBusy(btn, true);

    try {
      const res = await fetch('/api/valider-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (!res.ok) {
        errEl.textContent = data.erreur || 'Erreur inconnue.';
        return;
      }

      codeActuel = code;
      questionnaireActuel = data;
      if (data.consentementDonne) {
        afficherQuestionnaire(data);
        afficher('questionnaire');
      } else {
        afficher('consentement');
      }
    } catch {
      errEl.textContent = 'Impossible de contacter le serveur. Vérifiez votre connexion.';
    } finally {
      setBusy(btn, false);
    }
  });

  // ── Écran 2 : questionnaire ────────────────────────────────────────────────

  function afficherQuestionnaire(q) {
    // Progression
    const progressEl = $('q-progress');
    if (q.total > 1) {
      progressEl.textContent = `Questionnaire ${q.indexActuel + 1} / ${q.total}`;
      progressEl.hidden = false;
    } else {
      progressEl.hidden = true;
    }

    $('q-titre').textContent = q.titre;
    $('q-description').textContent = q.description;

    // Consigne spécifique
    const consigneEl = $('q-consigne');
    const instructionEl = document.querySelector('.instruction');
    if (q.consigne) {
      consigneEl.textContent = q.consigne;
      consigneEl.hidden = false;
      if (instructionEl) instructionEl.hidden = true;
    } else {
      consigneEl.hidden = true;
      if (instructionEl) instructionEl.hidden = false;
    }

    // Message intro
    const introEl = $('q-intro');
    if (q.intro) {
      introEl.textContent = q.intro;
      introEl.hidden = false;
    } else {
      introEl.hidden = true;
    }

    // Libellé du bouton selon s'il reste des questionnaires après
    const btnTexte = $('btn-soumettre').querySelector('.btn-texte');
    const estDernier = q.total <= 1 || q.indexActuel >= q.total - 1;
    btnTexte.textContent = estDernier ? 'Envoyer mes réponses' : 'Questionnaire suivant →';

    const liste = $('liste-items');
    liste.innerHTML = '';

    if (q.optionLayout === 'paires') {
      afficherPaires(q, liste);
    } else {
      afficherItems(q, liste);
    }
  }

  // Rendu standard
  function afficherItems(q, liste) {
    q.items.forEach((texte, i) => {
      const opts = q.itemOptions ? q.itemOptions[i] : q.options;
      const isList = q.optionLayout === 'list';

      const li = document.createElement('li');
      li.className = 'item-question';
      li.dataset.index = i;

      const optionsHtml = opts.map(opt => `
        <label class="option-label${isList ? ' option-label-list' : ''}">
          <input type="radio" name="q${i}" value="${opt.valeur}" required>
          <span>${opt.label}</span>
        </label>
      `).join('');

      li.innerHTML = `
        <p class="item-numero">Question ${i + 1} / ${q.items.length}</p>
        <p class="item-texte">${texte}</p>
        <div class="item-options${isList ? ' item-options-list' : ''}">${optionsHtml}</div>
      `;
      liste.appendChild(li);
    });
  }

  // Rendu paires (LSAS)
  function afficherPaires(q, liste) {
    q.situations.forEach((situation, i) => {
      const li = document.createElement('li');
      li.className = 'item-paire';
      li.dataset.index = i;

      const optAnxHtml = q.optionsAnxiete.map(opt => `
        <label class="option-label option-label-list">
          <input type="radio" name="qa${i}" value="${opt.valeur}" required>
          <span>${opt.label}</span>
        </label>
      `).join('');

      const optEvitHtml = q.optionsEvitement.map(opt => `
        <label class="option-label option-label-list">
          <input type="radio" name="qe${i}" value="${opt.valeur}" required>
          <span>${opt.label}</span>
        </label>
      `).join('');

      li.innerHTML = `
        <p class="item-numero">Situation ${i + 1} / ${q.situations.length}</p>
        <p class="item-texte">${situation}</p>
        <div class="paire-sous-question">
          <p class="paire-label">Anxiété / Peur</p>
          <div class="item-options item-options-list">${optAnxHtml}</div>
        </div>
        <div class="paire-sous-question">
          <p class="paire-label">Évitement</p>
          <div class="item-options item-options-list">${optEvitHtml}</div>
        </div>
      `;
      liste.appendChild(li);
    });
  }

  // ── Soumission du questionnaire ────────────────────────────────────────────

  $('form-questionnaire').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = $('erreur-questionnaire');
    errEl.textContent = '';

    const answers = [];
    let manquant = false;

    if (questionnaireActuel && questionnaireActuel.optionLayout === 'paires') {
      document.querySelectorAll('.item-paire').forEach((bloc, i) => {
        bloc.classList.remove('non-repondu');
        const anx  = bloc.querySelector(`input[name="qa${i}"]:checked`);
        const evit = bloc.querySelector(`input[name="qe${i}"]:checked`);
        if (!anx || !evit) {
          bloc.classList.add('non-repondu');
          manquant = true;
        } else {
          answers.push(parseInt(anx.value, 10));
          answers.push(parseInt(evit.value, 10));
        }
      });
    } else {
      document.querySelectorAll('.item-question').forEach(item => {
        item.classList.remove('non-repondu');
        const checked = item.querySelector('input[type="radio"]:checked');
        if (!checked) {
          item.classList.add('non-repondu');
          manquant = true;
        } else {
          answers.push(parseInt(checked.value, 10));
        }
      });
    }

    if (manquant) {
      errEl.textContent = 'Veuillez répondre à toutes les questions.';
      const premier = document.querySelector('.item-question.non-repondu, .item-paire.non-repondu');
      premier?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const btn = $('btn-soumettre');
    setBusy(btn, true);

    try {
      const res = await fetch('/api/soumettre', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeActuel, answers }),
      });
      const data = await res.json();

      if (!res.ok) {
        errEl.textContent = data.erreur || "Erreur lors de l'envoi.";
        return;
      }

      // Alerte sécurité éventuelle — mise en attente si un suivant arrive
      if (data.alerteSecurite) {
        alerteSecuriteEnAttente = data.alerteSecurite;
      }

      if (!data.termine && data.suivant) {
        // Passer au questionnaire suivant
        questionnaireActuel = data.suivant;
        afficherQuestionnaire(data.suivant);
        afficher('questionnaire');
        // Afficher l'alerte en haut de la page si nécessaire (non bloquant)
        if (alerteSecuriteEnAttente) {
          const msgEl = $('securite-message');
          if (msgEl) msgEl.textContent = alerteSecuriteEnAttente;
          alerteSecuriteEnAttente = null;
          // On laisse le patient finir les autres questionnaires
        }
        return;
      }

      // Tous les questionnaires terminés
      const outroEl = $('confirmation-outro');
      if (outroEl) {
        outroEl.textContent = data.outro || questionnaireActuel?.outro || 'Vous pouvez fermer cette page.';
      }

      const alerte = alerteSecuriteEnAttente || data.alerteSecurite;
      alerteSecuriteEnAttente = null;

      if (alerte) {
        const msgEl = $('securite-message');
        if (msgEl) msgEl.textContent = alerte;
        afficher('securite');
      } else {
        afficher('confirmation');
      }
    } catch {
      errEl.textContent = 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.';
    } finally {
      setBusy(btn, false);
    }
  });

  // ── Écran 1b : consentement RGPD ──────────────────────────────────────────

  $('checkbox-consent').addEventListener('change', e => {
    $('btn-consentir').disabled = !e.target.checked;
  });

  $('form-consentement').addEventListener('submit', async e => {
    e.preventDefault();
    const errEl = $('erreur-consentement');
    errEl.textContent = '';

    if (!$('checkbox-consent').checked) {
      errEl.textContent = 'Veuillez cocher la case pour continuer.';
      return;
    }

    const btn = $('btn-consentir');
    setBusy(btn, true);

    try {
      const res = await fetch('/api/consentement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeActuel, timestamp: new Date().toISOString() }),
      });
      const data = await res.json();

      if (!res.ok) {
        errEl.textContent = data.erreur || "Erreur lors de l'enregistrement du consentement.";
        return;
      }

      afficherQuestionnaire(questionnaireActuel);
      afficher('questionnaire');
    } catch {
      errEl.textContent = 'Impossible de contacter le serveur. Vérifiez votre connexion.';
    } finally {
      setBusy(btn, false);
    }
  });

})();
