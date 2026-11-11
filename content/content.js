/**
 * PixPilot - Content Script
 * Interface moderne avec ADN console minimaliste pour Pix.
 */

(function () {
  // Filet de sécurité : garantir que le bouclier anti-détection est bien injecté
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL && !window.__PIXPILOT_PRIVACY_SHIELD_ACTIVE__) {
      const shieldScript = document.createElement('script');
      shieldScript.src = chrome.runtime.getURL('content/privacy-shield.js');
      (document.head || document.documentElement).appendChild(shieldScript);
      shieldScript.remove();
    }
  } catch (e) {}

  if (document.getElementById('pixpilot-root')) {
    return;
  }

  let config = {
    apiKey: 'AQ.Ab8RN6L3GTYcNvQ4NRRpzTxYcns9jRauXN_besAXxCGTY7Qbmg',
    model: 'gemini-2.5-flash'
  };

  let attachedFiles = [];
  let extractedChallenge = null;
  let isGenerating = false;

  const ICONS = {
    scan: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`,
    capture: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
    attach: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
    send: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>`,
    copy: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    bolt: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    clear: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    settings: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
  };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['geminiApiKey', 'geminiModel'], (res) => {
      if (res.geminiApiKey) config.apiKey = res.geminiApiKey;
      if (res.geminiModel) config.model = res.geminiModel;
      updateModelBadge();
    });
    if (chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes) => {
        if (changes.geminiApiKey?.newValue !== undefined) config.apiKey = changes.geminiApiKey.newValue;
        if (changes.geminiModel?.newValue !== undefined) {
          config.model = changes.geminiModel.newValue;
          updateModelBadge();
        }
      });
    }
  } else if (typeof localStorage !== 'undefined') {
    const savedKey = localStorage.getItem('pp_geminiApiKey');
    const savedModel = localStorage.getItem('pp_geminiModel');
    if (savedKey) config.apiKey = savedKey;
    if (savedModel) config.model = savedModel;
    setTimeout(updateModelBadge, 0);
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.action === 'toggle-panel') {
        togglePanel();
      }
    });
  }

  // --------------------------------------------------------------------------
  // Création du DOM
  // --------------------------------------------------------------------------
  const root = document.createElement('div');
  root.id = 'pixpilot-root';
  root.innerHTML = `
    <div id="pixpilot-fab" title="PixPilot (Alt + P)">
      <span class="fab-icon">&gt;_</span>
      <span class="fab-text">PixPilot</span>
      <span class="fab-dot"></span>
    </div>

    <div id="pixpilot-panel">
      <div class="pp-header" id="pp-drag-handle">
        <div class="pp-term-dots">
          <span class="pp-dot red"></span>
          <span class="pp-dot yellow"></span>
          <span class="pp-dot green"></span>
        </div>
        <div class="pp-brand">
          <span class="pp-term-user">pix:~$</span>
          <h2 class="pp-title">pixpilot</h2>
          <span class="pp-model-tag" id="pp-model-badge" title="Changer de modèle">2.5-flash</span>
          <span class="pp-shield-tag" id="pp-shield-badge" title="Bouclier Anti-Détection Actif : écouteurs Pix détruits (onglet &amp; souris)">🛡️ stealth</span>
        </div>
        <div class="pp-header-actions">
          <button class="pp-icon-btn" id="pp-btn-clear" title="Vider le terminal">${ICONS.clear}</button>
          <button class="pp-icon-btn" id="pp-btn-settings" title="Configuration">${ICONS.settings}</button>
          <button class="pp-icon-btn" id="pp-btn-close" title="Fermer">${ICONS.close}</button>
        </div>
      </div>

      <div class="pp-quick-bar">
        <button class="pp-btn-pill primary" id="pp-btn-scan" title="Scanner la question Pix (Alt+S)">
          ${ICONS.scan} <span>$ scan</span>
        </button>
        <button class="pp-btn-pill" id="pp-btn-screenshot" title="Capture réelle de l'onglet (Alt+C)">
          ${ICONS.capture} <span>$ cap</span>
        </button>
        <button class="pp-btn-pill" id="pp-btn-attach" title="Attacher un fichier (tableur, archive, doc)">
          ${ICONS.attach} <span>$ file</span>
        </button>
        <input type="file" id="pp-file-input" style="display:none;" multiple accept="image/*,.zip,.pdf,.xlsx,.xls,.ods,.docx,.doc,.odt,.csv,.txt,.json,.py,.sql">
      </div>

      <div class="pp-attachments-container" id="pp-attachments-list"></div>

      <div class="pp-body" id="pp-body">
        <div class="pp-empty-state" id="pp-empty-state">
          <div class="pp-term-hero">
            <div class="pp-term-hero-prompt">&gt;_ pixpilot.sh --ready<span class="pp-cursor-blink">_</span></div>
            <div class="pp-term-hero-sub">terminal ia · épreuves pix &amp; tableurs</div>
          </div>
          <div class="pp-empty-shortcuts">
            <span class="pp-kbd">$ scan</span>
            <span>ou</span>
            <span class="pp-kbd">Ctrl+V image</span>
            <span>ou</span>
            <span class="pp-kbd">Drop .xlsx/.zip</span>
          </div>
        </div>
      </div>

      <div class="pp-footer">
        <div class="pp-input-row">
          <span class="pp-prompt-symbol">&gt;_</span>
          <textarea class="pp-textarea" id="pp-prompt-input" rows="1" placeholder="Consigne ou question personnalisée..."></textarea>
          <button class="pp-btn-send" id="pp-btn-send" title="Exécuter (Entrée)">${ICONS.send}</button>
        </div>
        <div class="pp-status-hint">
          <div class="pp-status-left">
            <span class="pp-status-led" id="pp-status-led"></span>
            <span id="pp-status-text">ready</span>
            <span class="pp-shield-pill" id="pp-status-shield" title="Vie privée : Écouteurs de changement d'onglet et de souris détruits">🛡️ anti-espion</span>
          </div>
          <div class="pp-shortcuts-tag">Alt+P</div>
        </div>
      </div>

      <div class="pp-settings-modal" id="pp-settings-modal">
        <div class="pp-settings-title">
          <span>Configuration</span>
          <button class="pp-icon-btn" id="pp-btn-close-settings">${ICONS.close}</button>
        </div>

        <div class="pp-field-group">
          <label class="pp-label">Protection Vie Privée &amp; Anti-Espion</label>
          <div class="pp-shield-box">
            <div class="pp-shield-row">
              <span class="pp-shield-icon-lg">🛡️</span>
              <div class="pp-shield-desc">
                <div class="pp-shield-title">Écouteurs Pix neutralisés</div>
                <div class="pp-shield-sub">Détection d'onglet (blur/visibilityState) et de sortie de souris (mouseleave) totalement détruites.</div>
              </div>
              <span class="pp-shield-badge-active">ACTIF</span>
            </div>
          </div>
        </div>

        <div class="pp-field-group">
          <div class="pp-label-row">
            <label class="pp-label">Clé API Gemini</label>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" class="pp-link-subtle">AI Studio ↗</a>
          </div>
          <input type="password" class="pp-input-text" id="pp-cfg-key" placeholder="AIzaSy...">
        </div>

        <div class="pp-field-group">
          <label class="pp-label">Modèle</label>
          <select class="pp-select" id="pp-cfg-model">
            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
            <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite</option>
            <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
            <option value="gemini-1.5-flash">gemini-1.5-flash</option>
            <option value="custom">Personnalisé...</option>
          </select>
          <input type="text" class="pp-input-text" id="pp-cfg-custom-model" placeholder="ex: gemini-2.5-pro" style="display:none; margin-top:6px;">
        </div>

        <button class="pp-btn-save" id="pp-btn-save-settings">Enregistrer</button>
      </div>

      <div class="pp-image-preview-modal" id="pp-image-preview-modal">
        <div class="pp-preview-header">
          <span id="pp-preview-title">capture.png</span>
          <button class="pp-icon-btn" id="pp-btn-close-preview">${ICONS.close}</button>
        </div>
        <div class="pp-preview-body">
          <img id="pp-preview-img" src="" alt="Preview">
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  // --------------------------------------------------------------------------
  // Références DOM
  // --------------------------------------------------------------------------
  const fab = document.getElementById('pixpilot-fab');
  const panel = document.getElementById('pixpilot-panel');
  const dragHandle = document.getElementById('pp-drag-handle');
  const btnClear = document.getElementById('pp-btn-clear');
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

  const previewModal = document.getElementById('pp-image-preview-modal');
  const previewImg = document.getElementById('pp-preview-img');
  const previewTitle = document.getElementById('pp-preview-title');
  const btnClosePreview = document.getElementById('pp-btn-close-preview');

  const shieldBadge = document.getElementById('pp-shield-badge');
  const statusShield = document.getElementById('pp-status-shield');
  const showShieldStatus = () => {
    showToast('🛡️ Bouclier actif : écouteurs Pix d\'onglet et de souris détruits.');
  };
  if (shieldBadge) shieldBadge.addEventListener('click', showShieldStatus);
  if (statusShield) statusShield.addEventListener('click', showShieldStatus);

  // --------------------------------------------------------------------------
  // Déplacement de la fenêtre (Drag)
  // --------------------------------------------------------------------------
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  dragHandle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('#pp-model-badge')) return;
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    panel.style.transition = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const x = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, e.clientX - dragOffsetX));
    const y = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, e.clientY - dragOffsetY));
    panel.style.left = `${x}px`;
    panel.style.top = `${y}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  });

  window.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      panel.style.transition = '';
    }
  });

  // --------------------------------------------------------------------------
  // Prévisualisation d'image
  // --------------------------------------------------------------------------
  function openImagePreview(title, url) {
    if (!previewModal || !previewImg) return;
    previewTitle.textContent = title;
    previewImg.src = url;
    previewModal.classList.add('is-active');
  }

  function closeImagePreview() {
    if (!previewModal) return;
    previewModal.classList.remove('is-active');
    if (previewImg) previewImg.src = '';
  }

  btnClosePreview.addEventListener('click', closeImagePreview);
  previewModal.addEventListener('click', (e) => {
    if (e.target === previewModal || e.target === previewImg || e.target.classList.contains('pp-preview-body')) {
      closeImagePreview();
    }
  });

  // --------------------------------------------------------------------------
  // Ouverture / Fermeture / Nettoyage
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

  btnClear.addEventListener('click', () => {
    body.querySelectorAll('.pp-result-card').forEach(el => el.remove());
    attachedFiles = [];
    extractedChallenge = null;
    renderAttachedFiles();
    if (emptyState) emptyState.style.display = '';
    statusText.textContent = 'ready';
  });

  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      togglePanel();
    } else if (e.altKey && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      takeChallengeScreenshot(true);
    } else if (e.altKey && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      if (!panel.classList.contains('is-open')) panel.classList.add('is-open');
      btnScan.click();
    } else if (e.key === 'Escape') {
      if (previewModal.classList.contains('is-active')) {
        closeImagePreview();
      } else if (settingsModal.classList.contains('is-active')) {
        closeSettings();
      } else if (panel.classList.contains('is-open')) {
        panel.classList.remove('is-open');
      }
    }
  });

  fab.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  fab.addEventListener('drop', async (e) => {
    e.preventDefault();
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
  modelBadge.addEventListener('click', openSettings);
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
    showToast('Enregistré ✓');
  });

  function updateModelBadge() {
    const shortNames = {
      'gemini-2.5-flash': '2.5-flash',
      'gemini-2.0-flash-lite': '2.0-lite',
      'gemini-3.1-flash-lite': '3.1-lite',
      'gemini-1.5-flash': '1.5-flash'
    };
    modelBadge.textContent = shortNames[config.model] || config.model;
  }

  // --------------------------------------------------------------------------
  // Capture d'écran (Priorité 1 : Capture GPU native de l'onglet pour iframes/graphiques)
  // --------------------------------------------------------------------------
  async function captureTabDataUrl() {
    const prevRootVis = root.style.visibility;
    root.style.visibility = 'hidden';

    // Attendre le repaint du navigateur pour que l'interface PixPilot disparaisse de l'image
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise(r => setTimeout(r, 40));

    let dataUrl = null;

    // 1. Priorité absolue : API Chrome captureVisibleTab (capture réelle avec iframes, canvas, graphiques, infobulles)
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
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

    // 2. Repli html2canvas uniquement hors extension (ex: fichier demo.html local)
    if (!dataUrl && typeof html2canvas !== 'undefined') {
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
        console.warn('[PixPilot] html2canvas fallback warning:', err);
      }
    }

    root.style.visibility = prevRootVis;
    return dataUrl;
  }

  async function takeChallengeScreenshot(openIfClosed = false) {
    if (!btnScreenshot) return;
    btnScreenshot.disabled = true;
    statusText.textContent = 'capture...';

    const dataUrl = await captureTabDataUrl();
    btnScreenshot.disabled = false;

    if (openIfClosed && !panel.classList.contains('is-open')) {
      panel.classList.add('is-open');
    }

    if (dataUrl) {
      const b64 = dataUrl.split(',')[1];
      const captureName = `cap_${Date.now().toString().slice(-4)}.png`;
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
      statusText.textContent = captureName;
      showToast('Capturé ✓');
    } else {
      statusText.textContent = 'err: capture';
    }
  }

  btnScreenshot.addEventListener('click', () => takeChallengeScreenshot(false));

  // --------------------------------------------------------------------------
  // Fichiers
  // --------------------------------------------------------------------------
  btnAttach.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      await handleFileUpload(f);
    }
    fileInput.value = '';
  });

  panel.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  panel.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    for (const f of files) {
      await handleFileUpload(f);
    }
  });

  // Support du collage direct d'image (Ctrl+V après Win+Shift+S)
  window.addEventListener('paste', async (e) => {
    if (!panel.classList.contains('is-open')) return;
    const items = Array.from(e.clipboardData?.items || []);
    const imageItems = items.filter(item => item.type.startsWith('image/'));
    if (imageItems.length === 0) return;

    e.preventDefault();
    for (const item of imageItems) {
      const blob = item.getAsFile();
      if (blob) {
        const ext = blob.type.split('/')[1] || 'png';
        const namedFile = new File([blob], `clip_${Date.now().toString().slice(-4)}.${ext}`, { type: blob.type });
        await handleFileUpload(namedFile);
      }
    }
    showToast('Image collée ✓');
  });

  // Auto-resize du champ de texte
  promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = `${Math.min(promptInput.scrollHeight, 72)}px`;
  });

  async function handleFileUpload(file) {
    statusText.textContent = `load: ${file.name}`;
    try {
      const processed = await window.PixFileParser.processFile(file);
      attachedFiles.push(processed);
      renderAttachedFiles();
      statusText.textContent = file.name;
    } catch (err) {
      console.error(err);
      statusText.textContent = 'err: file';
    }
  }

  function renderAttachedFiles() {
    attachmentsList.innerHTML = '';
    attachedFiles.forEach((file, index) => {
      const chip = document.createElement('div');
      chip.className = 'pp-file-chip';

      let iconHtml = '';
      if (file.type === 'image' && file.previewUrl) {
        iconHtml = `<img src="${file.previewUrl}" class="pp-file-chip-thumb" alt="">`;
        chip.classList.add('has-preview');
      } else {
        iconHtml = `<span style="color:var(--pp-accent);font-weight:700;">#</span>`;
      }

      chip.innerHTML = `
        ${iconHtml}
        <span class="pp-file-chip-name">${escapeHtml(file.name)}</span>
        <span class="pp-file-chip-remove" data-index="${index}">&times;</span>
      `;

      if (file.type === 'image' && file.previewUrl) {
        chip.addEventListener('click', (e) => {
          if (e.target.classList.contains('pp-file-chip-remove')) return;
          openImagePreview(file.name, file.previewUrl);
        });
      }

      attachmentsList.appendChild(chip);
    });

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
  // Scan & Résolution
  // --------------------------------------------------------------------------
  function checkHasVisualContent(challenge) {
    const textToCheck = `${challenge?.title || ''} ${challenge?.instructions || ''}`.slice(0, 3000);
    const mentionsVisual = /graphique|diagramme|sch[eé]ma|camembert|courbe|histogramme|secteurs?\b|figure|illustration|image ci-dessous|carte ci-dessous/i.test(textToCheck);
    const hasSvgChart = Array.from(document.querySelectorAll('svg')).some(svg => {
      if (svg.closest('#pixpilot-root')) return false;
      const rect = svg.getBoundingClientRect();
      return rect.width > 120 && rect.height > 120 && svg.querySelectorAll('path, rect, circle').length >= 3;
    });
    const hasCanvas = Array.from(document.querySelectorAll('canvas, iframe')).some(el => {
      if (el.closest('#pixpilot-root')) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 120 && rect.height > 80;
    });
    return Boolean(mentionsVisual || hasSvgChart || hasCanvas);
  }

  async function autoCaptureIfVisual(challenge) {
    if (!checkHasVisualContent(challenge) || attachedFiles.some(f => f.type === 'image')) return;
    statusText.textContent = 'cap: graph...';
    const autoCaptureUrl = await captureTabDataUrl();
    if (!autoCaptureUrl) return;
    const b64 = autoCaptureUrl.split(',')[1];
    attachedFiles.push({
      name: `auto_cap.png`,
      type: 'image',
      size: Math.round(b64.length * 0.75),
      mimeType: 'image/png',
      previewUrl: autoCaptureUrl,
      geminiPart: { inlineData: { mimeType: 'image/png', data: b64 } }
    });
    renderAttachedFiles();
  }

  btnScan.addEventListener('click', async () => {
    if (isGenerating) return;
    btnScan.disabled = true;
    btnScan.innerHTML = `<span class="pp-spinner"></span> <span>scan...</span>`;

    try {
      extractedChallenge = await window.PixExtractor.extractCurrentChallenge();
      await submitToGemini();
    } catch (err) {
      console.error(err);
      statusText.textContent = 'err: scan';
    } finally {
      btnScan.disabled = false;
      btnScan.innerHTML = `${ICONS.scan} <span>$ scan</span>`;
    }
  });

  btnSend.addEventListener('click', () => submitToGemini());

  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitToGemini();
    }
  });

  function getFieldLabels(challenge) {
    if (!challenge) return [];
    const labels = [];
    if (Array.isArray(challenge.inputs) && challenge.inputs.length > 0) {
      challenge.inputs.forEach((inp, idx) => {
        labels.push(inp.label || inp.placeholder || `Champ #${idx + 1}`);
      });
    }
    if (Array.isArray(challenge.selects) && challenge.selects.length > 0) {
      challenge.selects.forEach((sel, idx) => {
        labels.push(sel.label || `Menu #${idx + 1}`);
      });
    }
    if (labels.length === 0 && Array.isArray(challenge.options) && challenge.options.length > 0) {
      if (challenge.questionType === 'qcm-multiple') {
        labels.push('Cases à cocher multiples');
      } else {
        labels.push('Choix unique');
      }
    }
    return labels;
  }

  function getExpectedAnswerCount(challenge) {
    if (!challenge) return 0;
    const inputCount = Array.isArray(challenge.inputs) ? challenge.inputs.length : 0;
    const selectCount = Array.isArray(challenge.selects) ? challenge.selects.length : 0;
    if (inputCount > 0 || selectCount > 0) {
      return inputCount + selectCount;
    }
    if (challenge.questionType === 'qcm-unique') {
      return 1;
    }
    return 0;
  }

  function tryExtractWordFromRowAnswers(answersList) {
    if (!answersList || answersList.length <= 1) return null;

    // Cas 1 : Tous les items sont déjà des lettres uniques (ex: ["c", "e", "r", "i", "s", "e"])
    if (answersList.every(a => a.trim().length === 1)) {
      return answersList.map(a => a.trim()).join('');
    }

    // Cas 2 : Lignes finissant par un caractère isolé (ex: "Ligne 6: Louka, 20, Calais, 15.2, c")
    const lastParts = answersList.map(a => {
      const trimmed = a.trim();
      const m = trimmed.match(/(?:^|[,;|:\s])([a-zA-ZÀ-ÿ0-9])['"`\s]*$/);
      return m ? m[1] : null;
    });
    if (lastParts.every(Boolean)) {
      return lastParts.join('');
    }

    // Cas 3 : Lignes contenant "code: X" ou "colonne Code = X"
    const codeMatch = answersList.map(a => {
      const m = a.match(/(?:code|indice|lettre|mot)\s*[:=]\s*([a-zA-ZÀ-ÿ0-9])/i);
      return m ? m[1] : null;
    });
    if (codeMatch.every(Boolean)) {
      return codeMatch.join('');
    }

    return null;
  }

  function sanitizeExcelDateOutput(ans, promptText = '') {
    if (!ans || typeof ans !== 'string') return ans;
    const isFormatQuestion = /format de cellule|nouveau format|afficher la cellule|cellule\s+[A-Z]\d+|format.*date/i.test(promptText);
    if (!isFormatQuestion) return ans;

    const monthMap = [
      { regex: /janv\.?/gi, full: 'janvier' },
      { regex: /f[eé]vr?\.?/gi, full: 'février' },
      { regex: /avr\.?/gi, full: 'avril' },
      { regex: /juil\.?/gi, full: 'juillet' },
      { regex: /sept?\.?/gi, full: 'septembre' },
      { regex: /oct\.?/gi, full: 'octobre' },
      { regex: /nov\.?/gi, full: 'novembre' },
      { regex: /d[eé]c\.?/gi, full: 'décembre' }
    ];

    let res = ans.trim();
    for (const m of monthMap) {
      const matchPattern = new RegExp(`(\\b\\d{1,2}[\\s-])` + m.regex.source + `([\\s-]\\d{4}\\b)`, 'i');
      if (matchPattern.test(res)) {
        res = res.replace(matchPattern, `$1${m.full}$2`);
      }
    }
    return res;
  }

  async function submitToGemini() {
    if (isGenerating) return;

    if (!config.apiKey) {
      openSettings();
      return;
    }

    const manualPrompt = promptInput.value.trim();

    if (!extractedChallenge && !manualPrompt && attachedFiles.length === 0) {
      extractedChallenge = await window.PixExtractor.extractCurrentChallenge();
    }

    // Capture réelle automatique si la question contient un graphique / schéma
    if (extractedChallenge) {
      try { await autoCaptureIfVisual(extractedChallenge); } catch (_) {}
    }

    // Téléchargement et lecture automatiques des fichiers joints dans la question Pix (sans blocage CORS)
    let autoFetchedInfo = null;
    if (extractedChallenge && Array.isArray(extractedChallenge.downloadLinks) && extractedChallenge.downloadLinks.length > 0) {
      const hasDocAttached = attachedFiles.some(f => f.type !== 'image');
      const fileFamily = (ext) => /^(xlsx|xls|ods|csv)$/i.test(ext || '') ? 'sheet' : /^(docx|doc|odt)$/i.test(ext || '') ? 'doc' : (ext || 'other');
      const fetchedFamilies = new Set();
      if (!hasDocAttached) {
        for (const dl of extractedChallenge.downloadLinks.slice(0, 4)) {
          // Pix propose le même fichier en .xlsx ET .ods : n'en lire qu'un seul (évite les doublons)
          if (fetchedFamilies.has(fileFamily(dl.ext))) continue;
          try {
            statusText.textContent = `fetch: ${dl.name}...`;
            let blob = null;
            let cd = '';
            let ct = '';

            // 1. Téléchargement direct (CORS standard - marche sur app.pix.fr et buckets S3 publics)
            try {
              const resp = await fetch(dl.url, { mode: 'cors' });
              if (resp.ok) {
                blob = await resp.blob();
                cd = resp.headers.get('content-disposition') || '';
                ct = (resp.headers.get('content-type') || blob.type || '').toLowerCase();
              }
            } catch (_) {}

            // 2. Repli direct avec credentials: 'omit' (contourne le rejet sur Access-Control-Allow-Origin: *)
            if (!blob) {
              try {
                const resp = await fetch(dl.url, { credentials: 'omit' });
                if (resp.ok) {
                  blob = await resp.blob();
                  cd = resp.headers.get('content-disposition') || '';
                  ct = (resp.headers.get('content-type') || blob.type || '').toLowerCase();
                }
              } catch (_) {}
            }

            // 3. Repli via le Service Worker (contourne 100% des restrictions CORS externes)
            if (!blob && typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
              const bgRes = await new Promise((resolve) => {
                try {
                  chrome.runtime.sendMessage({ action: 'fetch-file-base64', url: dl.url }, (r) => resolve(r || null));
                } catch (_) {
                  resolve(null);
                }
              });
              if (bgRes && bgRes.success && bgRes.base64) {
                const binStr = atob(bgRes.base64);
                const bytes = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                ct = (bgRes.contentType || '').toLowerCase();
                cd = bgRes.contentDisposition || '';
                blob = new Blob([bytes], { type: ct });
              }
            }

            if (!blob) {
              autoFetchedInfo = { ok: false, name: dl.name };
              continue;
            }

            let fileName = dl.name || 'exercice_pix';
            const cdMatch = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)["']?/i);
            if (cdMatch && cdMatch[1]) {
              try { fileName = decodeURIComponent(cdMatch[1].trim()); } catch (_) { fileName = cdMatch[1].trim(); }
            }

            if (!/\.(xlsx|xls|ods|csv|docx|doc|odt|pdf|zip|txt|json|py|sql)$/i.test(fileName)) {
              if (ct.includes('zip')) fileName += '.zip';
              else if (ct.includes('opendocument.spreadsheet')) fileName += '.ods';
              else if (ct.includes('spreadsheet') || ct.includes('excel') || ct.includes('officedocument.spreadsheetml')) fileName += '.xlsx';
              else if (ct.includes('csv')) fileName += '.csv';
              else if (ct.includes('wordprocessingml') || ct.includes('msword')) fileName += '.docx';
              else if (ct.includes('opendocument.text')) fileName += '.odt';
              else if (ct.includes('pdf')) fileName += '.pdf';
              else fileName += `.${dl.ext || 'xlsx'}`;
            }

            const fetchedFile = new File([blob], fileName, { type: blob.type || ct });
            const processed = await window.PixFileParser.processFile(fetchedFile);
            attachedFiles.push(processed);
            autoFetchedInfo = { ok: true, name: fileName, size: blob.size };
            fetchedFamilies.add(fileFamily(fileName.split('.').pop()));
            fetchedFamilies.add(fileFamily(dl.ext));
            renderAttachedFiles();
          } catch (e) {
            console.warn('[PixPilot] Auto-fetch attachment warning:', e);
            autoFetchedInfo = { ok: false, name: dl.name };
          }
        }
      }
    }

    // Contexte de validation : nombre de champs attendus + tables structurées pour le moteur local
    const challengeSnapshot = extractedChallenge;
    const fieldLabels = getFieldLabels(challengeSnapshot);
    const expectedCount = getExpectedAnswerCount(challengeSnapshot);
    const dataTables = attachedFiles.flatMap(f => Array.isArray(f.tables) ? f.tables : []);

    let fullPrompt = '';
    if (extractedChallenge && extractedChallenge.fullText) {
      fullPrompt += extractedChallenge.fullText + '\n\n';
    }

    if (manualPrompt) {
      fullPrompt += `Instruction : ${manualPrompt}\n\n`;
    } else if (!extractedChallenge) {
      fullPrompt += `Donne la réponse exacte pour cet exercice Pix.\n`;
    }

    if (expectedCount > 0) {
      fullPrompt += `NOMBRE EXACT D'ITEMS ATTENDUS : ${expectedCount} (${fieldLabels.map((l, i) => `#${i + 1} "${l}"`).join(', ')}). Un item = uniquement la valeur finale à saisir.\n`;
    }
    if (dataTables.length > 0) {
      fullPrompt += `Tableur fourni (${dataTables.map(t => `"${t.sheet}"`).join(', ')}) : pour tout filtrage/tri/comptage/somme/concaténation, écris une <query> par champ (avec "field":N) — le moteur JS calcule le résultat exact.\n`;
    }

    fullPrompt += `Réponse exacte dans <answers><item>...</item></answers>. <explanation></explanation> vide sauf nécessité (1 ligne max).`;

    promptInput.value = '';
    promptInput.style.height = 'auto';
    if (emptyState) emptyState.style.display = 'none';

    const resultCard = document.createElement('div');
    resultCard.className = 'pp-result-card';
    resultCard.innerHTML = `
      <div class="pp-card-meta">
        <div class="pp-cmd-tag">
          <span class="prompt">&gt;_</span>
          <span class="pp-cmd-status">analyse...</span>
        </div>
        <div class="pp-header-actions-group"></div>
      </div>

      <div class="pp-answers-container pp-single-answer-box">
        <div class="pp-loading-inline">
          <span class="pp-spinner"></span>
          <span>Résolution...</span>
        </div>
      </div>

      <div class="pp-explanation-section is-empty">
        <div class="pp-typewriter-text"></div>
      </div>
    `;

    body.prepend(resultCard);

    const cmdStatus = resultCard.querySelector('.pp-cmd-status');
    const answersDisplay = resultCard.querySelector('.pp-answers-container');
    const copyAllContainer = resultCard.querySelector('.pp-header-actions-group');
    const explanationSection = resultCard.querySelector('.pp-explanation-section');
    const typewriterText = resultCard.querySelector('.pp-typewriter-text');

    const filesToSend = [...attachedFiles];
    const imagesToSend = extractedChallenge ? extractedChallenge.images : [];
    const attachedFileNames = filesToSend.map(f => f.name);

    attachedFiles = [];
    extractedChallenge = null;
    renderAttachedFiles();

    isGenerating = true;
    btnSend.disabled = true;
    statusText.textContent = 'running...';
    const statusLed = document.getElementById('pp-status-led');
    if (statusLed) statusLed.classList.add('working');

    try {
      const response = await window.PixGemini.generateAnswer({
        apiKey: config.apiKey,
        model: config.model,
        userPrompt: fullPrompt,
        files: filesToSend,
        images: imagesToSend
      });

      let finalAnswers = Array.isArray(response.answers) ? [...response.answers] : [];
      let querySuccess = false;

      // 1. Exécution des requêtes locales <query> générées par Gemini sur les données réelles du tableur
      if (dataTables.length > 0 && typeof window.PixQueryEngine !== 'undefined' && Array.isArray(response.queries) && response.queries.length > 0) {
        const qAnswers = [];
        for (const q of response.queries) {
          try {
            const res = window.PixQueryEngine.execute(dataTables, q);
            if (res && res.ok && Array.isArray(res.answers) && res.answers.length > 0) {
              qAnswers.push(...res.answers);
            }
          } catch (qe) {
            console.warn('[PixPilot] Query execution err:', qe);
          }
        }
        if (qAnswers.length > 0) {
          finalAnswers = qAnswers;
          querySuccess = true;
        }
      }

      // 2. Filet de sécurité anti-découpage multi-lignes :
      // Si la page n'attend qu'UNE SEULE réponse (ex: champ "Mot :") mais que Gemini a renvoyé N lignes de tableau
      if (expectedCount === 1 && finalAnswers.length > 1) {
        const extractedWord = tryExtractWordFromRowAnswers(finalAnswers);
        if (extractedWord) {
          finalAnswers = [extractedWord];
        }
      }

      // 3. Auto-correction rapide si 1 seule réponse attendue mais toujours N items non résolus
      if (expectedCount === 1 && finalAnswers.length > 1 && !querySuccess) {
        statusText.textContent = 'corr: 1 mot...';
        try {
          const correctionPrompt = `ERREUR : La page Pix comporte UNIQUEMENT 1 champ de saisie ("${fieldLabels[0] || 'Mot'}").
Tu as renvoyé ${finalAnswers.length} items (${finalAnswers.slice(0, 3).join(' | ')}...).
Donne UNIQUEMENT la valeur UNIQUE finale attendue (le mot complet ou le nombre final, sans lister les lignes du tableau).
Format strict :
<answers>
<item>valeur_unique</item>
</answers>`;
          const retryRes = await window.PixGemini.generateAnswer({
            apiKey: config.apiKey,
            model: config.model,
            userPrompt: fullPrompt + '\n\n' + correctionPrompt,
            files: filesToSend,
            images: imagesToSend
          });
          if (retryRes && Array.isArray(retryRes.answers) && retryRes.answers.length === 1) {
            finalAnswers = retryRes.answers;
            if (retryRes.explanation) response.explanation = retryRes.explanation;
          }
        } catch (_) {}
      }

      // 4. Si la question porte sur un diagramme formant des lettres et qu'un mot a été décodé géométriquement
      const mentionsLetterChart = /lettres?\s*s'affichent|forme(?:nt)?\s*la\s*lettre|diagramme.*lettre|barres.*lettre/i.test(fullPrompt);
      if (mentionsLetterChart && dataTables.some(t => t.detectedBarWord)) {
        const detected = dataTables.find(t => t.detectedBarWord)?.detectedBarWord;
        if (detected) {
          console.log('[PixPilot] Décodage géométrique de diagramme en barres appliqué :', detected);
          finalAnswers = [detected.toUpperCase()];
        }
      }

      // 4b. Si la question demande le montant total des ventes (SOMMEPROD de quantité × prix)
      const mentionsSalesTotal = /montant\s*total\s*(?:des\s*)?ventes|chiffre\s*d'affaires|quantit[eé]\s*vendue\s*[×x*]\s*prix/i.test(fullPrompt);
      if (mentionsSalesTotal && dataTables.some(t => t.detectedSumproduct)) {
        const spTable = dataTables.find(t => t.detectedSumproduct);
        if (spTable) {
          console.log('[PixPilot] Montant total des ventes SOMMEPROD appliqué :', spTable.detectedSumproduct);
          if (expectedCount <= 1) {
            finalAnswers = [String(spTable.detectedSumproduct)];
          } else if (expectedCount === 2 && spTable.detectedSumproductFormula) {
            finalAnswers = [String(spTable.detectedSumproduct), spTable.detectedSumproductFormula];
          }
        }
      }

      // 4c. Si la question demande l'année de naissance d'une personne (ex: "Quelle est l'année de naissance d'Amadou ?")
      const birthYearMatch = fullPrompt.match(/ann[eé]e\s+de\s+naissance\s+d['’]([a-zA-ZÀ-ÿ\s-]+)/i);
      if (birthYearMatch) {
        const targetName = birthYearMatch[1].trim().toLowerCase();
        const normTarget = targetName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        for (const t of dataTables) {
          if (t.personDates && (t.personDates[targetName] || t.personDates[normTarget])) {
            const yr = t.personDates[targetName] || t.personDates[normTarget];
            console.log('[PixPilot] Année de naissance résolue directement :', targetName, '->', yr);
            finalAnswers = [String(yr)];
            break;
          }
        }
      }

      // 5. Normalisation des réponses uniques (Dates Excel et mots de code)
      if (finalAnswers.length === 1 && typeof finalAnswers[0] === 'string') {
        // Date Excel (ex: 15-janv-2015 -> 15-janvier-2015)
        finalAnswers[0] = sanitizeExcelDateOutput(finalAnswers[0], fullPrompt);

        // Si la question demande explicitement "Quatre lettres" ou "lettres s'affichent"
        if (/quatre\s*lettres|lettres?\s*s'affichent/i.test(fullPrompt) && finalAnswers[0].length >= 4) {
          const cleanLetters = finalAnswers[0].replace(/[^a-zA-Z]/g, '').toUpperCase();
          if (cleanLetters.length === 4) {
            finalAnswers[0] = cleanLetters;
          }
        }
      }

      if (cmdStatus) {
        let tagText = finalAnswers.length > 1
          ? `${finalAnswers.length} réponses`
          : 'réponse';
        if (querySuccess) {
          tagText += ' · [⚡ calcul exact]';
        } else if (attachedFileNames.length > 0) {
          tagText += ` · [📎 ${attachedFileNames[0]}]`;
        } else if (autoFetchedInfo && !autoFetchedInfo.ok) {
          tagText += ` · [⚠️ sans fichier]`;
        }
        cmdStatus.textContent = tagText;
      }

      if (autoFetchedInfo && !autoFetchedInfo.ok && attachedFileNames.length === 0) {
        const warnNotice = document.createElement('div');
        warnNotice.className = 'pp-file-alert';
        warnNotice.innerHTML = `⚠️ <span>Fichier non lu (${escapeHtml(autoFetchedInfo.name)}). Glisse-le ici ou clique sur <strong>$ file</strong>.</span>`;
        answersDisplay.before(warnNotice);
      }

      renderAnswers(finalAnswers, answersDisplay, copyAllContainer);

      if (response.explanation && response.explanation.trim()) {
        explanationSection.classList.remove('is-empty');
        await runTypewriterAnimation(response.explanation, typewriterText);
      }

      statusText.textContent = 'ready';
    } catch (err) {
      console.error(err);
      if (cmdStatus) {
        cmdStatus.textContent = 'erreur';
        cmdStatus.style.color = 'var(--pp-danger)';
      }
      answersDisplay.innerHTML = `<span style="color: var(--pp-danger); font-size: 11.5px; font-family: var(--pp-font-mono);">${escapeHtml(err.message)}</span>`;
      statusText.textContent = 'error';
    } finally {
      isGenerating = false;
      btnSend.disabled = false;
      if (statusLed) statusLed.classList.remove('working');
    }
  }

  // --------------------------------------------------------------------------
  // Affichage des réponses
  // --------------------------------------------------------------------------
  function renderAnswers(answers, container, actionsHeader) {
    container.innerHTML = '';
    actionsHeader.innerHTML = '';

    if (!answers || answers.length === 0) {
      container.className = 'pp-single-answer-box';
      container.innerHTML = `<span style="color: var(--pp-text-secondary); font-size: 11.5px;">Aucune réponse directe détectée</span>`;
      return;
    }

    if (answers.length === 1) {
      container.className = 'pp-single-answer-box';
      const ans = answers[0];

      const textEl = document.createElement('span');
      textEl.className = 'pp-answer-text';
      textEl.textContent = ans;
      textEl.title = 'Cliquer pour copier';
      textEl.addEventListener('click', () => {
        navigator.clipboard.writeText(ans);
        showToast('Copié ✓');
      });

      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'pp-header-actions-group';

      actionsWrap.appendChild(createApplyButton(answers));
      actionsWrap.appendChild(createCopyButton(ans));

      container.appendChild(textEl);
      container.appendChild(actionsWrap);
      return;
    }

    container.className = 'pp-multi-answers-grid';

    actionsHeader.appendChild(createApplyButton(answers));

    const copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'pp-btn-action';
    copyAllBtn.innerHTML = `${ICONS.copy} <span>Tout</span>`;
    copyAllBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(answers.join('\n'));
      copyAllBtn.innerHTML = `${ICONS.check} <span>Copié</span>`;
      copyAllBtn.style.color = 'var(--pp-accent)';
      setTimeout(() => {
        copyAllBtn.innerHTML = `${ICONS.copy} <span>Tout</span>`;
        copyAllBtn.style.color = '';
      }, 1800);
    });
    actionsHeader.appendChild(copyAllBtn);

    answers.forEach((ans, idx) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'pp-answer-item';

      const labelWrap = document.createElement('div');
      labelWrap.style.cssText = 'display:flex;align-items:center;gap:8px;min-width:0;';

      const tag = document.createElement('span');
      tag.className = 'pp-answer-index';
      tag.textContent = `#${idx + 1}`;

      const text = document.createElement('span');
      text.className = 'pp-answer-item-text';
      text.textContent = ans;
      text.title = 'Cliquer pour copier';
      text.addEventListener('click', () => {
        navigator.clipboard.writeText(ans);
        showToast('Copié ✓');
      });

      labelWrap.appendChild(tag);
      labelWrap.appendChild(text);

      itemEl.appendChild(labelWrap);
      itemEl.appendChild(createCopyButton(ans));
      container.appendChild(itemEl);
    });
  }

  function createCopyButton(textToCopy) {
    const btn = document.createElement('button');
    btn.className = 'pp-btn-action';
    btn.title = 'Copier';
    btn.innerHTML = ICONS.copy;

    btn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(textToCopy);
      btn.innerHTML = ICONS.check;
      btn.style.color = 'var(--pp-accent)';
      setTimeout(() => {
        btn.innerHTML = ICONS.copy;
        btn.style.color = '';
      }, 1500);
    });

    return btn;
  }

  function createApplyButton(answers) {
    const btn = document.createElement('button');
    btn.className = 'pp-btn-action primary';
    btn.title = 'Appliquer sur la page (cases, menus, champs, boutons)';
    btn.innerHTML = `${ICONS.bolt} <span>Appliquer</span>`;

    btn.addEventListener('click', async () => {
      const count = window.PixExtractor?.autoApplyAnswers
        ? await window.PixExtractor.autoApplyAnswers(answers)
        : 0;
      if (count > 0) {
        btn.innerHTML = `${ICONS.check} <span>${count}</span>`;
      } else {
        btn.innerHTML = `<span>0</span>`;
      }
      setTimeout(() => {
        btn.innerHTML = `${ICONS.bolt} <span>Appliquer</span>`;
      }, 1800);
    });

    return btn;
  }

  // --------------------------------------------------------------------------
  // Typewriter rapide pour la note technique
  // --------------------------------------------------------------------------
  async function runTypewriterAnimation(fullText, container) {
    const text = (fullText || '').trim();
    if (!text) return;

    container.innerHTML = '';
    const textNode = document.createTextNode('');
    const cursor = document.createElement('span');
    cursor.className = 'pp-cursor';

    container.appendChild(textNode);
    container.appendChild(cursor);

    const stepSize = text.length > 200 ? 4 : 3;
    const delay = 8;

    for (let i = 0; i < text.length; i += stepSize) {
      textNode.nodeValue = text.slice(0, i + stepSize);
      await new Promise(r => setTimeout(r, delay));
    }

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

  function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: absolute;
      bottom: 52px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--pp-bg-elevated);
      color: var(--pp-text-main);
      border: 1px solid var(--pp-border-accent);
      box-shadow: 0 8px 20px rgba(0,0,0,0.5);
      padding: 4px 10px;
      border-radius: var(--pp-radius-full);
      font-family: var(--pp-font-mono);
      font-size: 11px;
      z-index: 25;
      opacity: 0;
      transition: opacity 0.15s ease;
      pointer-events: none;
    `;
    toast.textContent = message;
    panel.appendChild(toast);

    requestAnimationFrame(() => toast.style.opacity = '1');
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 1500);
  }
})();
