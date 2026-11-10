/**
 * PixPilot - Pix Question Extractor
 * Extrait automatiquement le texte de la question, les propositions, les formulaires,
 * les images et les liens de téléchargement de l'interface Pix.
 */

const PixExtractor = {
  /**
   * Scanne le DOM de la page Pix active et retourne une structure complète de la question
   */
  async extractCurrentChallenge() {
    const result = {
      title: '',
      instructions: '',
      fullText: '',
      questionType: 'inconnu', // 'qcm-unique', 'qcm-multiple', 'text-input', 'association', etc.
      options: [],
      inputs: [],
      downloadLinks: [],
      images: [],
      timestamp: new Date().toISOString()
    };

    // 1. Ciblage du conteneur de la question Pix
    // Sélecteurs courants utilisés par Pix (Ember.js, BEM, test-ids ou balises sémantiques)
    const containerSelectors = [
      '[data-test="challenge-content"]',
      '[data-test="question-body"]',
      '.pix-challenge',
      '.c-challenge',
      '.c-challenge-content',
      '.question__body',
      '.challenge-statement',
      'main',
      'article',
      '#main-content'
    ];

    let container = null;
    for (const sel of containerSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 20) {
        container = el;
        break;
      }
    }

    if (!container) {
      container = document.body;
    }

    // 2. Extraction du texte de la question / instructions
    const headings = container.querySelectorAll('h1, h2, h3, h4, .c-challenge__title, .question-title');
    if (headings.length > 0) {
      result.title = Array.from(headings).map(h => h.innerText.trim()).filter(Boolean).join(' - ');
    }

    // Paragraphes et énoncés
    const paragraphs = container.querySelectorAll('p, .c-challenge__instruction, .instruction, .statement, blockquote');
    const textPieces = [];
    paragraphs.forEach(p => {
      const t = p.innerText.trim();
      if (t && !textPieces.includes(t)) {
        textPieces.push(t);
      }
    });

    if (textPieces.length > 0) {
      result.instructions = textPieces.join('\n\n');
    } else {
      result.instructions = container.innerText.slice(0, 2000).trim();
    }

    // 3. Extraction des Choix Multiples (Checkboxes & Radios)
    const radioInputs = container.querySelectorAll('input[type="radio"]');
    const checkInputs = container.querySelectorAll('input[type="checkbox"]');

    if (radioInputs.length > 0) {
      result.questionType = 'qcm-unique';
      radioInputs.forEach((input, idx) => {
        const label = this.findLabelForInput(input) || `Option ${idx + 1}`;
        result.options.push({
          type: 'radio',
          text: label,
          name: input.name || '',
          id: input.id || '',
          value: input.value || ''
        });
      });
    } else if (checkInputs.length > 0) {
      result.questionType = 'qcm-multiple';
      checkInputs.forEach((input, idx) => {
        const label = this.findLabelForInput(input) || `Option ${idx + 1}`;
        result.options.push({
          type: 'checkbox',
          text: label,
          name: input.name || '',
          id: input.id || '',
          value: input.value || ''
        });
      });
    }

    // 4. Extraction des champs textes et zones de saisie
    const textInputs = container.querySelectorAll('input[type="text"], input[type="number"], textarea');
    textInputs.forEach((inp, idx) => {
      // Ignorer les inputs de notre propre extension
      if (inp.closest('#pixpilot-root')) return;

      const label = this.findLabelForInput(inp) || inp.placeholder || `Champ ${idx + 1}`;
      result.inputs.push({
        type: inp.type || 'text',
        placeholder: inp.placeholder || '',
        label: label,
        value: inp.value || ''
      });
    });

    // 5. Liens de téléchargement (Fichiers joints par Pix pour l'exercice)
    const links = container.querySelectorAll('a[href]');
    links.forEach(a => {
      if (a.closest('#pixpilot-root')) return;
      const href = a.getAttribute('href');
      const text = a.innerText.trim();
      const extMatch = href.match(/\.(xlsx|xls|csv|ods|docx|doc|pdf|txt|png|jpg|jpeg|zip)($|\?)/i);
      
      if (extMatch || a.hasAttribute('download') || href.includes('attachment') || href.includes('download')) {
        result.downloadLinks.push({
          url: a.href,
          name: text || href.split('/').pop().split('?')[0] || 'fichier-joint',
          extension: extMatch ? extMatch[1].toLowerCase() : 'inconnu'
        });
      }
    });

    // 6. Images incluses dans l'exercice
    const images = container.querySelectorAll('img[src]');
    for (const img of images) {
      if (img.closest('#pixpilot-root')) continue;
      // Filtrer les minuscules icônes
      if (img.width > 50 && img.height > 50 || img.src.includes('challenge') || img.src.includes('pix')) {
        try {
          const base64Data = await this.imageToBase64(img);
          if (base64Data) {
            result.images.push({
              src: img.src,
              alt: img.alt || 'Image de l\'épreuve Pix',
              inlineData: base64Data
            });
          }
        } catch (e) {
          console.warn('Impossible de convertir l\'image Pix en base64:', e);
        }
      }
    }

    // Synthèse du prompt
    result.fullText = this.formatAsPromptText(result);
    return result;
  },

  /**
   * Trouve le texte du label associé à un élément de formulaire
   */
  findLabelForInput(input) {
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label && label.innerText.trim()) return label.innerText.trim();
    }
    const parentLabel = input.closest('label');
    if (parentLabel && parentLabel.innerText.trim()) return parentLabel.innerText.trim();

    const parentWrapper = input.closest('.pix-choice, .c-choice, .form-check, .checkbox, .radio, li, div');
    if (parentWrapper && parentWrapper.innerText.trim()) {
      return parentWrapper.innerText.trim();
    }
    return '';
  },

  /**
   * Convertit une balise <img> en objet base64 inlineData pour Gemini
   */
  imageToBase64(img) {
    return new Promise((resolve) => {
      try {
        if (img.src.startsWith('data:image')) {
          const mimeMatch = img.src.match(/data:(image\/[a-zA-Z]+);base64,(.+)/);
          if (mimeMatch) {
            return resolve({ mimeType: mimeMatch[1], data: mimeMatch[2] });
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || img.width || 300;
        canvas.height = img.naturalHeight || img.height || 200;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/png');
        const b64 = dataUrl.split(',')[1];
        resolve({ mimeType: 'image/png', data: b64 });
      } catch (e) {
        // En cas d'erreur CORS sur le canvas
        resolve(null);
      }
    });
  },

  /**
   * Formate les informations extraites sous forme de prompt clair pour Gemini
   */
  formatAsPromptText(extracted) {
    let text = `[ÉPREUVE PIX EXTRAITE DU DOM]\n`;
    if (extracted.title) {
      text += `Titre: ${extracted.title}\n\n`;
    }
    text += `Énoncé / Consigne :\n${extracted.instructions}\n\n`;

    if (extracted.options.length > 0) {
      text += `Type de question : ${extracted.questionType === 'qcm-multiple' ? 'CHOIX MULTIPLES (plusieurs réponses possibles !)' : 'CHOIX UNIQUE'}\n`;
      text += `Propositions de réponse :\n`;
      extracted.options.forEach((opt, idx) => {
        text += `- [ ] ${opt.text}\n`;
      });
      text += `\n`;
    }

    if (extracted.inputs.length > 0) {
      text += `Champs à remplir attendus :\n`;
      extracted.inputs.forEach(inp => {
        text += `- Champ: "${inp.label}" (type: ${inp.type}, placeholder: "${inp.placeholder}")\n`;
      });
      text += `\n`;
    }

    if (extracted.downloadLinks.length > 0) {
      text += `Fichiers joints détectés dans la question Pix :\n`;
      extracted.downloadLinks.forEach(dl => {
        text += `- ${dl.name} (${dl.url})\n`;
      });
      text += `(Note : Si l'analyse nécessite ce fichier, l'utilisateur peut le glisser-déposer dans l'assistant).\n\n`;
    }

    return text;
  },

  /**
   * Applique et coche automatiquement les réponses détectées sur l'interface de Pix
   * Supporte les cases à cocher, les boutons radios et les champs textes.
   * @param {Array<string>} answers - Liste des réponses textuelles à appliquer
   * @returns {number} Nombre d'éléments cochés / remplis
   */
  autoApplyAnswers(answers) {
    if (!answers || answers.length === 0) return 0;

    let appliedCount = 0;
    const normalize = (str) => (str || '').toLowerCase().replace(/[^a-z0-9àâéèêëîïôùûç]/gi, ' ').replace(/\s+/g, ' ').trim();
    const normalizedAnswers = answers.map(normalize).filter(Boolean);

    // 1. Boutons Radios & Cases à cocher
    const choiceInputs = document.querySelectorAll('input[type="checkbox"], input[type="radio"]');
    choiceInputs.forEach(input => {
      if (input.closest('#pixpilot-root')) return;

      const labelText = this.findLabelForInput(input);
      const normLabel = normalize(labelText);
      if (!normLabel) return;

      // Vérifier correspondance
      const isMatch = normalizedAnswers.some(ans => {
        if (ans.length > 4 && (normLabel.includes(ans) || ans.includes(normLabel))) return true;
        // Correspondance par mots clés
        const words = ans.split(' ').filter(w => w.length > 3);
        if (words.length > 0) {
          const matchCount = words.filter(w => normLabel.includes(w)).length;
          if (matchCount / words.length >= 0.65) return true;
        }
        return false;
      });

      if (isMatch) {
        if (!input.checked) {
          input.checked = true;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          appliedCount++;
        }

        // Effet visuel épuré (vert émeraude doux, pas de néon)
        const wrapper = input.closest('label') || input.closest('.choice-item') || input.parentElement;
        if (wrapper) {
          wrapper.style.transition = 'outline 0.25s ease, background-color 0.25s ease';
          wrapper.style.outline = '2px solid #10b981';
          wrapper.style.backgroundColor = 'rgba(16, 185, 129, 0.06)';
        }
      }
    });

    // 2. Champs de saisie texte ou nombre (si réponse unique à remplir)
    if (appliedCount === 0 && answers.length === 1) {
      const textInputs = document.querySelectorAll('input[type="text"], input[type="number"]');
      for (const inp of textInputs) {
        if (inp.closest('#pixpilot-root')) continue;
        inp.value = answers[0];
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        inp.dispatchEvent(new Event('change', { bubbles: true }));
        inp.style.transition = 'outline 0.25s ease';
        inp.style.outline = '2px solid #10b981';
        appliedCount++;
        break;
      }
    }

    return appliedCount;
  }
};

// Export
if (typeof window !== 'undefined') {
  window.PixExtractor = PixExtractor;
}

