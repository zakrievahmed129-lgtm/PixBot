/**
 * PixPilot - Content Script
 * Interface blanche épurée, discrète et tactile ("en bosse") avec ADN console CMD.
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
    model: 'gemini-2.5-flash',
    ghostMode: false,
    compactMode: false,
    autoApply: false
  };

  let attachedFiles = [];
  let extractedChallenge = null;
  let isGenerating = false;
  let lastAnswers = [];
  let cmdHistory = [];
  let cmdHistoryIdx = -1;

  const ICONS = {
    scan: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`,
    capture: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
    attach: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
    send: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 10 4 15 9 20"/><path d="M20 4v7a4 4 0 0 1-4 4H4"/></svg>`,
    copy: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    check: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    bolt: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    ghost: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
    compact: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>`,
    clear: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    settings: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    close: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    eye: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    shield: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`
  };

  function persistPreference(key, val) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [key]: val });
    }
    try {
      localStorage.setItem(`pp_${key}`, typeof val === 'boolean' ? String(val) : val);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // Création du DOM
  // --------------------------------------------------------------------------
  const root = document.createElement('div');
  root.id = 'pixpilot-root';
  root.innerHTML = `
    <div id="pixpilot-fab" title="cmd (Alt+P) · glisser pour déplacer">
      <span class="fab-icon">&gt;_</span>
      <span class="fab-label">cmd</span>
      <span class="fab-dot"></span>
    </div>

    <div id="pixpilot-panel">
      <div class="pp-resize-handle" id="pp-resize-handle" title="Redimensionner"></div>

      <div class="pp-header" id="pp-drag-handle" title="Glisser · Double-clic pour compacter">
        <div class="pp-brand">
          <span class="pp-prompt-chip"><span class="pp-caret">&gt;_</span>pix<span class="pp-cursor-mini"></span></span>
          <span class="pp-model-tag" id="pp-model-badge" title="Modèle IA (cliquer pour changer)">2.5-flash</span>
          <span class="pp-sec-dot" id="pp-shield-badge" title="Protection onglet &amp; souris active">sec</span>
        </div>
        <div class="pp-header-actions">
          <button class="pp-icon-btn" id="pp-btn-ghost" title="Mode discret (Alt+G)">${ICONS.ghost}</button>
          <button class="pp-icon-btn" id="pp-btn-compact" title="Mode compact (Alt+M)">${ICONS.compact}</button>
          <button class="pp-icon-btn" id="pp-btn-clear" title="cls · Vider (Alt+L)">${ICONS.clear}</button>
          <button class="pp-icon-btn" id="pp-btn-settings" title="Configuration">${ICONS.settings}</button>
          <button class="pp-icon-btn" id="pp-btn-close" title="Fermer (Esc)">${ICONS.close}</button>
        </div>
      </div>

      <div class="pp-quick-bar">
        <button class="pp-btn-key primary" id="pp-btn-scan" title="Scanner la page (Alt+S)">
          ${ICONS.scan} <span>$ scan</span> <span class="pp-key-hint">S</span>
        </button>
        <button class="pp-btn-key" id="pp-btn-screenshot" title="Capturer l'onglet (Alt+C)">
          ${ICONS.capture} <span>$ cap</span> <span class="pp-key-hint">C</span>
        </button>
        <button class="pp-btn-key" id="pp-btn-attach" title="Joindre un fichier">
          ${ICONS.attach} <span>$ file</span>
        </button>
        <input type="file" id="pp-file-input" style="display:none;" multiple accept="image/*,.zip,.pdf,.xlsx,.xls,.ods,.docx,.doc,.odt,.csv,.txt,.json,.py,.sql">
      </div>

      <div class="pp-attachments-container" id="pp-attachments-list"></div>

      <div class="pp-body" id="pp-body">
        <div class="pp-empty-state" id="pp-empty-state">
          <div class="pp-cmd-welcome">
            <div class="pp-cmd-line"><span class="pp-prefix">C:\\pix&gt;</span> ready<span class="pp-cursor-blink"></span></div>
            <div class="pp-cmd-sub">terminal blanc · commandes /help · glisser-déposer</div>
          </div>
          <div class="pp-kbd-row">
            <button type="button" class="pp-kbd-btn" data-action="scan"><kbd>Alt+S</kbd> scan</button>
            <button type="button" class="pp-kbd-btn" data-action="cap"><kbd>Alt+C</kbd> cap</button>
            <button type="button" class="pp-kbd-btn" data-action="paste"><kbd>Ctrl+V</kbd> img</button>
            <button type="button" class="pp-kbd-btn" data-action="help"><kbd>?</kbd> help</button>
          </div>
        </div>
      </div>

      <div class="pp-footer">
        <div class="pp-input-row">
          <span class="pp-prompt-symbol">&gt;_</span>
          <textarea class="pp-textarea" id="pp-prompt-input" rows="1" placeholder="commande (/help) ou question..."></textarea>
          <button class="pp-btn-send" id="pp-btn-send" title="Exécuter (Entrée)">${ICONS.send}</button>
        </div>
        <div class="pp-status-hint">
          <div class="pp-status-left">
            <span class="pp-status-led" id="pp-status-led"></span>
            <span id="pp-status-text">ready</span>
          </div>
          <div class="pp-status-right">
            <button type="button" class="pp-status-pill" id="pp-auto-toggle" title="Auto-appliquer la réponse dès résolution">auto:off</button>
            <span class="pp-shortcuts-tag" title="Afficher / Masquer">Alt+P</span>
          </div>
        </div>
      </div>

      <div class="pp-settings-modal" id="pp-settings-modal">
        <div class="pp-settings-title">
          <span>&gt;_ config</span>
          <button class="pp-icon-btn" id="pp-btn-close-settings">${ICONS.close}</button>
        </div>

        <div class="pp-field-group">
          <div class="pp-shield-box">
            <div class="pp-shield-row">
              <span style="color:var(--pp-cmd-green);display:flex;">${ICONS.shield}</span>
              <div class="pp-shield-desc">
                <div class="pp-shield-title">bouclier_vie_privee</div>
                <div class="pp-shield-sub">Écouteurs blur, visibilityState et mouseleave neutralisés.</div>
              </div>
              <span class="pp-shield-badge-active">ACTIF</span>
            </div>
          </div>
        </div>

        <div class="pp-field-group">
          <label class="pp-label">comportement</label>
          <div class="pp-toggles-box">
            <label class="pp-toggle-row">
              <div>
                <div class="pp-toggle-label">auto_apply</div>
                <div class="pp-toggle-sub">Coche / remplit dès réception</div>
              </div>
              <span class="pp-switch">
                <input type="checkbox" id="pp-cfg-auto-apply">
                <span class="pp-switch-track"></span>
                <span class="pp-switch-thumb"></span>
              </span>
            </label>
            <label class="pp-toggle-row">
              <div>
                <div class="pp-toggle-label">mode_discret</div>
                <div class="pp-toggle-sub">Opacité réduite hors survol</div>
              </div>
              <span class="pp-switch">
                <input type="checkbox" id="pp-cfg-ghost">
                <span class="pp-switch-track"></span>
                <span class="pp-switch-thumb"></span>
              </span>
            </label>
            <label class="pp-toggle-row">
              <div>
                <div class="pp-toggle-label">format_compact</div>
                <div class="pp-toggle-sub">Mini barre CMD sans encombrement</div>
              </div>
              <span class="pp-switch">
                <input type="checkbox" id="pp-cfg-compact">
                <span class="pp-switch-track"></span>
                <span class="pp-switch-thumb"></span>
              </span>
            </label>
          </div>
        </div>

        <div class="pp-field-group">
          <div class="pp-label-row">
            <label class="pp-label" for="pp-cfg-key">cle_api_gemini</label>
            <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" class="pp-link-subtle">AI Studio ↗</a>
          </div>
          <div class="pp-input-wrapper">
            <input type="password" class="pp-input-text" id="pp-cfg-key" placeholder="AIzaSy...">
            <button type="button" class="pp-btn-eye" id="pp-cfg-toggle-key" title="Afficher/Masquer">${ICONS.eye}</button>
          </div>
        </div>

        <div class="pp-field-group">
          <label class="pp-label" for="pp-cfg-model">modele</label>
          <select class="pp-select" id="pp-cfg-model">
            <option value="gemini-2.5-flash">gemini-2.5-flash</option>
            <option value="gemini-2.0-flash-lite">gemini-2.0-flash-lite</option>
            <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
            <option value="gemini-1.5-flash">gemini-1.5-flash</option>
            <option value="custom">Personnalisé...</option>
          </select>
          <input type="text" class="pp-input-text" id="pp-cfg-custom-model" placeholder="ex: gemini-2.5-pro" style="display:none; margin-top:4px;">
        </div>

        <button class="pp-btn-save" id="pp-btn-save-settings">$ save --apply</button>
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
  const resizeHandle = document.getElementById('pp-resize-handle');

  const btnGhost = document.getElementById('pp-btn-ghost');
  const btnCompact = document.getElementById('pp-btn-compact');
  const btnClear = document.getElementById('pp-btn-clear');
  const btnClose = document.getElementById('pp-btn-close');
  const btnSettings = document.getElementById('pp-btn-settings');
  const btnCloseSettings = document.getElementById('pp-btn-close-settings');
  const settingsModal = document.getElementById('pp-settings-modal');
  const btnSaveSettings = document.getElementById('pp-btn-save-settings');

  const cfgKey = document.getElementById('pp-cfg-key');
  const cfgToggleKey = document.getElementById('pp-cfg-toggle-key');
  const cfgModel = document.getElementById('pp-cfg-model');
  const cfgCustomModel = document.getElementById('pp-cfg-custom-model');
  const cfgAutoApply = document.getElementById('pp-cfg-auto-apply');
  const cfgGhost = document.getElementById('pp-cfg-ghost');
  const cfgCompact = document.getElementById('pp-cfg-compact');
  const modelBadge = document.getElementById('pp-model-badge');
  const shieldBadge = document.getElementById('pp-shield-badge');

  const btnScan = document.getElementById('pp-btn-scan');
  const btnScreenshot = document.getElementById('pp-btn-screenshot');
  const btnAttach = document.getElementById('pp-btn-attach');
  const fileInput = document.getElementById('pp-file-input');
  const attachmentsList = document.getElementById('pp-attachments-list');
  const promptInput = document.getElementById('pp-prompt-input');
  const btnSend = document.getElementById('pp-btn-send');
  const body = document.getElementById('pp-body');
  const emptyState = document.getElementById('pp-empty-state');
  const statusLed = document.getElementById('pp-status-led');
  const statusText = document.getElementById('pp-status-text');
  const autoTogglePill = document.getElementById('pp-auto-toggle');

  const promptChip = panel.querySelector('.pp-prompt-chip');
  const inputRow = panel.querySelector('.pp-input-row');

  const previewModal = document.getElementById('pp-image-preview-modal');
  const previewImg = document.getElementById('pp-preview-img');
  const previewTitle = document.getElementById('pp-preview-title');
  const btnClosePreview = document.getElementById('pp-btn-close-preview');

  const pulseTimers = new WeakMap();
  const prefersReducedMotion = () =>
    Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function pulseClass(targetEl, className, durationMs = 260) {
    if (!targetEl) return;
    let map = pulseTimers.get(targetEl);
    if (!map) {
      map = {};
      pulseTimers.set(targetEl, map);
    }
    if (map[className]) clearTimeout(map[className]);
    targetEl.classList.remove(className);
    void targetEl.offsetWidth;
    targetEl.classList.add(className);
    map[className] = setTimeout(() => {
      targetEl.classList.remove(className);
      delete map[className];
    }, durationMs);
  }

  function triggerBrandPulse() {
    pulseClass(promptChip, 'is-pulsing', 200);
  }

  function syncInputRowState() {
    if (!inputRow) return;
    inputRow.classList.toggle('has-input', Boolean(promptInput && promptInput.value.trim().length > 0));
  }

  function consumePromptInput() {
    promptInput.value = '';
    promptInput.style.height = 'auto';
    syncInputRowState();
    pulseClass(inputRow, 'is-firing', 140);
    triggerBrandPulse();
  }

  function dismissCard(card) {
    if (!card || card.classList.contains('is-removing')) return;
    if (prefersReducedMotion()) {
      card.remove();
      syncBodyCompactState();
      return;
    }
    card.classList.add('is-removing');
    setTimeout(() => {
      card.remove();
      syncBodyCompactState();
    }, 145);
  }

  // --------------------------------------------------------------------------
  // État UI & Persistance (Discret, Compact, Auto-Apply, Position, Taille)
  // --------------------------------------------------------------------------
  function syncModeUI() {
    panel.classList.toggle('is-ghost', Boolean(config.ghostMode));
    fab.classList.toggle('is-ghost', Boolean(config.ghostMode));
    btnGhost.classList.toggle('is-on', Boolean(config.ghostMode));

    panel.classList.toggle('is-compact', Boolean(config.compactMode));
    btnCompact.classList.toggle('is-on', Boolean(config.compactMode));

    autoTogglePill.textContent = config.autoApply ? 'auto:on' : 'auto:off';
    autoTogglePill.classList.toggle('is-on', Boolean(config.autoApply));

    if (cfgAutoApply) cfgAutoApply.checked = Boolean(config.autoApply);
    if (cfgGhost) cfgGhost.checked = Boolean(config.ghostMode);
    if (cfgCompact) cfgCompact.checked = Boolean(config.compactMode);

    syncBodyCompactState();
    clampPanelWithinViewport();
  }

  function syncBodyCompactState() {
    const hasCards = body.querySelectorAll('.pp-result-card').length > 0;
    body.classList.toggle('is-empty-compact', !hasCards);
    if (emptyState) {
      emptyState.style.display = hasCards ? 'none' : '';
    }
  }

  function toggleGhostMode(silent = false) {
    config.ghostMode = !config.ghostMode;
    persistPreference('ghostMode', config.ghostMode);
    if (config.ghostMode && panel.contains(document.activeElement) && document.activeElement !== promptInput) {
      document.activeElement.blur();
    }
    syncModeUI();
    if (!silent) showToast(config.ghostMode ? 'mode discret: on' : 'mode discret: off');
  }

  function toggleCompactMode(silent = false) {
    config.compactMode = !config.compactMode;
    persistPreference('compactMode', config.compactMode);
    syncModeUI();
    if (!silent) showToast(config.compactMode ? 'format: compact' : 'format: normal');
  }

  function toggleAutoApply(silent = false) {
    config.autoApply = !config.autoApply;
    persistPreference('autoApply', config.autoApply);
    syncModeUI();
    if (!silent) showToast(config.autoApply ? 'auto-apply: on' : 'auto-apply: off');
  }

  function loadStoredPreferences() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(['geminiApiKey', 'geminiModel', 'ghostMode', 'compactMode', 'autoApply'], (res) => {
        if (res.geminiApiKey) config.apiKey = res.geminiApiKey;
        if (res.geminiModel) config.model = res.geminiModel;
        if (res.ghostMode !== undefined) config.ghostMode = Boolean(res.ghostMode);
        if (res.compactMode !== undefined) config.compactMode = Boolean(res.compactMode);
        if (res.autoApply !== undefined) config.autoApply = Boolean(res.autoApply);
        updateModelBadge();
        syncModeUI();
      });

      if (chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes) => {
          if (changes.geminiApiKey?.newValue !== undefined) config.apiKey = changes.geminiApiKey.newValue;
          if (changes.geminiModel?.newValue !== undefined) {
            config.model = changes.geminiModel.newValue;
            updateModelBadge();
          }
          if (changes.ghostMode?.newValue !== undefined) {
            config.ghostMode = Boolean(changes.ghostMode.newValue);
            syncModeUI();
          }
          if (changes.compactMode?.newValue !== undefined) {
            config.compactMode = Boolean(changes.compactMode.newValue);
            syncModeUI();
          }
          if (changes.autoApply?.newValue !== undefined) {
            config.autoApply = Boolean(changes.autoApply.newValue);
            syncModeUI();
          }
        });
      }
    } else if (typeof localStorage !== 'undefined') {
      const savedKey = localStorage.getItem('pp_geminiApiKey');
      const savedModel = localStorage.getItem('pp_geminiModel');
      const savedGhost = localStorage.getItem('pp_ghostMode');
      const savedCompact = localStorage.getItem('pp_compactMode');
      const savedAuto = localStorage.getItem('pp_autoApply');
      if (savedKey) config.apiKey = savedKey;
      if (savedModel) config.model = savedModel;
      if (savedGhost !== null) config.ghostMode = savedGhost === 'true';
      if (savedCompact !== null) config.compactMode = savedCompact === 'true';
      if (savedAuto !== null) config.autoApply = savedAuto === 'true';
      updateModelBadge();
      syncModeUI();
    }

    // Restaurer position/taille locales
    try {
      const savedSize = JSON.parse(localStorage.getItem('pp_panelSize') || 'null');
      if (savedSize && savedSize.w >= 300 && savedSize.h >= 220) {
        panel.style.width = `${savedSize.w}px`;
        panel.style.height = `${savedSize.h}px`;
      }
      const savedPos = JSON.parse(localStorage.getItem('pp_panelPos') || 'null');
      if (savedPos && Number.isFinite(savedPos.left) && Number.isFinite(savedPos.top)) {
        panel.style.left = `${savedPos.left}px`;
        panel.style.top = `${savedPos.top}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
      const savedFab = JSON.parse(localStorage.getItem('pp_fabPos') || 'null');
      if (savedFab && Number.isFinite(savedFab.left) && Number.isFinite(savedFab.top)) {
        fab.style.left = `${savedFab.left}px`;
        fab.style.top = `${savedFab.top}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
      }
    } catch (_) {}

    clampPanelWithinViewport();
    clampFabWithinViewport();
  }

  function clampPanelWithinViewport() {
    if (panel.style.left && panel.style.left !== 'auto') {
      const w = panel.offsetWidth || 392;
      const h = panel.offsetHeight || 492;
      const maxX = Math.max(8, window.innerWidth - w - 8);
      const maxY = Math.max(8, window.innerHeight - h - 8);
      const curX = parseFloat(panel.style.left) || 0;
      const curY = parseFloat(panel.style.top) || 0;
      panel.style.left = `${Math.max(8, Math.min(maxX, curX))}px`;
      panel.style.top = `${Math.max(8, Math.min(maxY, curY))}px`;
    }
  }

  function clampFabWithinViewport() {
    if (fab.style.left && fab.style.left !== 'auto') {
      const w = fab.offsetWidth || 44;
      const h = fab.offsetHeight || 28;
      const maxX = Math.max(8, window.innerWidth - w - 8);
      const maxY = Math.max(8, window.innerHeight - h - 8);
      const curX = parseFloat(fab.style.left) || 0;
      const curY = parseFloat(fab.style.top) || 0;
      fab.style.left = `${Math.max(8, Math.min(maxX, curX))}px`;
      fab.style.top = `${Math.max(8, Math.min(maxY, curY))}px`;
    }
  }

  window.addEventListener('resize', () => {
    clampPanelWithinViewport();
    clampFabWithinViewport();
  });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.action === 'toggle-panel') {
        togglePanel();
      }
    });
  }

  if (shieldBadge) {
    shieldBadge.addEventListener('click', () => {
      showToast('sec: bouclier actif (onglet & souris)');
    });
  }

  btnGhost.addEventListener('click', () => toggleGhostMode());
  btnCompact.addEventListener('click', () => toggleCompactMode());
  autoTogglePill.addEventListener('click', () => toggleAutoApply());

  // --------------------------------------------------------------------------
  // Déplacement du FAB (Clic = toggle, Glisser = déplacer)
  // --------------------------------------------------------------------------
  let fabDragging = false;
  let fabMoved = false;
  let fabStartX = 0;
  let fabStartY = 0;
  let fabOffsetX = 0;
  let fabOffsetY = 0;

  fab.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    fabDragging = true;
    fabMoved = false;
    fabStartX = e.clientX;
    fabStartY = e.clientY;
    const rect = fab.getBoundingClientRect();
    fabOffsetX = e.clientX - rect.left;
    fabOffsetY = e.clientY - rect.top;
    fab.style.transition = 'none';
  });

  // --------------------------------------------------------------------------
  // Déplacement & Redimensionnement de la fenêtre
  // --------------------------------------------------------------------------
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  let isResizing = false;
  let resizeStartRight = 0;
  let resizeStartBottom = 0;

  dragHandle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('#pp-model-badge') || e.target.closest('#pp-shield-badge')) return;
    isDragging = true;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    panel.style.transition = 'none';
  });

  dragHandle.addEventListener('dblclick', (e) => {
    if (e.target.closest('button') || e.target.closest('#pp-model-badge') || e.target.closest('#pp-shield-badge')) return;
    toggleCompactMode();
  });

  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    isResizing = true;
    const rect = panel.getBoundingClientRect();
    resizeStartRight = rect.right;
    resizeStartBottom = rect.bottom;
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.transition = 'none';
  });

  window.addEventListener('mousemove', (e) => {
    if (fabDragging) {
      if (Math.hypot(e.clientX - fabStartX, e.clientY - fabStartY) >= 5) {
        fabMoved = true;
      }
      if (fabMoved) {
        const x = Math.max(8, Math.min(window.innerWidth - fab.offsetWidth - 8, e.clientX - fabOffsetX));
        const y = Math.max(8, Math.min(window.innerHeight - fab.offsetHeight - 8, e.clientY - fabOffsetY));
        fab.style.left = `${x}px`;
        fab.style.top = `${y}px`;
        fab.style.right = 'auto';
        fab.style.bottom = 'auto';
      }
      return;
    }

    if (isDragging) {
      const x = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, e.clientX - dragOffsetX));
      const y = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, e.clientY - dragOffsetY));
      panel.style.left = `${x}px`;
      panel.style.top = `${y}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      return;
    }

    if (isResizing) {
      const minW = 300;
      const maxW = Math.min(680, resizeStartRight - 8);
      const minH = 220;
      const maxH = Math.min(window.innerHeight - 24, resizeStartBottom - 8);

      const newW = Math.max(minW, Math.min(maxW, resizeStartRight - e.clientX));
      const newH = Math.max(minH, Math.min(maxH, resizeStartBottom - e.clientY));

      panel.style.width = `${newW}px`;
      panel.style.height = `${newH}px`;
      panel.style.left = `${resizeStartRight - newW}px`;
      panel.style.top = `${resizeStartBottom - newH}px`;
    }
  });

  window.addEventListener('mouseup', () => {
    if (fabDragging) {
      fabDragging = false;
      fab.style.transition = '';
      if (fabMoved) {
        try {
          localStorage.setItem('pp_fabPos', JSON.stringify({
            left: parseFloat(fab.style.left),
            top: parseFloat(fab.style.top)
          }));
        } catch (_) {}
      } else {
        togglePanel();
      }
    }

    if (isDragging) {
      isDragging = false;
      panel.style.transition = '';
      try {
        localStorage.setItem('pp_panelPos', JSON.stringify({
          left: parseFloat(panel.style.left),
          top: parseFloat(panel.style.top)
        }));
      } catch (_) {}
    }

    if (isResizing) {
      isResizing = false;
      panel.style.transition = '';
      try {
        localStorage.setItem('pp_panelSize', JSON.stringify({
          w: panel.offsetWidth,
          h: panel.offsetHeight
        }));
        localStorage.setItem('pp_panelPos', JSON.stringify({
          left: parseFloat(panel.style.left),
          top: parseFloat(panel.style.top)
        }));
      } catch (_) {}
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
  function setPanelOpen(open) {
    panel.classList.toggle('is-open', open);
    fab.classList.toggle('is-open', open);
    if (open) {
      clampPanelWithinViewport();
      if (!config.apiKey) {
        openSettings();
      } else {
        promptInput.focus();
      }
    }
  }

  function togglePanel() {
    setPanelOpen(!panel.classList.contains('is-open'));
  }

  btnClose.addEventListener('click', () => setPanelOpen(false));

  function clearTerminal() {
    body.querySelectorAll('.pp-result-card').forEach(el => el.remove());
    attachedFiles = [];
    extractedChallenge = null;
    lastAnswers = [];
    renderAttachedFiles();
    syncBodyCompactState();
    syncInputRowState();
    triggerBrandPulse();
    statusText.textContent = 'ready';
  }

  btnClear.addEventListener('click', clearTerminal);

  // Boutons raccourcis cliquables dans l'empty state
  body.addEventListener('click', (e) => {
    const kbdBtn = e.target.closest('.pp-kbd-btn');
    if (!kbdBtn) return;
    const action = kbdBtn.dataset.action;
    if (action === 'scan') btnScan.click();
    else if (action === 'cap') takeChallengeScreenshot(false);
    else if (action === 'paste') showToast('Ctrl+V pour coller une image');
    else if (action === 'help') renderHelpCard();
  });

  window.addEventListener('keydown', (e) => {
    const pureAlt = e.altKey && !e.ctrlKey && !e.metaKey && !(e.getModifierState && e.getModifierState('AltGraph'));
    if (pureAlt) {
      const k = e.key.toLowerCase();
      if (k === 'p') {
        e.preventDefault();
        togglePanel();
      } else if (k === 'c') {
        e.preventDefault();
        takeChallengeScreenshot(true);
      } else if (k === 's') {
        e.preventDefault();
        if (!panel.classList.contains('is-open')) setPanelOpen(true);
        btnScan.click();
      } else if (k === 'a') {
        e.preventDefault();
        applyLatestAnswers();
      } else if (k === 'g') {
        e.preventDefault();
        toggleGhostMode();
      } else if (k === 'm') {
        e.preventDefault();
        toggleCompactMode();
      } else if (k === 'l') {
        e.preventDefault();
        clearTerminal();
      }
    } else if (e.key === 'Escape') {
      if (previewModal.classList.contains('is-active')) {
        closeImagePreview();
      } else if (settingsModal.classList.contains('is-active')) {
        closeSettings();
      } else if (panel.classList.contains('is-open')) {
        setPanelOpen(false);
      }
    }
  });

  fab.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  fab.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (!panel.classList.contains('is-open')) {
      setPanelOpen(true);
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
    cfgKey.type = 'password';
    if (['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-3.1-flash-lite', 'gemini-1.5-flash'].includes(config.model)) {
      cfgModel.value = config.model;
      cfgCustomModel.style.display = 'none';
    } else {
      cfgModel.value = 'custom';
      cfgCustomModel.value = config.model;
      cfgCustomModel.style.display = 'block';
    }
    if (cfgAutoApply) cfgAutoApply.checked = Boolean(config.autoApply);
    if (cfgGhost) cfgGhost.checked = Boolean(config.ghostMode);
    if (cfgCompact) cfgCompact.checked = Boolean(config.compactMode);
    settingsModal.classList.add('is-active');
  }

  function closeSettings() {
    settingsModal.classList.remove('is-active');
  }

  btnSettings.addEventListener('click', openSettings);
  modelBadge.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', closeSettings);

  if (cfgToggleKey) {
    cfgToggleKey.addEventListener('click', () => {
      cfgKey.type = cfgKey.type === 'password' ? 'text' : 'password';
    });
  }

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
    config.autoApply = Boolean(cfgAutoApply?.checked);
    config.ghostMode = Boolean(cfgGhost?.checked);
    config.compactMode = Boolean(cfgCompact?.checked);

    persistPreference('geminiApiKey', key);
    persistPreference('geminiModel', model);
    persistPreference('autoApply', config.autoApply);
    persistPreference('ghostMode', config.ghostMode);
    persistPreference('compactMode', config.compactMode);

    updateModelBadge();
    syncModeUI();
    closeSettings();
    showToast('config saved ✓');
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
      setPanelOpen(true);
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
      showToast('cap ✓');
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
    showToast('img ✓');
  });

  promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = `${Math.min(promptInput.scrollHeight, 68)}px`;
    syncInputRowState();
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
      chip.style.setProperty('--pp-i', String(Math.min(index, 6)));

      let iconHtml = '';
      if (file.type === 'image' && file.previewUrl) {
        iconHtml = `<img src="${file.previewUrl}" class="pp-file-chip-thumb" alt="">`;
        chip.classList.add('has-preview');
      } else {
        iconHtml = `<span style="color:var(--pp-cmd-green);font-weight:700;">#</span>`;
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
  // Commandes CMD locales & Historique
  // --------------------------------------------------------------------------
  function renderHelpCard() {
    const card = document.createElement('div');
    card.className = 'pp-result-card pp-help-card';
    card.innerHTML = `
      <div class="pp-card-meta">
        <div class="pp-cmd-tag"><span class="prompt">&gt;_</span><span>help</span></div>
        <button class="pp-btn-card-close" title="Fermer">&times;</button>
      </div>
      <div class="pp-help-grid">
        <span class="pp-help-cmd">/scan · Alt+S</span><span class="pp-help-desc">Analyser la question</span>
        <span class="pp-help-cmd">/cap · Alt+C</span><span class="pp-help-desc">Capturer l'onglet</span>
        <span class="pp-help-cmd">/apply · Alt+A</span><span class="pp-help-desc">Appliquer réponses</span>
        <span class="pp-help-cmd">/copy</span><span class="pp-help-desc">Copier les réponses</span>
        <span class="pp-help-cmd">/ghost · Alt+G</span><span class="pp-help-desc">Opacité discrète</span>
        <span class="pp-help-cmd">/mini · Alt+M</span><span class="pp-help-desc">Format compact</span>
        <span class="pp-help-cmd">/auto</span><span class="pp-help-desc">Auto-apply on/off</span>
        <span class="pp-help-cmd">/cls · Alt+L</span><span class="pp-help-desc">Vider la console</span>
      </div>
    `;
    card.querySelectorAll('.pp-help-grid > *').forEach((cell, i) => {
      cell.style.setProperty('--pp-row', String(Math.floor(i / 2)));
    });
    card.querySelector('.pp-btn-card-close').addEventListener('click', () => dismissCard(card));
    body.prepend(card);
    syncBodyCompactState();
  }

  async function applyLatestAnswers() {
    if (!lastAnswers || lastAnswers.length === 0) {
      showToast('aucune réponse en mémoire');
      return 0;
    }
    const count = window.PixExtractor?.autoApplyAnswers
      ? await window.PixExtractor.autoApplyAnswers(lastAnswers)
      : 0;
    statusText.textContent = count > 0 ? `applied: ${count}` : 'apply: 0';
    showToast(count > 0 ? `${count} appliqué(s) ✓` : 'aucun champ trouvé');
    return count;
  }

  function tryExecuteLocalCommand(raw) {
    const trimmed = (raw || '').trim();
    if (!trimmed) return false;
    const normalized = trimmed.replace(/^[$>]\s*/, '').toLowerCase();

    const commandHandlers = {
      '/scan': () => btnScan.click(),
      scan: () => btnScan.click(),
      '/cap': () => takeChallengeScreenshot(false),
      cap: () => takeChallengeScreenshot(false),
      '/capture': () => takeChallengeScreenshot(false),
      '/apply': () => applyLatestAnswers(),
      apply: () => applyLatestAnswers(),
      '/copy': () => {
        if (lastAnswers.length > 0) {
          navigator.clipboard.writeText(lastAnswers.join('\n'));
          showToast('copié ✓');
        } else {
          showToast('rien à copier');
        }
      },
      copy: () => commandHandlers['/copy'](),
      '/cls': () => clearTerminal(),
      cls: () => clearTerminal(),
      '/clear': () => clearTerminal(),
      clear: () => clearTerminal(),
      '/ghost': () => toggleGhostMode(),
      ghost: () => toggleGhostMode(),
      '/discret': () => toggleGhostMode(),
      discret: () => toggleGhostMode(),
      '/stealth': () => toggleGhostMode(),
      '/mini': () => toggleCompactMode(),
      mini: () => toggleCompactMode(),
      '/compact': () => toggleCompactMode(),
      compact: () => toggleCompactMode(),
      '/auto': () => toggleAutoApply(),
      auto: () => toggleAutoApply(),
      '/cfg': () => openSettings(),
      cfg: () => openSettings(),
      '/config': () => openSettings(),
      config: () => openSettings(),
      '/settings': () => openSettings(),
      '/help': () => renderHelpCard(),
      help: () => renderHelpCard(),
      '?': () => renderHelpCard(),
      '/?': () => renderHelpCard()
    };

    const handler = commandHandlers[normalized];
    if (!handler) return false;
    consumePromptInput();
    handler();
    return true;
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
    btnScan.classList.add('is-scanning');
    btnScan.innerHTML = `<span class="pp-spinner"></span> <span>scan...</span>`;
    triggerBrandPulse();

    try {
      extractedChallenge = await window.PixExtractor.extractCurrentChallenge();
      await submitToGemini(true);
    } catch (err) {
      console.error(err);
      statusText.textContent = 'err: scan';
    } finally {
      btnScan.disabled = false;
      btnScan.classList.remove('is-scanning');
      btnScan.innerHTML = `${ICONS.scan} <span>$ scan</span> <span class="pp-key-hint">S</span>`;
    }
  });

  btnSend.addEventListener('click', () => submitToGemini(false));

  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const raw = promptInput.value.trim();
      if (raw) {
        if (cmdHistory[0] !== raw) cmdHistory.unshift(raw);
        if (cmdHistory.length > 30) cmdHistory.pop();
        cmdHistoryIdx = -1;
      }
      if (!tryExecuteLocalCommand(raw)) {
        submitToGemini(false);
      }
      return;
    }

    if (e.key === 'ArrowUp' && cmdHistory.length > 0 && promptInput.selectionStart === 0) {
      e.preventDefault();
      cmdHistoryIdx = Math.min(cmdHistory.length - 1, cmdHistoryIdx + 1);
      promptInput.value = cmdHistory[cmdHistoryIdx] || '';
      promptInput.style.height = 'auto';
      promptInput.style.height = `${Math.min(promptInput.scrollHeight, 68)}px`;
      syncInputRowState();
    } else if (e.key === 'ArrowDown' && cmdHistoryIdx >= 0) {
      e.preventDefault();
      cmdHistoryIdx = cmdHistoryIdx - 1;
      promptInput.value = cmdHistoryIdx >= 0 ? cmdHistory[cmdHistoryIdx] : '';
      promptInput.style.height = 'auto';
      promptInput.style.height = `${Math.min(promptInput.scrollHeight, 68)}px`;
      syncInputRowState();
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

    if (answersList.every(a => a.trim().length === 1)) {
      return answersList.map(a => a.trim()).join('');
    }

    const lastParts = answersList.map(a => {
      const trimmed = a.trim();
      const m = trimmed.match(/(?:^|[,;|:\s])([a-zA-ZÀ-ÿ0-9])['"`\s]*$/);
      return m ? m[1] : null;
    });
    if (lastParts.every(Boolean)) {
      return lastParts.join('');
    }

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

  async function submitToGemini(fromScan = false) {
    if (isGenerating) return;

    if (!config.apiKey) {
      openSettings();
      return;
    }

    const manualPrompt = promptInput.value.trim();

    if (!extractedChallenge && !manualPrompt && attachedFiles.length === 0) {
      extractedChallenge = await window.PixExtractor.extractCurrentChallenge();
    }

    if (extractedChallenge) {
      try { await autoCaptureIfVisual(extractedChallenge); } catch (_) {}
    }

    // Téléchargement et lecture automatiques des fichiers joints dans la question Pix
    let autoFetchedInfo = null;
    if (extractedChallenge && Array.isArray(extractedChallenge.downloadLinks) && extractedChallenge.downloadLinks.length > 0) {
      const hasDocAttached = attachedFiles.some(f => f.type !== 'image');
      const fileFamily = (ext) => /^(xlsx|xls|ods|csv)$/i.test(ext || '') ? 'sheet' : /^(docx|doc|odt)$/i.test(ext || '') ? 'doc' : (ext || 'other');
      const fetchedFamilies = new Set();
      if (!hasDocAttached) {
        for (const dl of extractedChallenge.downloadLinks.slice(0, 4)) {
          if (fetchedFamilies.has(fileFamily(dl.ext))) continue;
          try {
            statusText.textContent = `fetch: ${dl.name}...`;
            let blob = null;
            let cd = '';
            let ct = '';

            try {
              const resp = await fetch(dl.url, { mode: 'cors' });
              if (resp.ok) {
                blob = await resp.blob();
                cd = resp.headers.get('content-disposition') || '';
                ct = (resp.headers.get('content-type') || blob.type || '').toLowerCase();
              }
            } catch (_) {}

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

    consumePromptInput();

    const cmdTitle = fromScan ? 'scan' : (manualPrompt ? manualPrompt.slice(0, 22) + (manualPrompt.length > 22 ? '…' : '') : 'run');
    const resultCard = document.createElement('div');
    resultCard.className = 'pp-result-card is-loading';
    resultCard.innerHTML = `
      <div class="pp-card-meta">
        <div class="pp-cmd-tag">
          <span class="prompt">&gt;_</span>
          <span class="pp-cmd-status">${escapeHtml(cmdTitle)} · ...</span>
        </div>
        <div class="pp-header-actions-group"></div>
      </div>

      <div class="pp-answers-container pp-single-answer-box">
        <div class="pp-loading-inline">
          <span class="pp-spinner"></span>
          <span>exécution<span class="pp-loading-dots"></span></span>
        </div>
      </div>

      <div class="pp-explanation-section is-empty">
        <div class="pp-typewriter-text"></div>
      </div>
    `;

    body.prepend(resultCard);
    syncBodyCompactState();

    const cmdStatus = resultCard.querySelector('.pp-cmd-status');
    const metaActionsGroup = resultCard.querySelector('.pp-header-actions-group');
    const answersDisplay = resultCard.querySelector('.pp-answers-container');
    const explanationSection = resultCard.querySelector('.pp-explanation-section');
    const typewriterText = resultCard.querySelector('.pp-typewriter-text');

    const attachCardClose = () => {
      const closeCardBtn = document.createElement('button');
      closeCardBtn.className = 'pp-btn-card-close';
      closeCardBtn.title = 'Retirer';
      closeCardBtn.innerHTML = '&times;';
      closeCardBtn.addEventListener('click', () => dismissCard(resultCard));
      metaActionsGroup.appendChild(closeCardBtn);
    };

    const filesToSend = [...attachedFiles];
    const imagesToSend = extractedChallenge ? extractedChallenge.images : [];
    const attachedFileNames = filesToSend.map(f => f.name);

    attachedFiles = [];
    extractedChallenge = null;
    renderAttachedFiles();

    isGenerating = true;
    btnSend.disabled = true;
    fab.classList.add('is-working');
    if (statusLed) statusLed.classList.add('working');

    const startTime = performance.now();
    statusText.textContent = 'run 0.0s';
    const timerInterval = setInterval(() => {
      const secs = ((performance.now() - startTime) / 1000).toFixed(1);
      statusText.textContent = `run ${secs}s`;
    }, 100);

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

      if (expectedCount === 1 && finalAnswers.length > 1) {
        const extractedWord = tryExtractWordFromRowAnswers(finalAnswers);
        if (extractedWord) {
          finalAnswers = [extractedWord];
        }
      }

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

      const mentionsLetterChart = /lettres?\s*s'affichent|forme(?:nt)?\s*la\s*lettre|diagramme.*lettre|barres.*lettre/i.test(fullPrompt);
      if (mentionsLetterChart && dataTables.some(t => t.detectedBarWord)) {
        const detected = dataTables.find(t => t.detectedBarWord)?.detectedBarWord;
        if (detected) {
          finalAnswers = [detected.toUpperCase()];
        }
      }

      const mentionsSalesTotal = /montant\s*total\s*(?:des\s*)?ventes|chiffre\s*d'affaires|quantit[eé]\s*vendue\s*[×x*]\s*prix/i.test(fullPrompt);
      if (mentionsSalesTotal && dataTables.some(t => t.detectedSumproduct)) {
        const spTable = dataTables.find(t => t.detectedSumproduct);
        if (spTable) {
          if (expectedCount <= 1) {
            finalAnswers = [String(spTable.detectedSumproduct)];
          } else if (expectedCount === 2 && spTable.detectedSumproductFormula) {
            finalAnswers = [String(spTable.detectedSumproduct), spTable.detectedSumproductFormula];
          }
        }
      }

      const birthYearMatch = fullPrompt.match(/ann[eé]e\s+de\s+naissance\s+d['’]([a-zA-ZÀ-ÿ\s-]+)/i);
      if (birthYearMatch) {
        const targetName = birthYearMatch[1].trim().toLowerCase();
        const normTarget = targetName.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        for (const t of dataTables) {
          if (t.personDates && (t.personDates[targetName] || t.personDates[normTarget])) {
            finalAnswers = [String(t.personDates[targetName] || t.personDates[normTarget])];
            break;
          }
        }
      }

      if (finalAnswers.length === 1 && typeof finalAnswers[0] === 'string') {
        finalAnswers[0] = sanitizeExcelDateOutput(finalAnswers[0], fullPrompt);

        if (/quatre\s*lettres|lettres?\s*s'affichent/i.test(fullPrompt) && finalAnswers[0].length >= 4) {
          const cleanLetters = finalAnswers[0].replace(/[^a-zA-Z]/g, '').toUpperCase();
          if (cleanLetters.length === 4) {
            finalAnswers[0] = cleanLetters;
          }
        }
      }

      clearInterval(timerInterval);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

      if (cmdStatus) {
        let tagText = `${cmdTitle} · ${elapsed}s`;
        if (finalAnswers.length > 1) {
          tagText += ` · ${finalAnswers.length} items`;
        }
        if (querySuccess) {
          tagText += ' · [calc]';
        } else if (attachedFileNames.length > 0) {
          tagText += ` · [${attachedFileNames[0]}]`;
        } else if (autoFetchedInfo && !autoFetchedInfo.ok) {
          tagText += ` · [!]`;
        }
        cmdStatus.textContent = tagText;
      }

      if (autoFetchedInfo && !autoFetchedInfo.ok && attachedFileNames.length === 0) {
        const warnNotice = document.createElement('div');
        warnNotice.className = 'pp-file-alert';
        warnNotice.innerHTML = `[!] <span>Fichier non lu (${escapeHtml(autoFetchedInfo.name)}). Glisse-le ou clique <strong>$ file</strong>.</span>`;
        answersDisplay.before(warnNotice);
      }

      lastAnswers = finalAnswers;
      resultCard.classList.remove('is-loading');
      pulseClass(resultCard, 'is-complete', 600);
      const answersRevealPromise = renderAnswers(finalAnswers, answersDisplay, metaActionsGroup);
      attachCardClose();

      if (config.autoApply && finalAnswers.length > 0) {
        const appliedCount = await applyLatestAnswers();
        statusText.textContent = appliedCount > 0 ? `applied: ${appliedCount} (${elapsed}s)` : `ok (${elapsed}s)`;
      } else {
        statusText.textContent = `ok (${elapsed}s)`;
      }

      await answersRevealPromise;

      if (response.explanation && response.explanation.trim()) {
        explanationSection.classList.remove('is-empty');
        await runTypewriterAnimation(response.explanation, typewriterText);
      }
    } catch (err) {
      console.error(err);
      resultCard.classList.remove('is-loading');
      if (cmdStatus) {
        cmdStatus.textContent = `${cmdTitle} · err`;
        cmdStatus.style.color = 'var(--pp-danger)';
      }
      answersDisplay.innerHTML = `<span style="color: var(--pp-danger); font-size: 11px; font-family: var(--pp-font-mono);">${escapeHtml(err.message)}</span>`;
      attachCardClose();
      statusText.textContent = 'error';
    } finally {
      clearInterval(timerInterval);
      isGenerating = false;
      btnSend.disabled = false;
      fab.classList.remove('is-working');
      if (statusLed) statusLed.classList.remove('working');
    }
  }

  // --------------------------------------------------------------------------
  // Affichage progressif et épuré des réponses
  // --------------------------------------------------------------------------
  async function streamTextProgressive(targetEl, rawText, { startDelayMs = 0, totalDurationCapMs = 300 } = {}) {
    const text = String(rawText ?? '');
    if (!text) return;

    if (prefersReducedMotion()) {
      targetEl.textContent = text;
      return;
    }

    if (startDelayMs > 0) {
      await new Promise(r => setTimeout(r, startDelayMs));
    }

    targetEl.textContent = '';
    const textNode = document.createTextNode('');
    const caret = document.createElement('span');
    caret.className = 'pp-type-caret';
    targetEl.appendChild(textNode);
    targetEl.appendChild(caret);

    const frameMs = 14;
    const maxSteps = Math.max(4, Math.floor(totalDurationCapMs / frameMs));
    const stepSize = Math.max(1, Math.ceil(text.length / maxSteps));

    for (let i = 0; i < text.length; i += stepSize) {
      textNode.nodeValue = text.slice(0, i + stepSize);
      await new Promise(r => setTimeout(r, frameMs));
    }

    textNode.nodeValue = text;
    caret.classList.add('is-done');
    setTimeout(() => {
      if (caret.isConnected) caret.remove();
    }, 160);
  }

  async function copyTextWithFeedback(textToCopy, hostEl, toastMsg = 'copié ✓') {
    await navigator.clipboard.writeText(textToCopy);
    if (hostEl) pulseClass(hostEl, 'is-copied', 580);
    if (toastMsg) showToast(toastMsg);
  }

  function renderAnswers(answers, container, actionsHeader) {
    container.innerHTML = '';
    actionsHeader.innerHTML = '';

    if (!answers || answers.length === 0) {
      container.className = 'pp-single-answer-box is-revealing';
      container.innerHTML = `<span style="color: var(--pp-text-secondary); font-size: 11px; font-family: var(--pp-font-mono);">aucune réponse détectée</span>`;
      return Promise.resolve();
    }

    if (answers.length === 1) {
      container.className = 'pp-single-answer-box is-revealing';
      const ans = answers[0];

      const textEl = document.createElement('span');
      textEl.className = 'pp-answer-text';
      textEl.title = 'Cliquer pour copier';
      textEl.addEventListener('click', () => copyTextWithFeedback(ans, container, 'copié ✓'));

      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'pp-header-actions-group pp-actions-reveal';

      actionsWrap.appendChild(createApplyButton(answers));
      actionsWrap.appendChild(createCopyButton(ans, container));

      container.appendChild(textEl);
      container.appendChild(actionsWrap);
      return streamTextProgressive(textEl, ans, { startDelayMs: 35, totalDurationCapMs: 320 });
    }

    container.className = 'pp-multi-answers-grid';

    actionsHeader.appendChild(createApplyButton(answers));

    const copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'pp-btn-action pp-actions-reveal';
    copyAllBtn.innerHTML = `${ICONS.copy} <span>Tout</span>`;
    copyAllBtn.addEventListener('click', async () => {
      await copyTextWithFeedback(answers.join('\n'), copyAllBtn, null);
      copyAllBtn.innerHTML = `${ICONS.check} <span>OK</span>`;
      copyAllBtn.style.color = 'var(--pp-cmd-green)';
      setTimeout(() => {
        copyAllBtn.innerHTML = `${ICONS.copy} <span>Tout</span>`;
        copyAllBtn.style.color = '';
      }, 1800);
    });
    actionsHeader.appendChild(copyAllBtn);

    const streamPromises = answers.map((ans, idx) => {
      const staggerIndex = Math.min(idx, 6);
      const itemEl = document.createElement('div');
      itemEl.className = 'pp-answer-item';
      itemEl.style.setProperty('--pp-i', String(staggerIndex));

      const labelWrap = document.createElement('div');
      labelWrap.style.cssText = 'display:flex;align-items:center;gap:7px;min-width:0;flex:1;';

      const tag = document.createElement('span');
      tag.className = 'pp-answer-index';
      tag.textContent = `#${idx + 1}`;

      const text = document.createElement('span');
      text.className = 'pp-answer-item-text';
      text.title = 'Cliquer pour copier';
      text.addEventListener('click', () => copyTextWithFeedback(ans, itemEl, 'copié ✓'));

      labelWrap.appendChild(tag);
      labelWrap.appendChild(text);

      itemEl.appendChild(labelWrap);
      itemEl.appendChild(createCopyButton(ans, itemEl));
      container.appendChild(itemEl);

      return streamTextProgressive(text, ans, {
        startDelayMs: staggerIndex * 65 + 45,
        totalDurationCapMs: 260
      });
    });

    return Promise.all(streamPromises);
  }

  function createCopyButton(textToCopy, hostEl = null) {
    const btn = document.createElement('button');
    btn.className = 'pp-btn-action';
    btn.title = 'Copier';
    btn.innerHTML = ICONS.copy;

    btn.addEventListener('click', async () => {
      await copyTextWithFeedback(textToCopy, hostEl || btn, null);
      pulseClass(btn, 'is-copied', 520);
      btn.innerHTML = ICONS.check;
      btn.style.color = 'var(--pp-cmd-green)';
      setTimeout(() => {
        btn.innerHTML = ICONS.copy;
        btn.style.color = '';
      }, 1400);
    });

    return btn;
  }

  function createApplyButton(answers) {
    const btn = document.createElement('button');
    btn.className = 'pp-btn-action primary pp-actions-reveal';
    btn.title = 'Appliquer sur la page (Alt+A)';
    btn.innerHTML = `${ICONS.bolt} <span>Appliquer</span>`;

    btn.addEventListener('click', async () => {
      pulseClass(btn, 'is-applied', 320);
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
      }, 1700);
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
    toast.className = 'pp-toast';
    toast.textContent = message;
    panel.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
      toast.classList.remove('is-visible');
      setTimeout(() => toast.remove(), 180);
    }, 1450);
  }

  // Initialisation finale
  loadStoredPreferences();
})();
