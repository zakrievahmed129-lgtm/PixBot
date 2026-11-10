/**
 * PixPilot - Content Script
 * Interface moderne, minimaliste et épurée injectée sur Pix.
 * Intègre Gemini pour l'analyse multimodale (Texte, Images, PDF, Excel, Word).
 */

(function () {
  // Éviter les injections multiples
  if (document.getElementById('pixpilot-root')) {
    return;
  }

  // Configuration par défaut (avec votre clé pré-intégrée)
  let config = {
    apiKey: 'AQ.Ab8RN6L3GTYcNvQ4NRRpzTxYcns9jRauXN_besAXxCGTY7Qbmg',
    model: 'gemini-2.5-flash'
  };

  // État local
  let attachedFiles = [];
  let extractedChallenge = null;
  let isGenerating = false;

  // Charger la configuration sauvegardée
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['geminiApiKey', 'geminiModel'], (res) => {
      if (res.geminiApiKey) config.apiKey = res.geminiApiKey;
      if (res.geminiModel) config.model = res.geminiModel;
      updateModelBadge();
    });
  } else if (typeof localStorage !== 'undefined') {
    const savedKey = localStorage.getItem('pp_geminiApiKey');
    const savedModel = localStorage.getItem('pp_geminiModel');
    if (savedKey) config.apiKey = savedKey;
    if (savedModel) config.model = savedModel;
    setTimeout(updateModelBadge, 0);
  }

  // --------------------------------------------------------------------------
  // Création du DOM de l'extension
  // --------------------------------------------------------------------------
  const root = document.createElement('div');
  root.id = 'pixpilot-root';
  root.innerHTML = `
    <!-- Bouton Flottant Style Console -->
    <div id="pixpilot-fab" title="Ouvrir PixPilot (Alt + P)">
      <span class="fab-icon">&gt;_</span>
      <span class="fab-text">PixPilot</span>
      <span class="fab-badge" id="pp-fab-badge">CMD</span>
    </div>

    <!-- Volet Principal Console CMD -->
    <div id="pixpilot-panel">
      <!-- En-tête Console -->
      <div class="pp-header">
        <div class="pp-brand">
          <div class="pp-console-dots">
            <span class="pp-console-dot" style="background:#ef4444;"></span>
            <span class="pp-console-dot" style="background:#f59e0b;"></span>
            <span class="pp-console-dot" style="background:#10b981;"></span>
          </div>
          <h2 class="pp-title">cmd.exe &mdash; pixpilot@quiz</h2>
          <span class="pp-model-tag" id="pp-model-badge">gemini-2.5-flash</span>
        </div>
        <div class="pp-header-actions">
          <button class="pp-icon-btn" id="pp-btn-settings" title="Paramètres & Clé API">[cfg]</button>
          <button class="pp-icon-btn" id="pp-btn-close" title="Fermer">[&times;]</button>
        </div>
      </div>

      <!-- Barre de commandes rapides -->
      <div class="pp-quick-bar">
        <button class="pp-btn-pill primary" id="pp-btn-scan" title="Analyser la question affichée">
          &gt; SCANNER
        </button>
        <button class="pp-btn-pill" id="pp-btn-screenshot" title="Prendre une capture de l'exercice visuel">
          &gt; CAPTURE
        </button>
        <button class="pp-btn-pill" id="pp-btn-attach" title="Joindre un fichier (PDF, Excel, Word...)">
          &gt; FICHIER
        </button>
        <input type="file" id="pp-file-input" style="display:none;" multiple accept="image/*,.pdf,.xlsx,.xls,.ods,.docx,.doc,.csv,.txt,.json,.py,.sql">
      </div>

      <!-- Fichiers Attachés (Chips) -->
      <div class="pp-attachments-container" id="pp-attachments-list"></div>

      <!-- Corps / Zone d'affichage des résultats -->
      <div class="pp-body" id="pp-body">
        <div class="pp-empty-state" id="pp-empty-state">
          <div class="pp-empty-title">&gt; PIXPILOT_CLI [VERSION 1.0.0]</div>
          <div class="pp-empty-desc">
            Prêt pour l'épreuve Pix.<br>
            - Tape <strong>« &gt; SCANNER »</strong> pour analyser automatiquement le quiz.<br>
            - Tape <strong>« &gt; CAPTURE »</strong> pour capturer le schéma ou l'écran Pix.<br>
            - Glisse n'importe quel fichier (Excel, Word, PDF, Image).
          </div>
        </div>
      </div>

      <!-- Zone Inférieure (Prompt manuel & Envoi) -->
      <div class="pp-footer">
        <div class="pp-input-row">
          <span class="pp-prompt-symbol">&gt;</span>
          <textarea class="pp-textarea" id="pp-prompt-input" rows="1" placeholder="instruction optionnelle... (Entrée pour lancer)"></textarea>
          <button class="pp-btn-send" id="pp-btn-send" title="Exécuter">EXEC</button>
        </div>
        <div class="pp-status-hint">
          <span id="pp-status-text">&gt; status: ready</span>
          <span>[Alt + P] basculer</span>
        </div>
      </div>

      <!-- Modal de Configuration (Clé API & Modèle) -->
      <div class="pp-settings-modal" id="pp-settings-modal">
        <div class="pp-settings-title">
          <span>Configuration PixPilot</span>
          <button class="pp-icon-btn" id="pp-btn-close-settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <div class="pp-field-group">
          <label class="pp-label">Clé d'API Google Gemini</label>
          <input type="password" class="pp-input-text" id="pp-cfg-key" placeholder="AIzaSy...">
          <div class="pp-help-text">
            Obtiens une clé gratuite en 1 clic sur <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Google AI Studio</a>.
          </div>
        </div>

        <div class="pp-field-group">
          <label class="pp-label">Modèle Gemini</label>
          <select class="pp-select" id="pp-cfg-model">
            <option value="gemini-2.5-flash">Gemini 2.5 Flash (Recommandé - Ultra rapide & précis)</option>
            <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash Lite (Ultra léger)</option>
            <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (Personnalisé)</option>
            <option value="gemini-1.5-flash">Gemini 1.5 Flash (Classique)</option>
            <option value="custom">Autre modèle personnalisé...</option>
          </select>
          <input type="text" class="pp-input-text" id="pp-cfg-custom-model" placeholder="Nom du modèle (ex: gemini-3.1-flash-lite)" style="display:none; margin-top:6px;">
        </div>

        <button class="pp-btn-save" id="pp-btn-save-settings">Enregistrer</button>
      </div>

      <!-- Modal Visualiseur de Capture / Image -->
      <div class="pp-image-preview-modal" id="pp-image-preview-modal">
        <div class="pp-preview-header">
          <span id="pp-preview-title">&gt; PREVIEW: capture.png</span>
          <button class="pp-icon-btn" id="pp-btn-close-preview" title="Fermer la prévisualisation">[&times;]</button>
        </div>
        <div class="pp-preview-body">
          <img id="pp-preview-img" src="" alt="Capture d'écran Pix" title="Cliquez pour fermer">
          <span class="pp-preview-hint">Cliquez sur l'image ou appuyez sur Échap pour fermer</span>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  // --------------------------------------------------------------------------
  // Éléments du DOM
  // --------------------------------------------------------------------------
  const fab = document.getElementById('pixpilot-fab');
  const panel = document.getElementById('pixpilot-panel');
  const btnClose = document.getElementById('pp-btn-close');
  const btnSettings = document.getElementById('pp-btn-settings');
  const btnCloseSettings = document.getElementById('pp-btn-close-settings');
  const settingsModal = document.getElementById('pp-settings-modal');
  const btnSaveSettings = document.getElementById('pp-btn-save-settings');
  const cfgKey = document.getElementById('pp-cfg-key');
  const cfgModel = document.getElementById('pp-cfg-model');
  const cfgCustomModel = document.getElementById('pp-cfg-custom-model');
  const modelBadge = document.getElementById('pp-model-badge');

  const btnScan = document.getElementById('pp-btn-scan');
  const btnScreenshot = document.getElementById('pp-btn-screenshot');
  const btnAttach = document.getElementById('pp-btn-attach');
  const fileInput = document.getElementById('pp-file-input');
  const attachmentsList = document.getElementById('pp-attachments-list');
  const promptInput = document.getElementById('pp-prompt-input');
  const btnSend = document.getElementById('pp-btn-send');
  const body = document.getElementById('pp-body');
  const emptyState = document.getElementById('pp-empty-state');
  const statusText = document.getElementById('pp-status-text');

  // Éléments du Visualiseur de Capture
  const previewModal = document.getElementById('pp-image-preview-modal');
  const previewImg = document.getElementById('pp-preview-img');
  const previewTitle = document.getElementById('pp-preview-title');
  const btnClosePreview = document.getElementById('pp-btn-close-preview');

  function openImagePreview(title, url) {
    if (!previewModal || !previewImg) return;
    previewTitle.textContent = `> PREVIEW: ${title}`;
    previewImg.src = url;
    previewModal.classList.add('is-active');
  }

  function closeImagePreview() {
    if (!previewModal) return;
    previewModal.classList.remove('is-active');
    if (previewImg) previewImg.src = '';
  }

  if (btnClosePreview) btnClosePreview.addEventListener('click', closeImagePreview);
  if (previewModal) {
    previewModal.addEventListener('click', (e) => {
      // Ferme au clic sur le fond ou sur l'image elle-même
      if (e.target === previewModal || e.target === previewImg || e.target.classList.contains('pp-preview-body')) {
        closeImagePreview();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Gestion de l'ouverture / fermeture
  // --------------------------------------------------------------------------
  function togglePanel() {
    const isOpen = panel.classList.toggle('is-open');
    if (isOpen) {
      if (!config.apiKey) {
        openSettings();
      } else {
        promptInput.focus();
      }
    }
  }

  fab.addEventListener('click', togglePanel);
  btnClose.addEventListener('click', () => panel.classList.remove('is-open'));

  // Raccourcis clavier (Alt + P pour basculer, Échap pour fermeture discrète)
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      togglePanel();
    } else if (e.key === 'Escape') {
      if (previewModal && previewModal.classList.contains('is-active')) {
        closeImagePreview();
      } else if (settingsModal.classList.contains('is-active')) {
        closeSettings();
      } else if (panel.classList.contains('is-open')) {
        panel.classList.remove('is-open');
      }
    }
  });

  // Glisser-déposer de fichiers directement sur le bouton flottant
  fab.addEventListener('dragover', (e) => {
    e.preventDefault();
    fab.style.borderColor = 'var(--pp-terminal-green)';
  });
  fab.addEventListener('dragleave', () => {
    fab.style.borderColor = 'var(--pp-border)';
  });
  fab.addEventListener('drop', async (e) => {
    e.preventDefault();
    fab.style.borderColor = 'var(--pp-border)';
    if (!panel.classList.contains('is-open')) {
      panel.classList.add('is-open');
    }
    const files = Array.from(e.dataTransfer.files || []);
    for (const f of files) {
      await handleFileUpload(f);
    }
  });

  // --------------------------------------------------------------------------
  // Paramètres
  // --------------------------------------------------------------------------
  function openSettings() {
    cfgKey.value = config.apiKey || '';
    if (['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-3.1-flash-lite', 'gemini-1.5-flash'].includes(config.model)) {
      cfgModel.value = config.model;
      cfgCustomModel.style.display = 'none';
    } else {
      cfgModel.value = 'custom';
      cfgCustomModel.value = config.model;
      cfgCustomModel.style.display = 'block';
    }
    settingsModal.classList.add('is-active');
  }

  function closeSettings() {
    settingsModal.classList.remove('is-active');
  }

  btnSettings.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', closeSettings);

  cfgModel.addEventListener('change', () => {
    cfgCustomModel.style.display = cfgModel.value === 'custom' ? 'block' : 'none';
  });

  btnSaveSettings.addEventListener('click', () => {
    const key = cfgKey.value.trim();
    let model = cfgModel.value;
    if (model === 'custom') {
      model = cfgCustomModel.value.trim() || 'gemini-2.5-flash';
    }

    config.apiKey = key;
    config.model = model;

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ geminiApiKey: key, geminiModel: model });
    } else if (typeof localStorage !== 'undefined') {
      localStorage.setItem('pp_geminiApiKey', key);
      localStorage.setItem('pp_geminiModel', model);
    }

    updateModelBadge();
    closeSettings();
    showToast('Paramètres sauvegardés avec succès');
  });

  function updateModelBadge() {
    const prettyNames = {
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
      'gemini-2.0-flash-lite': 'Gemini 2.0 Flash Lite',
      'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
      'gemini-1.5-flash': 'Gemini 1.5 Flash'
    };
    modelBadge.textContent = prettyNames[config.model] || config.model;
  }

  // --------------------------------------------------------------------------
  // Capture d'écran visuelle (Robuste : html2canvas + API Chrome)
  // --------------------------------------------------------------------------
  async function takeChallengeScreenshot() {
    if (!btnScreenshot) return;
    btnScreenshot.disabled = true;
    statusText.textContent = '> capture --screen in_progress...';

    // 1. Masquer temporairement le panneau PixPilot pour qu'il n'apparaisse pas sur la capture
    const originalVisibility = panel.style.visibility;
    panel.style.visibility = 'hidden';

    let dataUrl = null;

    // Laisser un court délai pour que le panneau soit bien masqué visuellement
    await new Promise((r) => setTimeout(r, 60));

    // A. Essai prioritaire avec html2canvas (cible directement la question Pix)
    if (typeof html2canvas !== 'undefined') {
      try {
        const candidates = [
          document.querySelector('.pix-challenge-card'),
          document.querySelector('[data-test="challenge-content"]'),
          document.querySelector('.pix-challenge'),
          document.querySelector('.c-challenge'),
          document.querySelector('main'),
          document.body
        ];
        const target = candidates.find(el => el && el.offsetHeight > 40) || document.body;

        const canvas = await html2canvas(target, {
          useCORS: true,
          logging: false,
          scale: 1.5,
          ignoreElements: (el) => el.id === 'pixpilot-root'
        });
        dataUrl = canvas.toDataURL('image/png');
      } catch (err) {
        console.warn('[PixPilot] html2canvas warning:', err);
      }
    }

    // B. Repli avec l'API Chrome si html2canvas n'a pas pu produire d'image
    if (!dataUrl && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      dataUrl = await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ action: 'capture-visible-tab' }, (response) => {
            if (response && response.success && response.dataUrl) {
              resolve(response.dataUrl);
            } else {
              resolve(null);
            }
          });
        } catch (_) {
          resolve(null);
        }
      });
    }

    // Restaurer l'affichage du panneau
    panel.style.visibility = originalVisibility;
    btnScreenshot.disabled = false;

    if (dataUrl) {
      const b64 = dataUrl.split(',')[1];
      const captureName = `capture_pix_${Date.now().toString().slice(-4)}.png`;
      attachedFiles.push({
        name: captureName,
        type: 'image',
        size: Math.round(b64.length * 0.75),
        mimeType: 'image/png',
        previewUrl: dataUrl,
        geminiPart: {
          inlineData: {
            mimeType: 'image/png',
            data: b64
          }
        }
      });
      renderAttachedFiles();
      statusText.textContent = `> ${captureName} [CHARGÉ]`;
      showToast('Capture effectuée ✓');
    } else {
      statusText.textContent = '> error: capture_failed';
      alert('La capture d\'écran n\'a pas pu être effectuée. Vérifiez que l\'extension a accès aux onglets.');
    }
  }

  if (btnScreenshot) {
    btnScreenshot.addEventListener('click', takeChallengeScreenshot);
  }

  // --------------------------------------------------------------------------
  // Gestion des Fichiers (Images, PDF, Excel, Word, etc.)
  // --------------------------------------------------------------------------
  btnAttach.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      await handleFileUpload(f);
    }
    fileInput.value = '';
  });

  // Support Drag & Drop direct sur le panneau
  panel.addEventListener('dragover', (e) => {
    e.preventDefault();
    panel.style.borderColor = 'var(--pp-accent)';
  });

  panel.addEventListener('dragleave', (e) => {
    e.preventDefault();
    panel.style.borderColor = 'var(--pp-border)';
  });

  panel.addEventListener('drop', async (e) => {
    e.preventDefault();
    panel.style.borderColor = 'var(--pp-border)';
    const files = Array.from(e.dataTransfer.files || []);
    for (const f of files) {
      await handleFileUpload(f);
    }
  });

  async function handleFileUpload(file) {
    statusText.textContent = `Traitement de ${file.name}...`;
    try {
      const processed = await window.PixFileParser.processFile(file);
      attachedFiles.push(processed);
      renderAttachedFiles();
      statusText.textContent = `${file.name} ajouté`;
    } catch (err) {
      console.error(err);
      alert(`Erreur de lecture du fichier ${file.name}: ${err.message}`);
      statusText.textContent = 'Erreur fichier';
    }
  }

  function renderAttachedFiles() {
    attachmentsList.innerHTML = '';
    attachedFiles.forEach((file, index) => {
      const chip = document.createElement('div');
      chip.className = 'pp-file-chip';

      let iconSvg = '';
      if (file.type === 'image' && file.previewUrl) {
        iconSvg = `<img src="${file.previewUrl}" class="pp-file-chip-thumb" alt="vignette">`;
        chip.classList.add('has-preview');
        chip.title = "Cliquer pour afficher la capture en grand";
      } else if (file.type === 'image') {
        iconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
      } else if (file.type === 'spreadsheet') {
        iconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="8" y1="13" x2="16" y2="13"></line><line x1="8" y1="17" x2="16" y2="17"></line><line x1="10" y1="9" x2="8" y2="9"></line></svg>`;
      } else if (file.type === 'word') {
        iconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>`;
      } else if (file.type === 'pdf') {
        iconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>`;
      } else {
        iconSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>`;
      }

      const zoomIndicator = (file.type === 'image' && file.previewUrl) ? `<span class="pp-file-chip-zoom" title="Agrandir">🔍</span>` : '';

      chip.innerHTML = `
        ${iconSvg}
        <span class="pp-file-chip-name">${file.name}</span>
        ${zoomIndicator}
        <span class="pp-file-chip-remove" data-index="${index}" title="Supprimer">×</span>
      `;

      // Clic sur le chip ou la loupe pour afficher la capture en grand
      if (file.type === 'image' && file.previewUrl) {
        chip.addEventListener('click', (e) => {
          if (e.target.classList.contains('pp-file-chip-remove')) return;
          openImagePreview(file.name, file.previewUrl);
        });
      }

      attachmentsList.appendChild(chip);
    });

    // Écouteur pour suppression
    attachmentsList.querySelectorAll('.pp-file-chip-remove').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(e.target.dataset.index, 10);
        attachedFiles.splice(idx, 1);
        renderAttachedFiles();
      });
    });
  }

  // --------------------------------------------------------------------------
  // Scan Automatique de la Question Pix
  // --------------------------------------------------------------------------
  btnScan.addEventListener('click', async () => {
    btnScan.disabled = true;
    btnScan.innerHTML = `<span style="display:inline-block;animation:spin 1s linear infinite;">⏳</span> Scan en cours...`;

    try {
      extractedChallenge = await window.PixExtractor.extractCurrentChallenge();
      statusText.textContent = `Question scannée (${extractedChallenge.options.length} options)`;
      showToast('Question Pix analysée avec succès');

      // Si l'utilisateur clique sur Scan, lancer automatiquement la résolution si désiré
      await submitToGemini();
    } catch (err) {
      console.error(err);
      statusText.textContent = 'Erreur lors du scan';
    } finally {
      btnScan.disabled = false;
      btnScan.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 12h20M12 2v20"></path>
        </svg>
        Scanner la question
      `;
    }
  });

  // --------------------------------------------------------------------------
  // Soumission et Résolution Gemini
  // --------------------------------------------------------------------------
  btnSend.addEventListener('click', () => submitToGemini());

  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitToGemini();
    }
  });

  async function submitToGemini() {
    if (isGenerating) return;

    if (!config.apiKey) {
      openSettings();
      alert('Veuillez d\'abord saisir votre clé API Google Gemini.');
      return;
    }

    const manualPrompt = promptInput.value.trim();

    // Si on n'a ni question scannée, ni prompt manuel, ni fichier
    if (!extractedChallenge && !manualPrompt && attachedFiles.length === 0) {
      // Tenter un scan automatique silencieux
      extractedChallenge = await window.PixExtractor.extractCurrentChallenge();
    }

    // Préparation du prompt complet
    let fullPrompt = '';
    if (extractedChallenge && extractedChallenge.fullText) {
      fullPrompt += extractedChallenge.fullText + '\n\n';
    }

    if (manualPrompt) {
      fullPrompt += `Instructions ou précisions de l'utilisateur :\n${manualPrompt}\n\n`;
    } else if (!extractedChallenge) {
      fullPrompt += `Analyse les documents joints et fournis la réponse exacte pour l'exercice Pix.\n`;
    }

    fullPrompt += `Fournis impérativement la réponse exacte à copier dans les balises <answers><item>...</item></answers> et une explication synthétique dans <explanation>...</explanation>.`;

    // Nettoyer le champ de saisie
    promptInput.value = '';

    // Préparation de l'affichage
    if (emptyState) emptyState.style.display = 'none';

    // Création de la carte de résultat Style Console CMD / Ancien ChatGPT
    const resultCard = document.createElement('div');
    resultCard.className = 'pp-result-card';
    resultCard.innerHTML = `
      <div class="pp-console-cmdline">
        <span class="prompt">&gt;</span> pixpilot --detect-answers [STATUS: ANALYZING...]
      </div>

      <div class="pp-answer-banner">
        <div class="pp-answer-header">
          <div class="pp-answer-label">&gt; RÉPONSE(S) DÉTECTÉE(S)</div>
          <div id="pp-copy-all-container" class="pp-header-actions-group"></div>
        </div>
        <div id="pp-answers-display" class="pp-single-answer-box">
          <span style="color: var(--pp-text-muted); font-size: 12px;">&gt; Traitement du prompt et des données multimodales...</span>
        </div>
      </div>

      <div class="pp-explanation-section">
        <div class="pp-explanation-title">&gt; EXPLICATION &amp; DÉMARCHE :</div>
        <div class="pp-typewriter-text"><span class="pp-cursor"></span></div>
      </div>
    `;

    body.prepend(resultCard);

    const cmdLine = resultCard.querySelector('.pp-console-cmdline');
    const answersDisplay = resultCard.querySelector('#pp-answers-display');
    const copyAllContainer = resultCard.querySelector('#pp-copy-all-container');
    const typewriterText = resultCard.querySelector('.pp-typewriter-text');

    // Conserver les fichiers et l'énoncé pour la requête en cours
    const filesToSend = [...attachedFiles];
    const imagesToSend = extractedChallenge ? extractedChallenge.images : [];

    // Réinitialiser la file pour la prochaine question (évite le renvoi accidentel des anciennes captures)
    attachedFiles = [];
    extractedChallenge = null;
    renderAttachedFiles();

    isGenerating = true;
    btnSend.disabled = true;
    statusText.textContent = `> gemini --query in_progress...`;

    try {
      const response = await window.PixGemini.generateAnswer({
        apiKey: config.apiKey,
        model: config.model,
        userPrompt: fullPrompt,
        files: filesToSend,
        images: imagesToSend
      });

      if (cmdLine) {
        cmdLine.innerHTML = `<span class="prompt">&gt;</span> pixpilot --detect-answers [STATUS: 200 OK - ${response.answers.length} ANSWERS]`;
      }

      // 1. Affichage des Réponses Détectées (Une ou Plusieurs)
      renderAnswers(response.answers, answersDisplay, copyAllContainer);

      // 2. Animation d'écriture épurée pour l'explication (style ChatGPT classique)
      await runTypewriterAnimation(response.explanation, typewriterText);

      statusText.textContent = '> status: response_ready';
    } catch (err) {
      console.error(err);
      if (cmdLine) {
        cmdLine.innerHTML = `<span class="prompt" style="color:#ef4444;">&gt;</span> pixpilot [STATUS: 500 ERROR]`;
      }
      answersDisplay.innerHTML = `<span style="color: #ef4444; font-size: 12px;">&gt; Erreur : ${escapeHtml(err.message)}</span>`;
      typewriterText.innerHTML = `Vérifie ta clé API Gemini ou ta connexion.`;
      statusText.textContent = '> status: error';
    } finally {
      isGenerating = false;
      btnSend.disabled = false;
    }
  }

  // --------------------------------------------------------------------------
  // Rendu des Réponses Détectées (Unitaires ou Multiples) Style CMD
  // --------------------------------------------------------------------------
  function renderAnswers(answers, container, copyAllContainer) {
    container.innerHTML = '';
    copyAllContainer.innerHTML = '';

    if (!answers || answers.length === 0) {
      container.className = 'pp-single-answer-box';
      container.innerHTML = `<span style="color: var(--pp-text-secondary); font-size: 12px;">&gt; Aucune réponse isolée nette. Voir l'explication ci-dessous.</span>`;
      return;
    }

    // CAS 1 : UNE SEULE RÉPONSE
    if (answers.length === 1) {
      container.className = 'pp-single-answer-box';
      const ans = answers[0];

      const textEl = document.createElement('span');
      textEl.className = 'pp-answer-text';
      textEl.textContent = ans;

      const actionsWrap = document.createElement('div');
      actionsWrap.style.display = 'flex';
      actionsWrap.style.alignItems = 'center';
      actionsWrap.style.gap = '6px';

      const applyBtn = createApplyButton(answers);
      const copyBtn = createCopyButton(ans);

      actionsWrap.appendChild(applyBtn);
      actionsWrap.appendChild(copyBtn);

      container.appendChild(textEl);
      container.appendChild(actionsWrap);
      return;
    }

    // CAS 2 : PLUSIEURS RÉPONSES DÉTECTÉES (ex: Cases à cocher multiples)
    container.className = 'pp-multi-answers-grid';

    // Boutons d'action globale en haut à droite
    const applyAllBtn = createApplyButton(answers);
    copyAllContainer.appendChild(applyAllBtn);

    const copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'pp-btn-terminal-action';
    copyAllBtn.innerHTML = `[ 📋 TOUT COPIER (${answers.length}) ]`;
    copyAllBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(answers.join('\n'));
      copyAllBtn.innerHTML = `[ TOUT COPIÉ ✓ ]`;
      copyAllBtn.style.color = 'var(--pp-terminal-green)';
      setTimeout(() => {
        copyAllBtn.innerHTML = `[ 📋 TOUT COPIER (${answers.length}) ]`;
        copyAllBtn.style.color = '';
      }, 2000);
    });
    copyAllContainer.appendChild(copyAllBtn);

    // Liste des réponses individuelles
    answers.forEach((ans, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'pp-answer-item';

      const labelWrap = document.createElement('div');
      labelWrap.style.display = 'flex';
      labelWrap.style.alignItems = 'center';
      labelWrap.style.gap = '8px';

      const tag = document.createElement('span');
      tag.style.cssText = 'font-size: 10px; font-weight: bold; color: var(--pp-terminal-green);';
      tag.textContent = `[#${idx + 1}]`;

      const text = document.createElement('span');
      text.className = 'pp-answer-item-text';
      text.textContent = ans;

      labelWrap.appendChild(tag);
      labelWrap.appendChild(text);

      const copyBtn = createCopyButton(ans);

      itemEl.appendChild(labelWrap);
      itemEl.appendChild(copyBtn);
      container.appendChild(itemEl);
    });
  }

  function createCopyButton(textToCopy) {
    const btn = document.createElement('button');
    btn.className = 'pp-btn-terminal-action';
    btn.innerHTML = `[ 📋 COPIER ]`;

    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(textToCopy);
      btn.innerHTML = `[ COPIÉ ✓ ]`;
      btn.style.color = 'var(--pp-terminal-green)';
      setTimeout(() => {
        btn.innerHTML = `[ 📋 COPIER ]`;
        btn.style.color = '';
      }, 2000);
    });

    return btn;
  }

  function createApplyButton(answers) {
    const btn = document.createElement('button');
    btn.className = 'pp-btn-terminal-action primary';
    btn.innerHTML = `[ ⚡ APPLIQUER ]`;
    btn.title = "Cocher ou remplir automatiquement sur l'interface Pix";

    btn.addEventListener('click', () => {
      const count = window.PixExtractor?.autoApplyAnswers ? window.PixExtractor.autoApplyAnswers(answers) : 0;
      if (count > 0) {
        btn.innerHTML = `[ COCHÉ (${count}) ✓ ]`;
        showToast(`✓ ${count} proposition(s) cochée(s) sur Pix`);
      } else {
        btn.innerHTML = `[ 0 DÉTECTÉ ]`;
        showToast('Aucun champ correspondant détecté sur la page');
      }
      setTimeout(() => {
        btn.innerHTML = `[ ⚡ APPLIQUER ]`;
      }, 2500);
    });

    return btn;
  }

  // --------------------------------------------------------------------------
  // Animation d'Écriture (Ancien ChatGPT Typewriter avec Curseur Bloc █)
  // --------------------------------------------------------------------------
  async function runTypewriterAnimation(fullText, container) {
    const text = (fullText || '').trim();
    if (!text) {
      container.innerHTML = '<span style="color:var(--pp-text-muted);font-style:italic;">&gt; Pas d\'explication complémentaire nécessaire.</span>';
      return;
    }

    container.innerHTML = '';
    const textNode = document.createTextNode('');
    const cursor = document.createElement('span');
    cursor.className = 'pp-cursor';

    container.appendChild(textNode);
    container.appendChild(cursor);

    // Vitesse adaptée style terminal / ancien ChatGPT
    const stepSize = text.length > 300 ? 3 : 2;
    const delay = text.length > 300 ? 10 : 16;

    for (let i = 0; i < text.length; i += stepSize) {
      textNode.nodeValue = text.slice(0, i + stepSize);
      await new Promise(r => setTimeout(r, delay));
    }

    // Fin de frappe : convertir les balises markdown légères (**gras**, `code`)
    cursor.remove();
    container.innerHTML = formatLightMarkdown(text);
  }

  function formatLightMarkdown(str) {
    return escapeHtml(str)
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // --------------------------------------------------------------------------
  // Notification Toast éphémère
  // --------------------------------------------------------------------------
  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: absolute;
      top: 60px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--pp-bg-elevated);
      color: var(--pp-text-main);
      border: 1px solid var(--pp-border-hover);
      box-shadow: var(--pp-shadow-card);
      padding: 6px 14px;
      border-radius: var(--pp-radius-full);
      font-size: 12px;
      font-weight: 500;
      z-index: 20;
      opacity: 0;
      transition: opacity 0.2s ease;
      pointer-events: none;
    `;
    toast.textContent = message;
    panel.appendChild(toast);

    requestAnimationFrame(() => toast.style.opacity = '1');
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 250);
    }, 2200);
  }
})();
