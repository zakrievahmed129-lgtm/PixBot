/**
 * PixPilot - Pix Question Extractor & Auto-Filler
 * Extrait la question, les QCM, les menus déroulants (<select> & custom),
 * les zones de saisie (texte, nombre, textarea, contenteditable) et les boutons de choix,
 * puis applique automatiquement les réponses compatibles avec Ember.js / React.
 */

const PixExtractor = {
  // Boutons système de Pix à ignorer lors de la détection ou du clic automatique
  SYSTEM_BUTTON_PATTERNS: /^(valider|passer|j'ai terminé|continuer|abandonner|retour|fermer|envoyer|indice|aide|suivant|précédent|ok|annuler|réessayer|recommencer|voir la correction)$/i,
  CHROME_EXCLUSION_SELECTOR: '#pixpilot-root, .assessment-banner, [role="complementary"], .feedback-panel, .challenge-statement__attachments-section',

  _sendBgMessage(payload, timeoutMs = 15000) {
    let canSend = false;
    try {
      canSend = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id && chrome.runtime?.sendMessage);
    } catch (_) {
      canSend = false;
    }
    if (!canSend) {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          console.warn('[PixPilot] Timeout message background:', payload?.action);
          resolve(null);
        }
      }, timeoutMs);
      try {
        chrome.runtime.sendMessage(payload, (res) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          let lastErr = null;
          try { lastErr = chrome.runtime?.lastError; } catch (_) {}
          if (lastErr) {
            console.warn('[PixPilot] runtime.lastError:', lastErr.message);
            resolve(null);
            return;
          }
          resolve(res || null);
        });
      } catch (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          console.warn('[PixPilot] sendMessage error:', err);
          resolve(null);
        }
      }
    });
  },

  /**
   * Retourne les documents accessibles (document principal + iframes same-origin d'exercices Pix)
   */
  getChallengeRoots() {
    const roots = [document];
    const iframes = document.querySelectorAll('iframe');
    iframes.forEach(iframe => {
      if (iframe.closest('#pixpilot-root')) return;
      try {
        if (iframe.contentDocument && iframe.contentDocument.body) {
          roots.push(iframe.contentDocument);
        }
      } catch (_) { }
    });
    return roots;
  },

  /**
   * Trouve le conteneur global de l'épreuve Pix (énoncé + zone de réponse incluse !)
   * Priorise article.challenge-item / .challenge__display avant <main> pour exclure la bannière de progression.
   */
  findMainContainer(doc = document) {
    const containerSelectors = [
      'article.challenge-item',
      '.challenge__display',
      '.pix-challenge-card',
      '.pix-challenge',
      '.c-challenge',
      'article',
      'main',
      '#main-content'
    ];

    for (const sel of containerSelectors) {
      const el = doc.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 10) {
        return el;
      }
    }
    return doc.body;
  },

  /**
   * Détecte si un bouton radio sert uniquement à choisir le format de fichier Pix ("fichier .xlsx" / "fichier .ods")
   * et NON à répondre au quiz.
   */
  isFileFormatSelector(input, labelText = '') {
    if (!input) return false;
    if (input.name === 'attachment_selector' || input.classList?.contains('challenge-statement__file-option_input')) return true;
    if (input.closest?.('.challenge-statement__file-options, .challenge-statement__attachments-section')) return true;
    const t = (labelText || '').trim();
    if (/^fichier\s*\.[a-z0-9]{2,5}$/i.test(t)) return true;
    if (/^\.(xlsx|xls|ods|docx|doc|odt|csv|pdf|zip)$/i.test(t)) return true;
    const parentText = (input.closest('fieldset, .challenge-statement__file, div')?.innerText || '').toLowerCase();
    if (parentText.includes('choisissez le type de fichier') && /fichier\s*\./i.test(t)) return true;
    return false;
  },

  /**
   * Vérifie si un élément est visible et interactif (y compris vis-à-vis de ses ancêtres et dans son document/iframe)
   */
  isInteractable(el) {
    if (!el || el.closest('#pixpilot-root')) return false;
    if (el.disabled || el.hidden || el.getAttribute('aria-hidden') === 'true') return false;
    const doc = el.ownerDocument || document;
    const win = doc.defaultView || window;
    let cur = el;
    while (cur && cur.nodeType === 1) {
      if (cur.hidden || cur.getAttribute?.('aria-hidden') === 'true') return false;
      const style = win.getComputedStyle(cur);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (cur === doc.body || cur === doc.documentElement) break;
      cur = cur.parentElement;
    }
    return true;
  },

  /**
   * Retourne une empreinte unique de la question Pix courante (pour détecter les changements en SPA)
   */
  getChallengeSignature() {
    const challengeEl = document.querySelector('[data-challenge-id]');
    const cid = challengeEl ? challengeEl.getAttribute('data-challenge-id') : '';
    return `${location.pathname}|${cid}`;
  },

  /**
   * Extrait le contexte lisible d'une page web quelconque pour le mode Chat quotidien
   */
  extractPageContext(maxTextChars = 11000) {
    let selection = '';
    try {
      selection = (window.getSelection?.()?.toString() || '').trim().slice(0, 4000);
    } catch (_) {}

    const title = (document.title || '').trim();
    const url = location.href;

    const mainTarget =
      document.querySelector('article, main, [role="main"], .markdown-body, #mw-content-text, #content') ||
      document.body;

    let text = '';
    if (mainTarget) {
      try {
        const clone = mainTarget.cloneNode(true);
        clone.querySelectorAll('#pixpilot-root, script, style, noscript, svg, template, nav, header, footer, aside, [aria-hidden="true"]').forEach(el => el.remove());
        text = (clone.innerText || clone.textContent || '')
          .replace(/\r/g, '')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n')
          .trim()
          .slice(0, maxTextChars);
      } catch (_) {
        text = (mainTarget.innerText || '').trim().slice(0, maxTextChars);
      }
    }

    return { title, url, selection, text };
  },

  /**
   * Scanne le DOM de la page Pix active et retourne une structure complète de la question
   */
  async extractCurrentChallenge() {
    const result = {
      title: '',
      instructions: '',
      fullText: '',
      questionType: 'inconnu',
      options: [],
      selects: [],
      inputs: [],
      buttons: [],
      downloadLinks: [],
      statementLinks: [],
      codeBlocks: [],
      images: [],
      failedImageCount: 0,
      timestamp: new Date().toISOString()
    };

    const roots = this.getChallengeRoots();
    const container = this.findMainContainer(document);

    // 1. Titre & Énoncé (sans dupliquer les labels d'options QCM)
    const headings = container.querySelectorAll('h1, h2, h3, h4, .c-challenge__title, .question-title');
    if (headings.length > 0) {
      result.title = Array.from(headings)
        .filter(h => !h.closest(this.CHROME_EXCLUSION_SELECTOR))
        .map(h => h.innerText.trim())
        .filter(Boolean)
        .join(' - ');
    }

    const paragraphs = container.querySelectorAll('p, .c-challenge__instruction, .instruction, .statement, blockquote, li, .challenge-statement-instruction__text');
    const textPieces = [];
    paragraphs.forEach(p => {
      if (p.closest(this.CHROME_EXCLUSION_SELECTOR)) return;
      if (p.closest('.choices-list, .qcm-panel__proposals, .qcu-panel__proposals, .pix-select')) return;
      if (p.querySelector('input[type="radio"], input[type="checkbox"]')) return;
      const t = (p.innerText || '').trim();
      if (t && t.length > 2 && !textPieces.includes(t)) {
        textPieces.push(t);
      }
    });

    // Blocs de code / extraits techniques (HTML, SQL, Python, formules, logs)
    container.querySelectorAll('pre').forEach(pre => {
      if (pre.closest(this.CHROME_EXCLUSION_SELECTOR)) return;
      const code = (pre.innerText || pre.textContent || '').trim();
      if (code && code.length > 2 && !result.codeBlocks.includes(code)) {
        result.codeBlocks.push(code.slice(0, 3000));
      }
    });

    // Liens dans l'énoncé (crucial pour les épreuves Pix phishing / vérification d'URL)
    container.querySelectorAll('a[href]').forEach(a => {
      if (a.closest(this.CHROME_EXCLUSION_SELECTOR)) return;
      const rawHref = a.getAttribute('href') || '';
      if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) return;
      if (a.hasAttribute('download') || a.classList.contains('challenge-statement__action-link')) return;
      const txt = (a.innerText || '').trim();
      if (/besoin d'aide|ouvrir,\s*modifier|tutoriel|support\.pix/i.test(txt + ' ' + rawHref)) return;
      try {
        const resolved = new URL(rawHref, window.location.href).href;
        const entry = txt ? `"${txt}" -> ${resolved}` : resolved;
        if (!result.statementLinks.includes(entry)) {
          result.statementLinks.push(entry);
        }
      } catch (_) {}
    });

    if (textPieces.length > 0) {
      result.instructions = textPieces.join('\n');
    } else {
      result.instructions = container.innerText.slice(0, 2500).trim();
    }

    for (const doc of roots) {
      const rootContainer = doc === document ? container : doc.body;

      // 2. Extraction des Choix Multiples (Radios, Checkboxes & équivalents ARIA)
      const radioInputs = Array.from(rootContainer.querySelectorAll('input[type="radio"], [role="radio"]')).filter(inp => {
        if (!this.isInteractable(inp)) return false;
        const lbl = this.findLabelForInput(inp);
        return !this.isFileFormatSelector(inp, lbl);
      });
      const checkInputs = Array.from(rootContainer.querySelectorAll('input[type="checkbox"], [role="checkbox"]')).filter(inp => {
        if (!this.isInteractable(inp)) return false;
        const lbl = this.findLabelForInput(inp);
        return !this.isFileFormatSelector(inp, lbl);
      });

      if (radioInputs.length > 0) {
        result.questionType = 'qcm-unique';
        radioInputs.forEach((input, idx) => {
          const label = this.findLabelForInput(input) || `Option ${idx + 1}`;
          if (!result.options.some(o => o.text === label)) {
            result.options.push({ type: 'radio', text: label });
          }
        });
      }

      if (checkInputs.length > 0) {
        result.questionType = 'qcm-multiple';
        checkInputs.forEach((input, idx) => {
          const label = this.findLabelForInput(input) || `Option ${idx + 1}`;
          if (!result.options.some(o => o.text === label)) {
            result.options.push({ type: 'checkbox', text: label });
          }
        });
      }

      // 3. Extraction des Menus Déroulants (<select> natifs, <PixSelect> Nebulix & menus personnalisés)
      const selectElements = rootContainer.querySelectorAll('select');
      selectElements.forEach((sel, idx) => {
        if (!this.isInteractable(sel)) return;
        const label = this.findLabelForInput(sel) || `Menu déroulant #${idx + 1}`;
        const choices = Array.from(sel.options)
          .filter(opt => !opt.disabled && opt.value !== '' && !/^(choisissez|sélectionnez|--|select)/i.test(opt.text.trim()))
          .map(opt => opt.text.trim())
          .filter(Boolean);

        result.selects.push({
          label,
          options: choices.length > 0 ? choices : Array.from(sel.options).map(o => o.text.trim()).filter(Boolean)
        });
      });

      // Composant officiel <PixSelect> (@1024pix/nebulix-ember) dont les options <li role="option"> sont déjà dans le DOM
      const pixSelects = rootContainer.querySelectorAll('.pix-select');
      pixSelects.forEach((pixSel, idx) => {
        if (pixSel.closest('#pixpilot-root')) return;
        const btn = pixSel.querySelector('.pix-select-button') || pixSel;
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
        const label = this.findLabelForInput(btn) || pixSel.querySelector('.pix-label')?.innerText?.trim() || `Menu #${result.selects.length + idx + 1}`;
        const placeholder = pixSel.querySelector('.pix-select-button__text')?.innerText?.trim() || '';
        const opts = Array.from(pixSel.querySelectorAll('.pix-select-list-category__option, [role="option"]'))
          .map(li => (li.getAttribute('title') || li.innerText || li.textContent || '').trim())
          .filter(txt => txt && txt !== placeholder && !/^(choisissez|sélectionnez|--|select)/i.test(txt));
        if (opts.length > 0) {
          result.selects.push({ label, options: opts });
        }
      });

      // Autres menus déroulants personnalisés (Ember Power Select, ARIA combobox/listbox)
      const customDropdowns = rootContainer.querySelectorAll('.ember-power-select-trigger, [role="combobox"], [aria-haspopup="listbox"]');
      customDropdowns.forEach((trigger, idx) => {
        if (!this.isInteractable(trigger) || trigger.tagName === 'SELECT' || trigger.closest('.pix-select')) return;
        const label = this.findLabelForInput(trigger) || `Menu #${result.selects.length + idx + 1}`;
        const controlledId = trigger.getAttribute('aria-controls') || trigger.getAttribute('aria-owns');
        const controlledEl = controlledId ? doc.getElementById(controlledId) : null;
        const optionScope = controlledEl || trigger.closest('.ember-power-select, .pix-select, .dropdown, [class*="select"]') || doc;
        const visibleOpts = Array.from(optionScope.querySelectorAll('[role="option"], .ember-power-select-option'))
          .filter(o => !o.closest('.pix-select'))
          .map(o => o.innerText.trim())
          .filter(Boolean);
        result.selects.push({
          label,
          options: visibleOpts
        });
      });

      // 4. Extraction de toutes les zones de saisie (PixInput, QROC, QROCM, input, textarea, contenteditable)
      const textInputs = this.getAllTextInputs(rootContainer);
      textInputs.forEach((inp, idx) => {
        const label = this.findLabelForInput(inp) || inp.placeholder || `Champ #${idx + 1}`;
        result.inputs.push({
          type: inp.getAttribute?.('type') || (inp.tagName === 'TEXTAREA' ? 'textarea' : 'text'),
          placeholder: inp.placeholder || '',
          label: label
        });
      });

      // 5. Extraction des boutons de choix / propositions cliquables
      const choiceButtons = this.getChoiceButtons(rootContainer);
      choiceButtons.forEach(btn => {
        const text = (btn.innerText || btn.value || btn.getAttribute('aria-label') || '').trim();
        if (text && text.length < 150 && !result.buttons.includes(text)) {
          result.buttons.push(text);
        }
      });

      if (result.questionType === 'inconnu') {
        if (result.selects.length > 0) result.questionType = 'selects';
        else if (result.inputs.length > 0) result.questionType = 'inputs';
        else if (result.buttons.length > 0) result.questionType = 'buttons';
      }

      // 6. Liens et boutons de téléchargement Pix (radios attachment_selector + lien .challenge-statement__action-link)
      const addDownloadUrl = (rawUrl, fallbackExt = '') => {
        if (!rawUrl || rawUrl.startsWith('#') || rawUrl.startsWith('javascript:')) return;
        try {
          const fullUrl = new URL(rawUrl, doc.location?.href || window.location.href).href;
          if (/besoin d'aide|ouvrir,\s*modifier|tutoriel|support\.pix/i.test(fullUrl)) return;
          if (result.downloadLinks.some(d => d.url === fullUrl)) return;

          const extMatch = fullUrl.match(/\.(xlsx|xls|csv|ods|docx|doc|odt|pdf|txt|zip)($|\?)/i);
          const ext = (extMatch && extMatch[1]) ? extMatch[1].toLowerCase() : (fallbackExt || 'xlsx');
          const cleanName = fullUrl.split('/').pop().split('?')[0] || 'exercice_pix';
          const name = ext && !cleanName.toLowerCase().endsWith(`.${ext}`) ? `${cleanName}.${ext}` : cleanName;

          result.downloadLinks.push({ url: fullUrl, name, ext });
        } catch (_) { }
      };

      // A. Radios officiels Pix : <input class="challenge-statement__file-option_input" name="attachment_selector" value="{{attachmentUrl}}">
      const attachmentRadios = Array.from(rootContainer.querySelectorAll('input[name="attachment_selector"], input.challenge-statement__file-option_input'));
      // Prioriser .xlsx / .docx / .csv / .zip avant .ods / .odt
      attachmentRadios.sort((a, b) => {
        const aPref = /\.(xlsx|docx|csv|zip)($|\?)/i.test(a.value || '') ? 0 : 1;
        const bPref = /\.(xlsx|docx|csv|zip)($|\?)/i.test(b.value || '') ? 0 : 1;
        return aPref - bPref;
      });
      attachmentRadios.forEach(r => {
        if (r.value && /^https?:\/\/|^\//i.test(r.value.trim())) {
          const lbl = this.findLabelForInput(r);
          const lblExt = lbl.match(/\.(xlsx|ods|docx|odt|csv|zip|pdf)/i)?.[1]?.toLowerCase() || '';
          addDownloadUrl(r.value.trim(), lblExt);
        }
      });

      // B. Liens <a href> (notamment a.challenge-statement__action-link)
      const links = rootContainer.querySelectorAll('a[href]');
      links.forEach(a => {
        if (a.closest('#pixpilot-root')) return;
        const href = a.getAttribute('href') || '';
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
        const text = (a.innerText || '').trim();
        if (/besoin d'aide|ouvrir,\s*modifier|tutoriel|support\.pix/i.test(text + ' ' + href)) return;

        const extMatch = href.match(/\.(xlsx|xls|csv|ods|docx|doc|odt|pdf|txt|png|jpg|jpeg|zip)($|\?)/i);
        const isDownloadBtn = /^t[eé]l[eé]charger/i.test(text) || a.hasAttribute('download') || a.classList.contains('challenge-statement__action-link') || /download|attachment|telecharger/i.test(href + ' ' + a.className);

        if (extMatch || isDownloadBtn) {
          const checkedFormatRadio = rootContainer.querySelector('input[name="attachment_selector"]:checked, input.challenge-statement__file-option_input:checked');
          const checkedFormatLabel = checkedFormatRadio ? this.findLabelForInput(checkedFormatRadio) : '';
          const radioExt = checkedFormatLabel.match(/\.(xlsx|ods|docx|odt|csv|zip|pdf)/i)?.[1]?.toLowerCase() || '';
          addDownloadUrl(a.href, radioExt);
        }
      });

      // C. Boutons avec data-url ou data-href
      const customActionBtns = rootContainer.querySelectorAll('button, [role="button"], [data-url], [data-href], [data-src]');
      customActionBtns.forEach(btn => {
        if (btn.closest('#pixpilot-root')) return;
        const attrUrl = btn.getAttribute('data-href') || btn.getAttribute('data-url') || btn.getAttribute('data-src') || btn.getAttribute('data-download-url');
        if (attrUrl) addDownloadUrl(attrUrl);
      });

      // 7. Images de l'exercice
      const images = rootContainer.querySelectorAll('img[src]');
      for (const img of images) {
        if (img.closest('#pixpilot-root')) continue;
        if ((img.width > 45 && img.height > 45) || img.src.includes('challenge') || img.src.includes('pix')) {
          try {
            const base64Data = await this.imageToBase64(img);
            if (base64Data) {
              result.images.push({
                src: img.src,
                alt: img.alt || 'Image Pix',
                inlineData: base64Data
              });
            } else {
              result.failedImageCount++;
            }
          } catch (err) {
            result.failedImageCount++;
            console.warn('[PixPilot] image extraction warning:', err);
          }
        }
      }
    }

    // Filet de sécurité : recherche globale de fichiers Pix si non trouvés dans le conteneur principal
    if (result.downloadLinks.length === 0) {
      document.querySelectorAll('input[name="attachment_selector"], input.challenge-statement__file-option_input').forEach(r => {
        if (r.value && /^https?:\/\/|^\//i.test(r.value.trim())) {
          const lbl = this.findLabelForInput(r);
          const lblExt = lbl.match(/\.(xlsx|ods|docx|odt|csv|zip|pdf)/i)?.[1]?.toLowerCase() || '';
          try {
            const fullUrl = new URL(r.value.trim(), window.location.href).href;
            if (!result.downloadLinks.some(d => d.url === fullUrl)) {
              const ext = lblExt || 'xlsx';
              result.downloadLinks.push({ url: fullUrl, name: `exercice_pix.${ext}`, ext });
            }
          } catch (_) { }
        }
      });
      document.querySelectorAll('a.challenge-statement__action-link, a[download]').forEach(a => {
        if (a.closest('#pixpilot-root') || !a.href) return;
        try {
          const fullUrl = new URL(a.href, window.location.href).href;
          if (!result.downloadLinks.some(d => d.url === fullUrl)) {
            const extMatch = fullUrl.match(/\.(xlsx|xls|csv|ods|docx|doc|odt|pdf|txt|zip)($|\?)/i);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'xlsx';
            result.downloadLinks.push({ url: fullUrl, name: `exercice_pix.${ext}`, ext });
          }
        } catch (_) { }
      });
    }

    // 8. Extraction profonde multi-frames (Chart.js, Highcharts, SVG, tables & iframes cross-origin via background.js)
    const frameData = await this._sendBgMessage({ action: 'extract-all-frames' }, 10000);
    if (frameData && frameData.success && Array.isArray(frameData.frames)) {
      result.extraCharts = [];
      result.extraTables = [];
      result.extraIframeTexts = [];

      frameData.frames.forEach(f => {
        if (f.charts?.length) result.extraCharts.push(...f.charts);
        if (f.svgLabels?.length) result.extraCharts.push(`Labels SVG/Graphique : ${f.svgLabels.join(' | ')}`);
        if (f.tables?.length) result.extraTables.push(...f.tables);
        if (f.isCrossOriginSubFrame) {
          if (f.iframeText) result.extraIframeTexts.push(f.iframeText);
          if (f.selects?.length) result.selects.push(...f.selects);
          if (f.inputs?.length) result.inputs.push(...f.inputs);
          if (f.options?.length && result.options.length === 0) result.options.push(...f.options);
        }
      });
    }

    result.fullText = this.formatAsPromptText(result);
    return result;
  },

  /**
   * Récupère tous les champs de saisie textuels ou numériques d'un conteneur
   */
  getAllTextInputs(root) {
    const selector = [
      'input:not([type])',
      'input[type="text"]',
      'input[type="number"]',
      'input[type="search"]',
      'input[type="url"]',
      'input[type="email"]',
      'input[type="tel"]',
      'input[type="password"]',
      'input[type="date"]',
      'input[type="time"]',
      'textarea',
      '[contenteditable="true"]'
    ].join(', ');

    return Array.from(root.querySelectorAll(selector)).filter(inp => {
      if (!this.isInteractable(inp)) return false;
      if (inp.readOnly) return false;
      // Exclure les inputs internes d'un select personnalisé s'ils ne sont pas destinés à la réponse
      if (inp.classList.contains('ember-power-select-search-input')) return false;
      return true;
    });
  },

  /**
   * Récupère les boutons / étiquettes / cartes cliquables d'exercice (hors boutons système Pix)
   */
  getChoiceButtons(root) {
    const selector = [
      'button',
      'input[type="button"]',
      '[role="button"]',
      '[role="tab"]',
      '[aria-pressed]',
      '[aria-selected]',
      '.proposal-box',
      '.challenge-proposal',
      '.qroc-proposal'
    ].join(', ');

    return Array.from(root.querySelectorAll(selector)).filter(btn => {
      if (!this.isInteractable(btn)) return false;
      if (btn.closest(`.pix-actions, .challenge-actions, [data-test="challenge-actions"], nav, header, footer, .pix-select, ${this.CHROME_EXCLUSION_SELECTOR}`)) return false;
      if (btn.classList.contains('ember-power-select-trigger')) return false;
      const text = (btn.innerText || btn.value || btn.getAttribute('aria-label') || '').trim();
      if (!text || this.SYSTEM_BUTTON_PATTERNS.test(text)) return false;
      return true;
    });
  },

  /**
   * Nettoie et extrait le contexte textuel d'un conteneur entourant un champ (p, li, tr, proposal)
   * en remplaçant les éléments de formulaire par un marqueur propre [ ... ]
   */
  cleanContainerContext(container) {
    if (!container) return '';
    try {
      const clone = container.cloneNode(true);
      clone.querySelectorAll('select, input, textarea, button').forEach(el => {
        const span = (container.ownerDocument || document).createElement('span');
        span.textContent = ' [ ... ] ';
        el.replaceWith(span);
      });
      return (clone.innerText || clone.textContent || '').replace(/\s+/g, ' ').trim();
    } catch (_) {
      return '';
    }
  },

  /**
   * Trouve le texte du label ou contexte associé à un champ/input/select
   */
  findLabelForInput(input) {
    const doc = input.ownerDocument || document;

    // 1. Chercher d'abord un vrai <label for="id"> associé au champ
    if (input.id) {
      try {
        const label = doc.querySelector(`label[for="${CSS.escape(input.id)}"]`);
        if (label && label.innerText?.trim()) return label.innerText.trim();
      } catch (_) { }
    }

    // 2. Parent <label> direct
    const parentLabel = input.closest('label');
    if (parentLabel && parentLabel.innerText?.trim()) {
      return parentLabel.innerText.trim();
    }

    // 3. Attribut aria-labelledby
    if (input.getAttribute('aria-labelledby')) {
      const labelledEl = doc.getElementById(input.getAttribute('aria-labelledby'));
      if (labelledEl && labelledEl.innerText?.trim()) return labelledEl.innerText.trim();
    }

    // 4. Attribut aria-label (sauf si c'est un label automatique générique comme "Réponse 1", "Réponse 2")
    const ariaLabel = (input.getAttribute('aria-label') || '').trim();
    if (ariaLabel && !/^r[eé]ponse\s*\d+$/i.test(ariaLabel) && !/^champ\s*\d+$/i.test(ariaLabel)) {
      return ariaLabel;
    }

    // 5. Pour QROCM / QROC Pix : chercher le label du bloc conteneur .qrocm-proposal__input ou .challenge-response__proposal
    const qrocmBlock = input.closest('.qrocm-proposal__input, .challenge-response__proposal');
    if (qrocmBlock) {
      const lbl = qrocmBlock.querySelector('label, .qrocm-proposal__label');
      if (lbl && lbl.innerText?.trim()) return lbl.innerText.trim();
      const prevBlock = qrocmBlock.previousElementSibling;
      if (prevBlock && ['LABEL', 'SPAN', 'DIV', 'P'].includes(prevBlock.tagName) && prevBlock.innerText?.trim()) {
        const t = prevBlock.innerText.trim();
        if (t.length < 160) return t;
      }
    }

    // 6. Pour les radios/checkboxes : conteneur d'option direct
    if (input.type === 'radio' || input.type === 'checkbox' || input.getAttribute('role') === 'radio' || input.getAttribute('role') === 'checkbox') {
      const choiceWrapper = input.closest('.pix-choice, .c-choice, .choice-item, .form-check, .checkbox, .radio, li, .proposal');
      if (choiceWrapper && choiceWrapper.innerText?.trim()) {
        return choiceWrapper.innerText.trim();
      }
      if (input.nextElementSibling && input.nextElementSibling.innerText?.trim()) {
        return input.nextElementSibling.innerText.trim();
      }
    }

    // 7. Text node ou élément précédent immédiat (ex: « Titre de l'article » :)
    let prevSibling = input.previousSibling;
    while (prevSibling) {
      if (prevSibling.nodeType === 3 /* TEXT_NODE */) {
        const text = prevSibling.textContent.replace(/\s+/g, ' ').trim();
        if (text.length > 2) return text;
      } else if (prevSibling.nodeType === 1 /* ELEMENT_NODE */) {
        const text = prevSibling.innerText?.trim();
        if (text && text.length > 2 && text.length < 180) return text;
        break;
      }
      prevSibling = prevSibling.previousSibling;
    }

    // 8. Conteneur de ligne ou de phrase (p, li, tr, .proposal, .form-group) avec nettoyage des contrôles
    const sentenceWrapper = input.closest('p, li, tr, .proposal, .c-challenge__proposal, .form-group, .field, .qroc-field');
    if (sentenceWrapper) {
      const cleanCtx = this.cleanContainerContext(sentenceWrapper);
      if (cleanCtx && cleanCtx.length > 3 && cleanCtx.length < 350) {
        return cleanCtx;
      }
    }

    // 9. Conteneur div parent direct
    const divWrapper = input.closest('div');
    if (divWrapper && divWrapper !== doc.body) {
      const cleanDiv = this.cleanContainerContext(divWrapper);
      if (cleanDiv && cleanDiv.length > 3 && cleanDiv.length < 250) {
        return cleanDiv;
      }
    }

    return ariaLabel || '';
  },

  /**
   * Convertit une balise <img> en objet base64 inlineData (avec fallback CORS via background.js)
   */
  async imageToBase64(img) {
    try {
      if (img.src.startsWith('data:image')) {
        const mimeMatch = img.src.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (mimeMatch) {
          return { mimeType: mimeMatch[1], data: mimeMatch[2] };
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width || 300;
      canvas.height = img.naturalHeight || img.height || 200;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      const b64 = dataUrl.split(',')[1];
      return { mimeType: 'image/png', data: b64 };
    } catch (e) {
      if (/^https?:\/\//i.test(img.src || '')) {
        const bgRes = await this._sendBgMessage({ action: 'fetch-file-base64', url: img.src }, 12000);
        const ct = (bgRes?.contentType || '').toLowerCase();
        if (bgRes?.success && bgRes.base64 && !ct.includes('text/html')) {
          const mimeType = ct.startsWith('image/') ? ct.split(';')[0] : 'image/png';
          return { mimeType, data: bgRes.base64 };
        }
      }
      console.warn('[PixPilot] imageToBase64 fallback failed:', e?.message || e);
      return null;
    }
  },

  /**
   * Formate les informations extraites sous forme de prompt structuré pour Gemini
   */
  formatAsPromptText(extracted) {
    let text = `[ÉPREUVE PIX]\n`;
    if (extracted.title) {
      text += `Titre : ${extracted.title}\n\n`;
    }
    text += `Énoncé :\n${extracted.instructions}\n\n`;

    if (extracted.options.length > 0) {
      text += `Type : ${extracted.questionType === 'qcm-multiple' ? 'QCM CHOIX MULTIPLES (plusieurs cases possibles)' : 'QCM CHOIX UNIQUE'}\n`;
      text += `Options disponibles (retourne le texte EXACT dans <item>) :\n`;
      extracted.options.forEach((opt) => {
        text += `- ${opt.text}\n`;
      });
      text += `\n`;
    }

    if (extracted.selects.length > 0) {
      text += `Menus déroulants à sélectionner (retourne un <item> par menu dans l'ordre, avec le texte EXACT de l'option choisie) :\n`;
      extracted.selects.forEach((sel, idx) => {
        text += `- Menu #${idx + 1} [Ligne / Contexte : ${sel.label}] -> Options possibles : [${sel.options.join(' | ')}]\n`;
      });
      text += `\n`;
    }

    if (extracted.inputs.length > 0) {
      text += `Champs de saisie à remplir (retourne un <item> par champ dans l'ordre avec UNIQUEMENT la valeur exacte à taper) :\n`;
      extracted.inputs.forEach((inp, idx) => {
        text += `- Champ #${idx + 1} : "${inp.label}" (type: ${inp.type}${inp.placeholder ? `, placeholder: "${inp.placeholder}"` : ''})\n`;
      });
      text += `\n`;
    }

    if (extracted.buttons.length > 0 && extracted.options.length === 0) {
      text += `Boutons / éléments cliquables détectés dans l'exercice :\n`;
      extracted.buttons.forEach((b) => {
        text += `- [Bouton] ${b}\n`;
      });
      text += `\n`;
    }

    if (extracted.codeBlocks && extracted.codeBlocks.length > 0) {
      text += `[BLOCS DE CODE / EXTRAITS TECHNIQUES] :\n`;
      extracted.codeBlocks.forEach((cb) => {
        text += `\`\`\`\n${cb}\n\`\`\`\n`;
      });
      text += `\n`;
    }

    if (extracted.statementLinks && extracted.statementLinks.length > 0) {
      text += `[LIENS / URLS DÉTECTÉS DANS L'ÉNONCÉ] :\n`;
      extracted.statementLinks.slice(0, 12).forEach((lnk) => {
        text += `- ${lnk}\n`;
      });
      text += `\n`;
    }

    if (extracted.downloadLinks.length > 0) {
      text += `Fichiers mentionnés dans la question :\n`;
      extracted.downloadLinks.forEach(dl => {
        text += `- ${dl.name}\n`;
      });
      text += `\n`;
    }

    if (extracted.extraCharts && extracted.extraCharts.length > 0) {
      text += `[DONNÉES DE GRAPHIQUES / DIAGRAMMES EXTRAITES DU DOM] :\n`;
      extracted.extraCharts.forEach(c => {
        text += `- ${c}\n`;
      });
      text += `\n`;
    }

    if (extracted.extraTables && extracted.extraTables.length > 0) {
      text += `[TABLEAUX EXTRAITS DE LA PAGE] :\n`;
      extracted.extraTables.forEach(t => {
        text += `${t}\n\n`;
      });
    }

    if (extracted.extraIframeTexts && extracted.extraIframeTexts.length > 0) {
      text += `[CONTENU D'EXERCICE INTERACTIF (IFRAME)] :\n${extracted.extraIframeTexts.join('\n---\n')}\n\n`;
    }

    return text;
  },

  // ==========================================================================
  // MOTEUR DE RECONNAISSANCE & SAISIE AUTOMATIQUE MULTI-SUPPORTS
  // ==========================================================================

  /**
   * Normalise une chaîne pour la comparaison (minuscules, sans accents, espaces unifiés)
   */
  normalizeStrict(str) {
    return (str || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/['’`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Normalise en ne gardant que les caractères alphanumériques
   */
  normalizeAlphaNum(str) {
    return this.normalizeStrict(str)
      .replace(/[^a-z0-9]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  /**
   * Prépare chaque réponse de Gemini (extrait aussi label/valeur si format "Label : Valeur")
   */
  parseAnswerObjects(answers) {
    return answers.map((raw, index) => {
      const clean = (raw || '')
        .trim()
        .replace(/^(\[#?\d+\]|\d+[.)]|[-•*])\s*/, '')
        .replace(/^["«]|["»]$/g, '')
        .trim();

      let labelPart = '';
      let valuePart = clean;

      const isProtectedValue =
        /^https?:\/\//i.test(clean) ||
        /^\d{1,2}:\d{2}(:\d{2})?$/.test(clean) ||
        /^([0-9a-f]{1,4}:){2,}/i.test(clean) ||
        /^\s*=/.test(clean);

      if (!isProtectedValue) {
        const sepMatch = clean.match(/^([^:=→>]{2,50}?)\s*(?::|=|->|→)\s*(.+)$/);
        if (sepMatch) {
          labelPart = sepMatch[1].trim();
          valuePart = sepMatch[2].replace(/^["«]|["»]$/g, '').trim();
        }
      }

      return {
        index,
        raw,
        clean,
        labelPart,
        valuePart
      };
    }).filter(a => a.clean.length > 0);
  },

  /**
   * Calcule un score de correspondance [0..1] entre un texte du DOM et une réponse
   */
  scoreMatch(candidateText, ansObj) {
    if (!candidateText || !ansObj) return 0;

    const candStrict = this.normalizeStrict(candidateText);
    const candAlpha = this.normalizeAlphaNum(candidateText);
    if (!candStrict) return 0;

    const variants = [ansObj.clean, ansObj.valuePart].filter(Boolean);
    let bestScore = 0;

    for (const variant of variants) {
      const varStrict = this.normalizeStrict(variant);
      const varAlpha = this.normalizeAlphaNum(variant);
      if (!varStrict) continue;

      // 1. Égalité exacte
      if (candStrict === varStrict) return 1.0;
      if (candAlpha && candAlpha === varAlpha) {
        bestScore = Math.max(bestScore, 0.98);
        continue;
      }

      // 2. Égalité numérique (ex: "1 024" vs "1024", "12,5" vs "12.5")
      const candNum = candStrict.replace(/\s+/g, '').replace(',', '.');
      const varNum = varStrict.replace(/\s+/g, '').replace(',', '.');
      if (/^-?\d+(\.\d+)?$/.test(candNum) && candNum === varNum) {
        bestScore = Math.max(bestScore, 0.97);
        continue;
      }

      // 3. Inclusion directe (avec garde-fou sur les chaînes très courtes)
      if (varAlpha.length >= 3 && candAlpha.length >= 3) {
        if (candStrict.includes(varStrict) || varStrict.includes(candStrict)) {
          const ratio = Math.min(candStrict.length, varStrict.length) / Math.max(candStrict.length, varStrict.length);
          bestScore = Math.max(bestScore, 0.82 + ratio * 0.14);
          continue;
        }
      }

      // 4. Recouvrement par mots significatifs
      const varWords = varAlpha.split(' ').filter(w => w.length > 2);
      const candWords = candAlpha.split(' ').filter(w => w.length > 2);
      if (varWords.length > 0 && candWords.length > 0) {
        const matched = varWords.filter(w => candWords.includes(w) || candWords.some(cw => cw.length > 4 && w.length > 4 && (cw.includes(w) || w.includes(cw))));
        const recall = matched.length / varWords.length;
        const precision = matched.length / candWords.length;
        const f1 = (recall + precision) > 0 ? (2 * recall * precision) / (recall + precision) : 0;
        if (recall >= 0.75) {
          bestScore = Math.max(bestScore, 0.65 + f1 * 0.25);
        }
      }
    }

    return bestScore;
  },

  /**
   * Définit la valeur d'un input/textarea/select en passant par le setter natif du prototype
   * pour garantir la prise en compte par Ember.js, React et Vue.
   */
  setNativeValue(element, value) {
    const win = element.ownerDocument?.defaultView || window;
    let proto = win.HTMLInputElement?.prototype;
    if (element.tagName === 'TEXTAREA') {
      proto = win.HTMLTextAreaElement?.prototype;
    } else if (element.tagName === 'SELECT') {
      proto = win.HTMLSelectElement?.prototype;
    }

    const descriptor = proto ? Object.getOwnPropertyDescriptor(proto, 'value') : null;
    if (descriptor && descriptor.set) {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  },

  /**
   * Déclenche la séquence d'événements attendue par Ember.js / React sur un champ
   */
  dispatchInputEvents(element, value = '') {
    const win = element.ownerDocument?.defaultView || window;
    const EventCtor = win.Event || Event;
    const InputEventCtor = win.InputEvent || EventCtor;
    const tag = (element.tagName || '').toUpperCase();
    const isTextLike = element.isContentEditable ||
      tag === 'TEXTAREA' ||
      (tag === 'INPUT' && !['checkbox', 'radio', 'button', 'submit'].includes((element.type || '').toLowerCase()));

    element.dispatchEvent(new EventCtor('focus', { bubbles: false }));

    if (isTextLike) {
      try {
        element.dispatchEvent(new InputEventCtor('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: String(value)
        }));
      } catch (_) {
        element.dispatchEvent(new EventCtor('input', { bubbles: true }));
      }
    }

    element.dispatchEvent(new EventCtor('change', { bubbles: true }));
    element.dispatchEvent(new EventCtor('blur', { bubbles: false }));
  },

  /**
   * Surlignage visuel discret de l'élément appliqué
   */
  highlightElement(el) {
    if (!el) return;
    el.style.transition = 'outline 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease';
    el.style.outline = '2px solid #10b981';
    el.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.14)';
  },

  /**
   * Applique automatiquement les réponses sur tous les types d'éléments Pix :
   * 1. Cases à cocher & Boutons radios (natifs & ARIA)
   * 2. Menus déroulants (<select> natifs & menus personnalisés Ember/ARIA)
   * 3. Zones de texte, nombre, textarea & contenteditable (1 ou N champs)
   * 4. Boutons de choix / propositions cliquables
   */
  async autoApplyAnswers(answers) {
    if (!answers || answers.length === 0) return 0;

    const parsedAnswers = this.parseAnswerObjects(answers);
    if (parsedAnswers.length === 0) return 0;

    const usedAnswerIndices = new Set();
    let appliedCount = 0;
    const roots = this.getChallengeRoots();

    // ========================================================================
    // 1. CASES À COCHER & BOUTONS RADIO (Natifs + ARIA, hors sélecteur .xlsx/.ods)
    // ========================================================================
    const allChoices = [];
    for (const doc of roots) {
      const rootContainer = doc === document ? this.findMainContainer(doc) : doc.body;
      const inputs = rootContainer.querySelectorAll('input[type="checkbox"], input[type="radio"], [role="checkbox"], [role="radio"]');
      inputs.forEach(input => {
        if (!this.isInteractable(input)) return;
        const labelText = this.findLabelForInput(input);
        if (this.isFileFormatSelector(input, labelText)) return;
        if (labelText) {
          allChoices.push({ input, labelText, doc });
        }
      });
    }

    if (allChoices.length > 0) {
      const matchedChoices = new Set();

      for (const ansObj of parsedAnswers) {
        let bestChoice = null;
        let bestScore = 0;

        for (const item of allChoices) {
          const score = this.scoreMatch(item.labelText, ansObj);
          if (score > bestScore) {
            bestScore = score;
            bestChoice = item;
          }
        }

        if (bestChoice && bestScore >= 0.65) {
          matchedChoices.add(bestChoice);
          usedAnswerIndices.add(ansObj.index);
        }
      }

      if (matchedChoices.size > 0) {
        // Décocher les cases cochées par erreur lors d'un essai précédent
        for (const item of allChoices) {
          const { input } = item;
          const isNative = input.tagName === 'INPUT';
          if (isNative && input.type === 'checkbox' && input.checked && !matchedChoices.has(item)) {
            input.click();
            if (input.checked) {
              input.checked = false;
              this.dispatchInputEvents(input);
            }
          }
        }

        // Cocher toutes les bonnes réponses
        for (const item of matchedChoices) {
          const { input } = item;
          const isNative = input.tagName === 'INPUT';
          const isChecked = isNative ? input.checked : input.getAttribute('aria-checked') === 'true';

          if (!isChecked) {
            const labelEl = input.closest('label') || (input.id ? item.doc.querySelector(`label[for="${CSS.escape(input.id)}"]`) : null);
            if (labelEl) {
              labelEl.click();
            } else {
              input.click();
            }

            if (isNative && !input.checked) {
              input.checked = true;
              this.dispatchInputEvents(input);
            }
          }

          const wrapper = input.closest('label, .choice-item, .pix-choice, .c-choice, .proposal, li') || input.parentElement || input;
          this.highlightElement(wrapper);
          appliedCount++;
        }
      }
    }

    // ========================================================================
    // 2. MENUS DÉROULANTS (<select> natifs & menus personnalisés)
    // ========================================================================
    const allSelects = [];
    for (const doc of roots) {
      const rootContainer = doc === document ? this.findMainContainer(doc) : doc.body;
      rootContainer.querySelectorAll('select').forEach(sel => {
        if (this.isInteractable(sel)) {
          allSelects.push({ sel, label: this.findLabelForInput(sel) });
        }
      });
    }

    if (allSelects.length > 0) {
      allSelects.forEach((selObj, selIdx) => {
        const { sel, label } = selObj;
        const options = Array.from(sel.options);

        let bestOpt = null;
        let bestAns = null;
        let bestScore = 0;

        // Priorité 1 : Si le nombre de réponses correspond à l'ordre des menus, tester parsedAnswers[selIdx]
        if (parsedAnswers[selIdx]) {
          const directAns = parsedAnswers[selIdx];
          for (const opt of options) {
            if (opt.disabled || (opt.value === '' && opt.index === 0)) continue;
            const score = Math.max(
              this.scoreMatch(opt.text, directAns),
              this.scoreMatch(opt.value, directAns)
            );
            if (score >= 0.70 && score > bestScore) {
              bestScore = score;
              bestOpt = opt;
              bestAns = directAns;
            }
          }
        }

        // Priorité 2 : Si pas de correspondance directe, rechercher par correspondance de label ou globale
        if (!bestOpt || bestScore < 0.90) {
          const candidateAnswers = [...parsedAnswers].sort((a, b) => {
            const aLabelMatch = a.labelPart && label ? this.scoreMatch(label, { clean: a.labelPart, valuePart: a.labelPart }) : 0;
            const bLabelMatch = b.labelPart && label ? this.scoreMatch(label, { clean: b.labelPart, valuePart: b.labelPart }) : 0;
            if (aLabelMatch !== bLabelMatch) return bLabelMatch - aLabelMatch;
            const aPos = a.index === selIdx ? 1 : 0;
            const bPos = b.index === selIdx ? 1 : 0;
            return bPos - aPos;
          });

          for (const ansObj of candidateAnswers) {
            if (usedAnswerIndices.has(ansObj.index) && parsedAnswers.length >= allSelects.length && bestOpt) continue;

            for (const opt of options) {
              if (opt.disabled || (opt.value === '' && opt.index === 0)) continue;
              const score = Math.max(
                this.scoreMatch(opt.text, ansObj),
                this.scoreMatch(opt.value, ansObj)
              );
              if (score > bestScore) {
                bestScore = score;
                bestOpt = opt;
                bestAns = ansObj;
              }
            }
            if (bestScore >= 0.95) break;
          }
        }

        if (bestOpt && bestScore >= 0.65) {
          this.setNativeValue(sel, bestOpt.value);
          sel.selectedIndex = bestOpt.index;
          bestOpt.selected = true;
          this.dispatchInputEvents(sel, bestOpt.value);
          this.highlightElement(sel);
          if (bestAns) usedAnswerIndices.add(bestAns.index);
          appliedCount++;
        }
      });
    }

    // Menus déroulants personnalisés (Ember Power Select / ARIA combobox / listbox)
    for (const doc of roots) {
      const rootContainer = doc === document ? this.findMainContainer(doc) : doc.body;

      // A. Menus officiels Pix (@1024pix/nebulix-ember : .pix-select)
      const pixSelects = Array.from(rootContainer.querySelectorAll('.pix-select'));
      for (let pIdx = 0; pIdx < pixSelects.length; pIdx++) {
        const pixSel = pixSelects[pIdx];
        if (pixSel.closest('#pixpilot-root')) continue;
        const triggerBtn = pixSel.querySelector('.pix-select-button') || pixSel.querySelector('button');
        if (!triggerBtn || triggerBtn.disabled || triggerBtn.getAttribute('aria-disabled') === 'true') continue;

        if (triggerBtn.getAttribute('aria-expanded') !== 'true') {
          triggerBtn.click();
          await new Promise(r => setTimeout(r, 45));
        }

        const optionItems = Array.from(pixSel.querySelectorAll('.pix-select-list-category__option, [role="option"]'));
        const remainingAnswers = parsedAnswers.filter(a => !usedAnswerIndices.has(a.index));
        const pixLabel = this.findLabelForInput(triggerBtn) || pixSel.querySelector('.pix-label')?.innerText?.trim() || '';
        const rankedAnswers = [...remainingAnswers].sort((a, b) => {
          const aLbl = a.labelPart && pixLabel ? this.scoreMatch(pixLabel, { clean: a.labelPart, valuePart: a.labelPart }) : 0;
          const bLbl = b.labelPart && pixLabel ? this.scoreMatch(pixLabel, { clean: b.labelPart, valuePart: b.labelPart }) : 0;
          if (aLbl !== bLbl) return bLbl - aLbl;
          return (b.index === pIdx ? 1 : 0) - (a.index === pIdx ? 1 : 0);
        });

        let bestOpt = null;
        let bestAns = null;
        let bestScore = 0;

        for (const ansObj of rankedAnswers) {
          for (const optNode of optionItems) {
            const optText = (optNode.getAttribute('title') || optNode.innerText || optNode.textContent || '').trim();
            if (!optText || /^(choisissez|sélectionnez|--)/i.test(optText)) continue;
            const score = this.scoreMatch(optText, ansObj);
            if (score > bestScore) {
              bestScore = score;
              bestOpt = optNode;
              bestAns = ansObj;
            }
          }
          if (bestScore >= 0.95) break;
        }

        if (bestOpt && bestScore >= 0.65) {
          bestOpt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          bestOpt.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          bestOpt.click();
          this.highlightElement(pixSel);
          if (bestAns) usedAnswerIndices.add(bestAns.index);
          appliedCount++;
        }
      }

      // B. Autres menus déroulants personnalisés (Ember Power Select, ARIA combobox)
      const customTriggers = Array.from(rootContainer.querySelectorAll('.ember-power-select-trigger, [role="combobox"], [aria-haspopup="listbox"]'))
        .filter(el => this.isInteractable(el) && el.tagName !== 'SELECT' && !el.closest('.pix-select'));

      for (let tIdx = 0; tIdx < customTriggers.length; tIdx++) {
        const trigger = customTriggers[tIdx];
        const remainingAnswers = parsedAnswers.filter(a => !usedAnswerIndices.has(a.index));
        if (remainingAnswers.length === 0) break;

        if (trigger.getAttribute('aria-expanded') !== 'true') {
          trigger.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          trigger.click();
          await new Promise(r => setTimeout(r, 60));
        }

        const controlledId = trigger.getAttribute('aria-controls') || trigger.getAttribute('aria-owns');
        const controlledEl = controlledId ? doc.getElementById(controlledId) : null;
        const optScope = controlledEl || trigger.closest('.ember-power-select, .dropdown, [class*="select"]') || doc;
        const optionNodes = Array.from(optScope.querySelectorAll('[role="option"], .ember-power-select-option, .dropdown-item'))
          .filter(o => !o.closest('.pix-select'));

        const trigLabel = this.findLabelForInput(trigger) || '';
        const rankedAnswers = [...remainingAnswers].sort((a, b) => {
          const aLbl = a.labelPart && trigLabel ? this.scoreMatch(trigLabel, { clean: a.labelPart, valuePart: a.labelPart }) : 0;
          const bLbl = b.labelPart && trigLabel ? this.scoreMatch(trigLabel, { clean: b.labelPart, valuePart: b.labelPart }) : 0;
          if (aLbl !== bLbl) return bLbl - aLbl;
          return (b.index === tIdx ? 1 : 0) - (a.index === tIdx ? 1 : 0);
        });

        let bestNode = null;
        let bestAns = null;
        let bestScore = 0;

        for (const ansObj of rankedAnswers) {
          for (const node of optionNodes) {
            if (!this.isInteractable(node)) continue;
            const score = this.scoreMatch(node.innerText, ansObj);
            if (score > bestScore) {
              bestScore = score;
              bestNode = node;
              bestAns = ansObj;
            }
          }
          if (bestScore >= 0.95) break;
        }

        if (bestNode && bestScore >= 0.68) {
          bestNode.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
          bestNode.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
          bestNode.click();
          this.highlightElement(trigger);
          if (bestAns) usedAnswerIndices.add(bestAns.index);
          appliedCount++;
          await new Promise(r => setTimeout(r, 30));
        }
      }
    }

    // ========================================================================
    // 3. ZONES DE TEXTE, NOMBRE, TEXTAREA & CONTENTEDITABLE (1 ou N champs)
    // ========================================================================
    const allTextInputs = [];
    for (const doc of roots) {
      const rootContainer = doc === document ? this.findMainContainer(doc) : doc.body;
      this.getAllTextInputs(rootContainer).forEach(inp => {
        allTextInputs.push({
          inp,
          label: this.findLabelForInput(inp) || inp.placeholder || ''
        });
      });
    }

    if (allTextInputs.length > 0) {
      const availableAnswers = parsedAnswers.filter(a => !usedAnswerIndices.has(a.index));
      const answersPool = availableAnswers.length > 0 ? availableAnswers : (appliedCount === 0 ? parsedAnswers : []);
      const filledInputs = new Set();

      if (answersPool.length > 0) {
        // Passe A : Si une réponse commence par "=" (formule Excel) et qu'un champ a "formule" dans son label, les associer !
        for (const ansObj of answersPool) {
          if (ansObj.valuePart.startsWith('=')) {
            const formulaField = allTextInputs.find(f => !filledInputs.has(f) && /formule/i.test(f.label));
            if (formulaField) {
              this.fillSingleTextInput(formulaField.inp, ansObj.valuePart);
              filledInputs.add(formulaField);
              usedAnswerIndices.add(ansObj.index);
              appliedCount++;
            }
          }
        }

        // Passe B : Si certaines réponses ont un "Label : Valeur", les associer au champ correspondant
        for (const ansObj of answersPool) {
          if (usedAnswerIndices.has(ansObj.index) || !ansObj.labelPart) continue;
          let bestField = null;
          let bestScore = 0;

          for (const field of allTextInputs) {
            if (filledInputs.has(field)) continue;
            const score = this.scoreMatch(field.label, { clean: ansObj.labelPart, valuePart: ansObj.labelPart });
            if (score > bestScore) {
              bestScore = score;
              bestField = field;
            }
          }

          if (bestField && bestScore >= 0.65) {
            this.fillSingleTextInput(bestField.inp, ansObj.valuePart);
            filledInputs.add(bestField);
            usedAnswerIndices.add(ansObj.index);
            appliedCount++;
          }
        }

        // Passe C : Remplir les champs restants dans l'ordre d'apparition (valeur brute intacte)
        const remainingAnswers = answersPool.filter(a => !usedAnswerIndices.has(a.index));
        const remainingFields = allTextInputs.filter(f => !filledInputs.has(f));

        for (let i = 0; i < remainingFields.length && i < remainingAnswers.length; i++) {
          const field = remainingFields[i];
          const ansObj = remainingAnswers[i];
          this.fillSingleTextInput(field.inp, ansObj.clean);
          filledInputs.add(field);
          usedAnswerIndices.add(ansObj.index);
          appliedCount++;
        }
      }
    }

    // ========================================================================
    // 4. BOUTONS DE CHOIX / ÉTIQUETTES / CARTES CLIQUABLES
    // ========================================================================
    const remainingForButtons = parsedAnswers.filter(a => !usedAnswerIndices.has(a.index));
    if (remainingForButtons.length > 0) {
      const allButtons = [];
      for (const doc of roots) {
        const rootContainer = doc === document ? this.findMainContainer(doc) : doc.body;
        this.getChoiceButtons(rootContainer).forEach(btn => {
          const text = (btn.innerText || btn.value || btn.getAttribute('aria-label') || '').trim();
          if (text) allButtons.push({ btn, text });
        });
      }

      for (const ansObj of remainingForButtons) {
        let bestBtn = null;
        let bestScore = 0;

        for (const item of allButtons) {
          const score = this.scoreMatch(item.text, ansObj);
          if (score > bestScore) {
            bestScore = score;
            bestBtn = item.btn;
          }
        }

        if (bestBtn && bestScore >= 0.72) {
          bestBtn.click();
          this.highlightElement(bestBtn);
          usedAnswerIndices.add(ansObj.index);
          appliedCount++;
        }
      }
    }

    // 5. S'il reste des réponses non appliquées, tenter dans les iframes cross-origin via background.js
    const remainingForIframes = parsedAnswers.filter(a => !usedAnswerIndices.has(a.index)).map(a => a.clean);
    if (remainingForIframes.length > 0) {
      const iframeRes = await this._sendBgMessage({ action: 'apply-all-frames', answers: remainingForIframes }, 10000);
      if (iframeRes && iframeRes.count > 0) {
        appliedCount += iframeRes.count;
      }
    }

    return appliedCount;
  },

  /**
   * Remplit un champ texte/nombre/textarea/contenteditable de manière compatible Ember/React
   */
  fillSingleTextInput(inp, rawValue) {
    if (!inp || rawValue === undefined || rawValue === null) return;
    const val = String(rawValue).trim();

    inp.focus();

    if (inp.isContentEditable) {
      inp.innerText = val;
      this.dispatchInputEvents(inp, val);
    } else {
      // Si c'est un input[type="number"], normaliser la virgule en point si besoin
      const finalVal = inp.type === 'number' ? val.replace(/\s+/g, '').replace(',', '.') : val;
      this.setNativeValue(inp, finalVal);
      this.dispatchInputEvents(inp, finalVal);
    }

    this.highlightElement(inp);
  }
};

if (typeof window !== 'undefined') {
  window.PixExtractor = PixExtractor;
}
