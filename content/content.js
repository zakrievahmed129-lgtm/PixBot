/**
 * PixPilot v2 - Content Script Universel
 * Interface blanche porcelaine ("En Bosse") disponible sur tout le web :
 * - Onglet `pix`  : résolution ultra-précise des épreuves Pix + PixQueryEngine + auto-apply
 * - Onglet `chat` : conversation IA libre multi-tours en streaming temps réel, Markdown complet,
 *                   contexte de page / sélection optionnel, pièces jointes & captures
 * - Modèle par défaut : gemini-3.5-flash-lite avec contrôle d'effort (high par défaut)
 */

(function () {
  if (window !== window.top) return;
  if (!document.body) return;
  if (document.contentType && !/html|xhtml/i.test(document.contentType)) return;
  if (document.getElementById('pixpilot-root')) return;

  const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
  const DEFAULT_EFFORT = 'high';
  const KNOWN_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'];
  const EFFORT_SHORT = { minimal: '0', low: 'L', medium: 'M', high: 'H' };
  const EFFORT_LABELS = { minimal: 'Minimal', low: 'Bas', medium: 'Moyen', high: 'Élevé' };
  const MODEL_LABELS = {
    'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.0-flash-lite': 'Gemini 2.0 Flash-Lite'
  };
  const CURRENT_HOST = (() => {
    try { return /^https?:$/i.test(location.protocol) ? (location.hostname || '') : ''; } catch (_) { return ''; }
  })();
  const isEmbedded = (() => {
    try { return document.documentElement?.dataset?.ppEmbed === 'sidepanel'; } catch (_) { return false; }
  })();

  const isPixContext =
    /(^|\.)pix\.(fr|org)$/i.test(CURRENT_HOST) ||
    Boolean(document.querySelector('.pix-challenge-card, .challenge-item, .challenge-statement, .c-challenge'));

  let config = {
    apiKey: '',
    model: DEFAULT_MODEL,
    thinkingLevel: DEFAULT_EFFORT,
    ghostMode: false,
    compactMode: false,
    autoApply: false,
    googleGlass: true,
    hiddenHosts: []
  };

  let activeMode = isPixContext ? 'pix' : 'chat';
  let pageContextEnabled = false;
  let lastSelectionText = '';

  let attachedFiles = [];
  let extractedChallenge = null;
  let isGenerating = false;
  let activeAbortController = null;
  let lastAnswers = [];
  let lastPixPromptContext = null;
  let cmdHistory = [];
  let cmdHistoryIdx = -1;

  // Historique de conversation du mode Chat (multi-tours)
  let chatMessages = [];
  let renderedCodeBlocks = [];

  const ICONS = {
    scan: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="12" x2="17" y2="12"/></svg>`,
    capture: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>`,
    attach: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`,
    send: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`,
    spark: `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5c.4 0 .7.3.8.6l1.2 4.1a5 5 0 0 0 3.4 3.4l4.1 1.2c.3.1.6.4.6.8s-.3.7-.6.8l-4.1 1.2a5 5 0 0 0-3.4 3.4l-1.2 4.1c-.1.3-.4.6-.8.6s-.7-.3-.8-.6L10 18a5 5 0 0 0-3.4-3.4l-4.1-1.2c-.3-.1-.6-.4-.6-.8s.3-.7.6-.8L6.6 10A5 5 0 0 0 10 6.6l1.2-4.1c.1-.3.4-.6.8-.6z"/></svg>`,
    compose: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
    stop: `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>`,
    copy: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
    check: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    bolt: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    retry: `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`,
    clear: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
    settings: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    close: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    eye: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    shield: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`
  };

  function isExtensionEnvironment() {
    return typeof chrome !== 'undefined' && Boolean(chrome.runtime || chrome.storage);
  }

  function hasValidChromeRuntime() {
    try {
      return typeof chrome !== 'undefined' && Boolean(chrome.runtime && chrome.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function hasValidChromeStorage() {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return false;
      if (chrome.runtime && !chrome.runtime.id) return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function safeStorageSet(payload) {
    if (!hasValidChromeStorage()) return false;
    try {
      const maybePromise = chrome.storage.local.set(payload, () => {
        try { void chrome.runtime?.lastError; } catch (_) {}
      });
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {});
      }
      return true;
    } catch (err) {
      console.warn('[PixPilot] chrome.storage.local.set ignoré (contexte invalidé):', err?.message || err);
      return false;
    }
  }

  function safeStorageGet(keys, callback) {
    if (!hasValidChromeStorage()) return false;
    try {
      const maybePromise = chrome.storage.local.get(keys, (res) => {
        try {
          if (chrome.runtime?.lastError) return;
        } catch (_) {
          return;
        }
        callback(res || {});
      });
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {});
      }
      return true;
    } catch (err) {
      console.warn('[PixPilot] chrome.storage.local.get ignoré (contexte invalidé):', err?.message || err);
      return false;
    }
  }

  function persistPreference(key, val) {
    if (safeStorageSet({ [key]: val })) {
      return true;
    }
    // En mode extension (même si le contexte est invalidé), ne jamais écrire la clé API dans le localStorage du site hôte
    if (isExtensionEnvironment()) {
      return false;
    }
    try {
      localStorage.setItem(`pp_${key}`, typeof val === 'object' ? JSON.stringify(val) : String(val));
      return true;
    } catch (_) {
      return false;
    }
  }

  function sendBgMessage(payload, timeoutMs = 15000) {
    if (!hasValidChromeRuntime() || !chrome.runtime?.sendMessage) {
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
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (err) {
      console.warn('[PixPilot] clipboard.writeText fallback:', err);
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (err) {
      console.warn('[PixPilot] clipboard copy failed:', err);
      return false;
    }
  }

  function saveChatHistory() {
    const compact = chatMessages
      .slice(-24)
      .map(m => ({ role: m.role, text: String(m.text || '').slice(0, 6000), meta: m.meta || null }));
    if (safeStorageSet({ chatHistory: compact })) {
      return true;
    }
    try {
      sessionStorage.setItem('pp_chatHistory', JSON.stringify(compact));
    } catch (_) {}
    return false;
  }

  // --------------------------------------------------------------------------
  // Création du DOM — Shadow DOM fermé : les styles du site hôte ne peuvent plus
  // casser l'interface (boutons, interrupteurs, menus des réglages...)
  // --------------------------------------------------------------------------
  const root = document.createElement('div');
  root.id = 'pixpilot-root';
  root.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;visibility:hidden;';
  const shadow = root.attachShadow({ mode: 'closed' });
  // Référence locale au content script uniquement (inaccessible aux scripts du site)
  window.__PIXPILOT_SHADOW__ = shadow;

  const cssHref = (() => {
    try {
      if (hasValidChromeRuntime() && chrome.runtime.getURL) return chrome.runtime.getURL('content/content.css');
    } catch (_) {}
    const src = (document.currentScript && document.currentScript.src) || '';
    return src ? src.replace(/content\.js(?:[?#].*)?$/, 'content.css') : 'content/content.css';
  })();

  let uiRevealed = false;
  let cssInjectedFallback = false;
  const revealUi = () => {
    if (uiRevealed) return;
    uiRevealed = true;
    root.style.visibility = 'visible';
  };
  const applyCssFallbackText = (cssText) => {
    if (!cssText || cssInjectedFallback) return false;
    cssInjectedFallback = true;
    try {
      if (typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in shadow) {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(cssText);
        shadow.adoptedStyleSheets = [sheet];
        return true;
      }
    } catch (_) {}
    const styleEl = document.createElement('style');
    styleEl.textContent = cssText;
    shadow.appendChild(styleEl);
    return true;
  };
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = cssHref;
  styleLink.addEventListener('load', revealUi);
  styleLink.addEventListener('error', async () => {
    try {
      const resp = await fetch(cssHref).catch(() => null);
      if (resp && resp.ok && applyCssFallbackText(await resp.text())) {
        revealUi();
        return;
      }
    } catch (_) {}
    try {
      const bgCss = await sendBgMessage({ action: 'get-panel-css' }, 5000);
      if (bgCss && bgCss.success && bgCss.css) {
        applyCssFallbackText(bgCss.css);
      }
    } catch (_) {}
    revealUi();
  });
  setTimeout(revealUi, 2500);
  shadow.appendChild(styleLink);

  const shell = document.createElement('div');
  shell.className = 'pp-shell';
  shell.innerHTML = `
    <div id="pixpilot-fab" role="button" tabindex="0" title="PixPilot · Alt+P" aria-label="Ouvrir PixPilot">
      <span class="fab-icon">${ICONS.spark}</span>
      <span class="fab-label" id="pp-fab-label">${activeMode}</span>
      <span class="fab-dot"></span>
    </div>

    <div id="pixpilot-panel" data-mode="${activeMode}" role="dialog" aria-label="PixPilot">
      <div class="pp-resize-handle" id="pp-resize-handle" title="Redimensionner"></div>

      <div class="pp-header" id="pp-drag-handle" title="Glisser pour déplacer · double-clic : compact">
        <div class="pp-brand">
          <div class="pp-mode-switch" id="pp-mode-switch" role="tablist" aria-label="Mode">
            <span class="pp-mode-indicator"></span>
            <button type="button" class="pp-mode-btn ${activeMode === 'pix' ? 'is-active' : ''}" id="pp-tab-pix" data-mode="pix" role="tab" title="Mode Pix (Alt+1)">Pix</button>
            <button type="button" class="pp-mode-btn ${activeMode === 'chat' ? 'is-active' : ''}" id="pp-tab-chat" data-mode="chat" role="tab" title="Chat libre (Alt+2)">Chat</button>
          </div>
          <button type="button" class="pp-model-tag" id="pp-model-badge" title="Modèle & effort">3.5-lite · H</button>
          <span class="pp-sec-dot ${isPixContext ? '' : 'is-hidden'}" id="pp-shield-badge" title="Bouclier anti-détection actif"></span>
        </div>
        <div class="pp-header-actions">
          <button type="button" class="pp-icon-btn" id="pp-btn-clear" title="Nouvelle conversation (Alt+L)">${ICONS.compose}</button>
          <button type="button" class="pp-icon-btn" id="pp-btn-settings" title="Réglages">${ICONS.settings}</button>
          <button type="button" class="pp-icon-btn" id="pp-btn-close" title="Fermer (Échap)">${ICONS.close}</button>
        </div>
      </div>

      <div class="pp-quick-bar" id="pp-quick-bar">
        <button type="button" class="pp-btn-key primary" id="pp-btn-scan" title="Scanner la question (Alt+S)">${ICONS.scan}<span>Scanner</span><span class="pp-key-hint">Alt S</span></button>
        <button type="button" class="pp-btn-key" id="pp-btn-screenshot" title="Capturer l'onglet (Alt+C)">${ICONS.capture}<span>Capture</span></button>
        <button type="button" class="pp-btn-key" id="pp-btn-attach" title="Joindre un fichier">${ICONS.attach}<span>Fichier</span></button>
      </div>
      <input type="file" id="pp-file-input" hidden multiple accept="image/*,.zip,.pdf,.xlsx,.xls,.ods,.docx,.doc,.odt,.csv,.txt,.json,.py,.sql,.js,.ts,.html,.css,.md">

      <div class="pp-body" id="pp-body">
        <div class="pp-empty-state" id="pp-empty-state">
          <div class="pp-empty-orb">${ICONS.spark}</div>
          <div class="pp-empty-title">Prêt pour Pix</div>
          <div class="pp-empty-sub">Scanne la question, ou glisse un fichier / une image ici.</div>
          <div class="pp-kbd-row">
            <button type="button" class="pp-kbd-btn" data-action="scan"><kbd>Alt S</kbd>Scanner</button>
            <button type="button" class="pp-kbd-btn" data-action="cap"><kbd>Alt C</kbd>Capture</button>
            <button type="button" class="pp-kbd-btn" data-action="help"><kbd>?</kbd>Aide</button>
          </div>
        </div>
      </div>

      <div class="pp-chat-body" id="pp-chat-body">
        <div class="pp-chat-empty" id="pp-chat-empty">
          <div class="pp-empty-orb">${ICONS.spark}</div>
          <div class="pp-empty-title">Que puis-je faire pour toi ?</div>
          <div class="pp-empty-sub" id="pp-chat-welcome-sub">Gemini 3.5 Flash-Lite · effort élevé</div>
          <div class="pp-chat-starters">
            <button type="button" class="pp-starter-chip" data-starter="summarize">Résumer la page</button>
            <button type="button" class="pp-starter-chip" data-starter="explain" id="pp-starter-explain">Expliquer la page</button>
            <button type="button" class="pp-starter-chip" data-starter="capture">Analyser l’écran</button>
          </div>
        </div>
      </div>

      <div class="pp-attachments-container" id="pp-attachments-list"></div>

      <div class="pp-footer">
        <div class="pp-input-row">
          <textarea class="pp-textarea" id="pp-prompt-input" rows="1" spellcheck="true" placeholder="${activeMode === 'chat' ? 'Écris un message…' : 'Question ou commande (/help)…'}"></textarea>
          <div class="pp-chat-inline-tools">
            <button type="button" class="pp-inline-icon-btn" id="pp-chat-btn-cap" title="Capturer l'écran (Alt+C)">${ICONS.capture}</button>
            <button type="button" class="pp-inline-icon-btn" id="pp-chat-btn-file" title="Joindre un fichier">${ICONS.attach}</button>
          </div>
          <button type="button" class="pp-btn-send" id="pp-btn-send" title="Envoyer (Entrée)">${ICONS.send}</button>
        </div>
        <div class="pp-status-hint">
          <div class="pp-status-left">
            <span class="pp-status-led" id="pp-status-led"></span>
            <span id="pp-status-text">prêt</span>
          </div>
          <div class="pp-status-right">
            <button type="button" class="pp-status-pill" id="pp-auto-toggle" title="Appliquer automatiquement la réponse sur Pix">Auto</button>
            <button type="button" class="pp-status-pill" id="pp-page-ctx-toggle" title="Joindre le contenu de la page / la sélection">Page</button>
          </div>
        </div>
      </div>

      <div class="pp-sheet-scrim" id="pp-settings-scrim"></div>
      <div class="pp-settings-modal" id="pp-settings-modal" role="dialog" aria-label="Réglages">
        <div class="pp-settings-title">
          <span>Réglages</span>
          <span class="pp-saved-hint" id="pp-cfg-saved">Enregistré</span>
          <button type="button" class="pp-icon-btn" id="pp-btn-close-settings" title="Fermer">${ICONS.close}</button>
        </div>

        <div class="pp-settings-scroll">
          <div class="pp-set-section">
            <div class="pp-set-heading">Intelligence</div>
            <div class="pp-set-group">
              <div class="pp-set-row is-stack">
                <label class="pp-set-label" for="pp-cfg-model">Modèle</label>
                <select class="pp-select" id="pp-cfg-model">
                  <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash-Lite · rapide (défaut)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro · précis</option>
                  <option value="gemini-2.0-flash-lite">Gemini 2.0 Flash-Lite</option>
                  <option value="custom">Personnalisé…</option>
                </select>
                <input type="text" class="pp-input-text" id="pp-cfg-custom-model" placeholder="ex : gemini-3.5-pro" spellcheck="false" autocomplete="off" hidden>
              </div>
              <div class="pp-set-row is-stack">
                <div class="pp-label-row">
                  <span class="pp-set-label">Effort de réflexion</span>
                  <span class="pp-effort-hint" id="pp-cfg-effort-hint">Élevé</span>
                </div>
                <div class="pp-effort-group" id="pp-cfg-effort-group" data-level="high" role="radiogroup" aria-label="Effort de réflexion">
                  <span class="pp-effort-indicator"></span>
                  <button type="button" class="pp-effort-btn" data-effort="minimal" role="radio" aria-checked="false">Min</button>
                  <button type="button" class="pp-effort-btn" data-effort="low" role="radio" aria-checked="false">Bas</button>
                  <button type="button" class="pp-effort-btn" data-effort="medium" role="radio" aria-checked="false">Moyen</button>
                  <button type="button" class="pp-effort-btn is-active" data-effort="high" role="radio" aria-checked="true">Élevé</button>
                </div>
              </div>
            </div>
          </div>

          <div class="pp-set-section">
            <div class="pp-set-heading">Interface</div>
            <div class="pp-set-group">
              <label class="pp-toggle-row">
                <div>
                  <div class="pp-toggle-label">Mode discret</div>
                  <div class="pp-toggle-sub">Transparent hors survol · Alt+G</div>
                </div>
                <span class="pp-switch"><input type="checkbox" id="pp-cfg-ghost"><span class="pp-switch-track"></span><span class="pp-switch-thumb"></span></span>
              </label>
              <label class="pp-toggle-row">
                <div>
                  <div class="pp-toggle-label">Format compact</div>
                  <div class="pp-toggle-sub">Fenêtre réduite · Alt+M</div>
                </div>
                <span class="pp-switch"><input type="checkbox" id="pp-cfg-compact"><span class="pp-switch-track"></span><span class="pp-switch-thumb"></span></span>
              </label>
              <label class="pp-toggle-row">
                <div>
                  <div class="pp-toggle-label">Style Google Recherche</div>
                  <div class="pp-toggle-sub">Cartes &amp; Aperçu IA en mode glass</div>
                </div>
                <span class="pp-switch"><input type="checkbox" id="pp-cfg-google-glass"><span class="pp-switch-track"></span><span class="pp-switch-thumb"></span></span>
              </label>
              ${CURRENT_HOST ? `
              <label class="pp-toggle-row">
                <div>
                  <div class="pp-toggle-label">Masquer le bouton ici</div>
                  <div class="pp-toggle-sub">Sur ${escapeHtml(CURRENT_HOST)} · Alt+P reste actif</div>
                </div>
                <span class="pp-switch"><input type="checkbox" id="pp-cfg-hide-host"><span class="pp-switch-track"></span><span class="pp-switch-thumb"></span></span>
              </label>` : ''}
            </div>
          </div>

          <div class="pp-set-section">
            <div class="pp-set-heading">Pix</div>
            <div class="pp-set-group">
              <label class="pp-toggle-row">
                <div>
                  <div class="pp-toggle-label">Application automatique</div>
                  <div class="pp-toggle-sub">Coche / remplit dès la réponse reçue</div>
                </div>
                <span class="pp-switch"><input type="checkbox" id="pp-cfg-auto-apply"><span class="pp-switch-track"></span><span class="pp-switch-thumb"></span></span>
              </label>
              <div class="pp-set-row">
                <div>
                  <div class="pp-toggle-label">Bouclier anti-détection</div>
                  <div class="pp-toggle-sub">${isPixContext ? 'Onglet & souris neutralisés sur cette page' : 'S’active automatiquement sur Pix'}</div>
                </div>
                <span class="pp-state-chip ${isPixContext ? 'is-on' : ''}">${isPixContext ? 'Actif' : 'Veille'}</span>
              </div>
            </div>
          </div>

          <div class="pp-set-section">
            <div class="pp-set-heading">
              <span>Clé API Gemini</span>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" class="pp-link-subtle">Obtenir une clé ↗</a>
            </div>
            <div class="pp-set-group">
              <div class="pp-set-row is-stack">
                <div class="pp-input-wrapper">
                  <input type="password" class="pp-input-text" id="pp-cfg-key" placeholder="AIzaSy…" autocomplete="off" spellcheck="false">
                  <button type="button" class="pp-btn-eye" id="pp-cfg-toggle-key" title="Afficher / masquer">${ICONS.eye}</button>
                </div>
                <div class="pp-key-status" id="pp-cfg-key-status">Aucune clé</div>
              </div>
            </div>
          </div>

          <div class="pp-set-foot">Les changements sont enregistrés automatiquement · Alt+P</div>
        </div>
      </div>

      <div class="pp-image-preview-modal" id="pp-image-preview-modal">
        <div class="pp-preview-header">
          <span id="pp-preview-title">capture.png</span>
          <button type="button" class="pp-icon-btn" id="pp-btn-close-preview" title="Fermer">${ICONS.close}</button>
        </div>
        <div class="pp-preview-body">
          <img id="pp-preview-img" src="" alt="Aperçu">
        </div>
      </div>
    </div>
  `;
  shadow.appendChild(shell);
  document.body.appendChild(root);

  // Empêche les raccourcis clavier du site (YouTube, GitHub, Notion…) de réagir pendant la saisie dans PixPilot
  ['keydown', 'keyup', 'keypress'].forEach((type) => {
    shell.addEventListener(type, (e) => e.stopPropagation());
  });

  // --------------------------------------------------------------------------
  // Références DOM (dans le Shadow DOM)
  // --------------------------------------------------------------------------
  const $id = (id) => shadow.getElementById(id);
  const fab = $id('pixpilot-fab');
  const fabLabel = $id('pp-fab-label');
  const panel = $id('pixpilot-panel');
  const dragHandle = $id('pp-drag-handle');
  const resizeHandle = $id('pp-resize-handle');
  const modeSwitch = $id('pp-mode-switch');
  const tabPix = $id('pp-tab-pix');
  const tabChat = $id('pp-tab-chat');

  const btnClear = $id('pp-btn-clear');
  const btnClose = $id('pp-btn-close');
  const btnSettings = $id('pp-btn-settings');
  const btnCloseSettings = $id('pp-btn-close-settings');
  const settingsModal = $id('pp-settings-modal');
  const settingsScrim = $id('pp-settings-scrim');
  const cfgSavedHint = $id('pp-cfg-saved');
  const cfgKeyStatus = $id('pp-cfg-key-status');

  const cfgKey = $id('pp-cfg-key');
  const cfgToggleKey = $id('pp-cfg-toggle-key');
  const cfgModel = $id('pp-cfg-model');
  const cfgCustomModel = $id('pp-cfg-custom-model');
  const cfgEffortGroup = $id('pp-cfg-effort-group');
  const cfgEffortHint = $id('pp-cfg-effort-hint');
  const cfgAutoApply = $id('pp-cfg-auto-apply');
  const cfgGhost = $id('pp-cfg-ghost');
  const cfgCompact = $id('pp-cfg-compact');
  const cfgGoogleGlass = $id('pp-cfg-google-glass');
  const cfgHideHost = $id('pp-cfg-hide-host');
  const modelBadge = $id('pp-model-badge');
  const shieldBadge = $id('pp-shield-badge');

  const btnScan = $id('pp-btn-scan');
  const btnScreenshot = $id('pp-btn-screenshot');
  const btnAttach = $id('pp-btn-attach');
  const chatBtnCap = $id('pp-chat-btn-cap');
  const chatBtnFile = $id('pp-chat-btn-file');
  const fileInput = $id('pp-file-input');
  const attachmentsList = $id('pp-attachments-list');
  const promptInput = $id('pp-prompt-input');
  const btnSend = $id('pp-btn-send');
  const body = $id('pp-body');
  const emptyState = $id('pp-empty-state');
  const chatBody = $id('pp-chat-body');
  const chatEmpty = $id('pp-chat-empty');
  const chatWelcomeSub = $id('pp-chat-welcome-sub');
  const starterExplainBtn = $id('pp-starter-explain');
  const statusLed = $id('pp-status-led');
  const statusText = $id('pp-status-text');
  const autoTogglePill = $id('pp-auto-toggle');
  const pageCtxTogglePill = $id('pp-page-ctx-toggle');
  const inputRow = panel.querySelector('.pp-input-row');

  const previewModal = $id('pp-image-preview-modal');
  const previewImg = $id('pp-preview-img');
  const previewTitle = $id('pp-preview-title');
  const btnClosePreview = $id('pp-btn-close-preview');

  const pulseTimers = new WeakMap();
  const prefersReducedMotion = () =>
    Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function pulseClass(targetEl, className, durationMs = 240) {
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
    pulseClass(modeSwitch, 'is-pulsing', 180);
  }

  function syncInputRowState() {
    if (!inputRow) return;
    inputRow.classList.toggle('has-input', Boolean(promptInput && promptInput.value.trim().length > 0));
  }

  function consumePromptInput() {
    promptInput.value = '';
    promptInput.style.height = 'auto';
    syncInputRowState();
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
  // Gestion des onglets (pix | chat) & contexte page / sélection
  // --------------------------------------------------------------------------
  function setActiveMode(mode, focusInput = false) {
    activeMode = mode === 'pix' ? 'pix' : 'chat';
    panel.dataset.mode = activeMode;
    tabPix.classList.toggle('is-active', activeMode === 'pix');
    tabChat.classList.toggle('is-active', activeMode === 'chat');
    if (fabLabel) fabLabel.textContent = activeMode;

    promptInput.placeholder = activeMode === 'chat'
      ? 'Écris un message…'
      : 'Question ou commande (/help)…';

    syncBodyCompactState();
    refreshSelectionState();

    if (activeMode === 'chat') {
      chatBody.scrollTop = chatBody.scrollHeight;
    }
    if (focusInput && panel.classList.contains('is-open')) {
      promptInput.focus();
    }
  }

  tabPix.addEventListener('click', () => setActiveMode('pix', true));
  tabChat.addEventListener('click', () => setActiveMode('chat', true));

  function refreshSelectionState() {
    let sel = '';
    try {
      const s = window.getSelection?.();
      if (s && s.rangeCount > 0 && document.activeElement !== root && !root.contains(s.anchorNode)) {
        sel = s.toString().trim();
      }
    } catch (_) {}
    if (sel.length >= 2) {
      lastSelectionText = sel.slice(0, 4000);
    }
    updatePageContextPill();
  }

  function updatePageContextPill() {
    if (!pageCtxTogglePill) return;
    pageCtxTogglePill.classList.toggle('is-on', pageContextEnabled);
    if (lastSelectionText && lastSelectionText.length >= 2) {
      pageCtxTogglePill.textContent = pageContextEnabled ? `Sélection · ${lastSelectionText.length}` : 'Sélection';
      if (starterExplainBtn) starterExplainBtn.textContent = 'Expliquer ma sélection';
    } else {
      pageCtxTogglePill.textContent = 'Page';
      if (starterExplainBtn) starterExplainBtn.textContent = 'Expliquer la page';
    }
  }

  document.addEventListener('mouseup', () => setTimeout(refreshSelectionState, 10));
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey) setTimeout(refreshSelectionState, 10);
  });

  pageCtxTogglePill.addEventListener('click', () => {
    pageContextEnabled = !pageContextEnabled;
    refreshSelectionState();
    showToast(pageContextEnabled
      ? (lastSelectionText ? 'contexte : sélection + page' : 'contexte page : activé')
      : 'contexte page : désactivé');
  });

  // --------------------------------------------------------------------------
  // État UI, Effort & Persistance
  // --------------------------------------------------------------------------
  function normalizeEffort(val) {
    const v = String(val || DEFAULT_EFFORT).toLowerCase().trim();
    if (v === 'min' || v === '0') return 'minimal';
    if (v === 'med') return 'medium';
    return ['minimal', 'low', 'medium', 'high'].includes(v) ? v : DEFAULT_EFFORT;
  }

  function setEffortLevel(level, persist = true) {
    config.thinkingLevel = normalizeEffort(level);
    if (persist) persistPreference('thinkingLevel', config.thinkingLevel);
    updateModelBadge();
    renderEffortSelector(config.thinkingLevel);
  }

  function renderEffortSelector(level) {
    const eff = normalizeEffort(level);
    if (cfgEffortHint) cfgEffortHint.textContent = EFFORT_LABELS[eff] || eff;
    if (cfgEffortGroup) {
      cfgEffortGroup.dataset.level = eff;
      cfgEffortGroup.querySelectorAll('.pp-effort-btn').forEach(btn => {
        const active = btn.dataset.effort === eff;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', String(active));
      });
    }
  }

  function updateModelBadge() {
    const shortNames = {
      'gemini-3.5-flash-lite': '3.5-lite',
      'gemini-2.5-flash': '2.5-flash',
      'gemini-2.5-pro': '2.5-pro',
      'gemini-2.0-flash-lite': '2.0-lite'
    };
    const modelShort = shortNames[config.model] || config.model;
    const effCode = EFFORT_SHORT[config.thinkingLevel] || 'H';
    modelBadge.textContent = `${modelShort} · ${effCode}`;
    modelBadge.title = `${config.model} · effort ${config.thinkingLevel} (cliquer pour configurer)`;
    if (chatWelcomeSub) {
      chatWelcomeSub.textContent = `${MODEL_LABELS[config.model] || config.model} · effort ${(EFFORT_LABELS[config.thinkingLevel] || config.thinkingLevel).toLowerCase()}`;
    }
  }

  function syncModeUI() {
    panel.classList.toggle('is-ghost', Boolean(config.ghostMode));
    fab.classList.toggle('is-ghost', Boolean(config.ghostMode));
    panel.classList.toggle('is-compact', Boolean(config.compactMode));

    const isHiddenHere = Boolean(CURRENT_HOST && Array.isArray(config.hiddenHosts) && config.hiddenHosts.includes(CURRENT_HOST));
    fab.classList.toggle('is-hidden-fab', isHiddenHere);

    autoTogglePill.textContent = 'Auto';
    autoTogglePill.classList.toggle('is-on', Boolean(config.autoApply));

    if (cfgAutoApply) cfgAutoApply.checked = Boolean(config.autoApply);
    if (cfgGhost) cfgGhost.checked = Boolean(config.ghostMode);
    if (cfgCompact) cfgCompact.checked = Boolean(config.compactMode);
    if (cfgGoogleGlass) cfgGoogleGlass.checked = config.googleGlass !== false;
    if (cfgHideHost) cfgHideHost.checked = isHiddenHere;

    if (!isEmbedded && window.PixGoogleGlass?.isSupported) {
      window.PixGoogleGlass.setEnabled(config.googleGlass !== false);
    }

    syncBodyCompactState();
    clampPanelWithinViewport();
  }

  function syncBodyCompactState() {
    const hasPixCards = body.querySelectorAll('.pp-result-card').length > 0;
    body.classList.toggle('is-empty-compact', !hasPixCards);
    if (emptyState) emptyState.style.display = hasPixCards ? 'none' : '';

    const hasChatMsgs = chatBody.querySelectorAll('.pp-chat-msg').length > 0;
    chatBody.classList.toggle('is-empty-compact', !hasChatMsgs);
    if (chatEmpty) chatEmpty.style.display = hasChatMsgs ? 'none' : '';
  }

  function toggleGhostMode(silent = false) {
    config.ghostMode = !config.ghostMode;
    persistPreference('ghostMode', config.ghostMode);
    const focusedInside = shadow.activeElement;
    if (config.ghostMode && focusedInside && focusedInside !== promptInput && typeof focusedInside.blur === 'function') {
      focusedInside.blur();
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

  function toggleHideFabOnCurrentHost(forceState = null) {
    if (!CURRENT_HOST) return false;
    const set = new Set(Array.isArray(config.hiddenHosts) ? config.hiddenHosts : []);
    const nextHidden = forceState === null ? !set.has(CURRENT_HOST) : Boolean(forceState);
    if (nextHidden) set.add(CURRENT_HOST);
    else set.delete(CURRENT_HOST);
    config.hiddenHosts = Array.from(set);
    const ok = persistPreference('hiddenHosts', config.hiddenHosts);
    syncModeUI();
    showToast(nextHidden ? `Bouton masqué sur ${CURRENT_HOST} (Alt+P actif)` : `Bouton affiché sur ${CURRENT_HOST}`);
    return ok;
  }

  function restoreChatHistory(saved) {
    if (!Array.isArray(saved) || saved.length === 0) return;
    chatMessages = [];
    chatBody.querySelectorAll('.pp-chat-msg').forEach(el => el.remove());
    for (const m of saved.slice(-24)) {
      if (!m || (m.role !== 'user' && m.role !== 'model') || !m.text) continue;
      chatMessages.push({ role: m.role, text: m.text, meta: m.meta || null });
      if (m.role === 'user') {
        appendUserChatBubble(m.text, m.meta || []);
      } else {
        const card = appendAssistantChatCard(m.meta?.label || config.model);
        finalizeAssistantChatCard(card, m.text, m.meta?.label || config.model, true, false);
      }
    }
    syncBodyCompactState();
    chatBody.scrollTop = chatBody.scrollHeight;
  }

  let storedPrefsLoaded = false;

  function loadStoredPreferences() {
    const keys = [
      'geminiApiKey', 'geminiModel', 'thinkingLevel',
      'ghostMode', 'compactMode', 'autoApply', 'googleGlass', 'hiddenHosts', 'panelSize', 'chatHistory'
    ];

    if (hasValidChromeStorage()) {
      safeStorageGet(keys, (res) => {
        storedPrefsLoaded = true;
        if (res.geminiApiKey !== undefined) config.apiKey = res.geminiApiKey;
        if (res.geminiModel) config.model = res.geminiModel;
        if (res.thinkingLevel) config.thinkingLevel = normalizeEffort(res.thinkingLevel);
        if (res.ghostMode !== undefined) config.ghostMode = Boolean(res.ghostMode);
        if (res.compactMode !== undefined) config.compactMode = Boolean(res.compactMode);
        if (res.autoApply !== undefined) config.autoApply = Boolean(res.autoApply);
        if (res.googleGlass !== undefined) config.googleGlass = Boolean(res.googleGlass);
        if (Array.isArray(res.hiddenHosts)) config.hiddenHosts = res.hiddenHosts;
        if (!isEmbedded && res.panelSize && res.panelSize.w >= 310 && res.panelSize.h >= 240) {
          panel.style.width = `${res.panelSize.w}px`;
          panel.style.height = `${res.panelSize.h}px`;
        }
        if (Array.isArray(res.chatHistory) && res.chatHistory.length > 0 && chatMessages.length === 0) {
          restoreChatHistory(res.chatHistory);
        }
        updateModelBadge();
        renderEffortSelector(config.thinkingLevel);
        syncModeUI();
        if (isSettingsOpen()) {
          syncSettingsForm();
        } else if (isEmbedded && !config.apiKey) {
          openSettings();
        }
      });

      try {
        if (chrome.storage.onChanged) {
          chrome.storage.onChanged.addListener((changes, area) => {
            if (area && area !== 'local') return;
            if (changes.geminiApiKey?.newValue !== undefined) config.apiKey = changes.geminiApiKey.newValue;
            if (changes.geminiModel?.newValue !== undefined) {
              config.model = changes.geminiModel.newValue;
              updateModelBadge();
            }
            if (changes.thinkingLevel?.newValue !== undefined) {
              config.thinkingLevel = normalizeEffort(changes.thinkingLevel.newValue);
              updateModelBadge();
              renderEffortSelector(config.thinkingLevel);
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
            if (changes.googleGlass?.newValue !== undefined) {
              config.googleGlass = Boolean(changes.googleGlass.newValue);
              syncModeUI();
            }
            if (changes.hiddenHosts?.newValue !== undefined) {
              config.hiddenHosts = Array.isArray(changes.hiddenHosts.newValue) ? changes.hiddenHosts.newValue : [];
              syncModeUI();
            }
            if (isSettingsOpen()) syncSettingsForm();
          });
        }
      } catch (err) {
        console.warn('[PixPilot] storage.onChanged listener ignoré:', err?.message || err);
      }
    } else if (!isExtensionEnvironment() && typeof localStorage !== 'undefined') {
      const savedKey = localStorage.getItem('pp_geminiApiKey');
      const savedModel = localStorage.getItem('pp_geminiModel');
      const savedEffort = localStorage.getItem('pp_thinkingLevel');
      const savedGhost = localStorage.getItem('pp_ghostMode');
      const savedCompact = localStorage.getItem('pp_compactMode');
      const savedAuto = localStorage.getItem('pp_autoApply');
      const savedGoogleGlass = localStorage.getItem('pp_googleGlass');
      if (savedKey !== null) config.apiKey = savedKey;
      if (savedModel) config.model = savedModel;
      if (savedEffort) config.thinkingLevel = normalizeEffort(savedEffort);
      if (savedGhost !== null) config.ghostMode = savedGhost === 'true';
      if (savedCompact !== null) config.compactMode = savedCompact === 'true';
      if (savedAuto !== null) config.autoApply = savedAuto === 'true';
      if (savedGoogleGlass !== null) config.googleGlass = savedGoogleGlass !== 'false';
      try {
        const savedChat = JSON.parse(sessionStorage.getItem('pp_chatHistory') || 'null');
        if (Array.isArray(savedChat)) restoreChatHistory(savedChat);
      } catch (_) {}
      updateModelBadge();
      renderEffortSelector(config.thinkingLevel);
      syncModeUI();
    }

    try {
      const savedSize = JSON.parse(localStorage.getItem('pp_panelSize') || 'null');
      if (savedSize && savedSize.w >= 310 && savedSize.h >= 240) {
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
      const w = panel.offsetWidth || 404;
      const h = panel.offsetHeight || 524;
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

  let lastShortcutToggleAt = 0;
  function togglePanelFromShortcut() {
    const now = Date.now();
    if (now - lastShortcutToggleAt < 150) return;
    lastShortcutToggleAt = now;
    togglePanel();
  }

  if (hasValidChromeRuntime() && chrome.runtime.onMessage) {
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!msg) return;
        if (msg.action === 'ping-pixpilot') {
          sendResponse({ alive: true });
          return false;
        }
        if (msg.action === 'toggle-panel') {
          if (!isEmbedded) togglePanelFromShortcut();
        } else if (msg.action === 'open-mode' && (msg.mode === 'chat' || msg.mode === 'pix')) {
          setActiveMode(msg.mode, false);
          setPanelOpen(true);
        }
      });
    } catch (err) {
      console.warn('[PixPilot] runtime.onMessage listener ignoré:', err?.message || err);
    }
  }

  window.addEventListener('pixpilot:open', (e) => {
    const mode = e?.detail?.mode;
    const prompt = typeof e?.detail?.prompt === 'string' ? e.detail.prompt.trim() : '';
    if (mode === 'chat' || mode === 'pix') {
      setActiveMode(mode, false);
    }
    setPanelOpen(true);
    if (prompt) {
      if (activeMode !== 'chat') setActiveMode('chat', false);
      submitChatMessage(prompt);
    }
  });

  if (shieldBadge) {
    shieldBadge.addEventListener('click', () => {
      showToast('sec: bouclier Pix actif (onglet & souris)');
    });
  }

  autoTogglePill.addEventListener('click', () => toggleAutoApply());

  // Détection de changement de question sur Pix (SPA Ember) -> réinitialise l'état périmé
  if (isPixContext && window.PixExtractor?.getChallengeSignature) {
    let lastSig = window.PixExtractor.getChallengeSignature();
    setInterval(() => {
      const nextSig = window.PixExtractor.getChallengeSignature();
      if (nextSig !== lastSig) {
        lastSig = nextSig;
        extractedChallenge = null;
        if (!isGenerating) {
          statusText.textContent = 'nouvelle question · Alt+S';
        }
      }
    }, 1200);
  }

  // --------------------------------------------------------------------------
  // Déplacement du FAB & de la fenêtre (Clic fiable + Drag propre)
  // --------------------------------------------------------------------------
  let fabDragging = false;
  let fabMoved = false;
  let suppressNextFabClick = false;
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

  fab.addEventListener('click', (e) => {
    if (e.button !== 0) return;
    if (suppressNextFabClick) {
      suppressNextFabClick = false;
      return;
    }
    togglePanel();
  });

  fab.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      togglePanel();
    }
  });

  let isDragging = false;
  let panelMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOffsetX = 0;
  let dragOffsetY = 0;

  let isResizing = false;
  let resizeStartRight = 0;
  let resizeStartBottom = 0;

  dragHandle.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('.pp-mode-switch') || e.target.closest('#pp-shield-badge')) return;
    isDragging = true;
    panelMoved = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    const rect = panel.getBoundingClientRect();
    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;
    panel.style.transition = 'none';
  });

  dragHandle.addEventListener('dblclick', (e) => {
    if (e.target.closest('button') || e.target.closest('.pp-mode-switch') || e.target.closest('#pp-shield-badge')) return;
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
      if (Math.hypot(e.clientX - fabStartX, e.clientY - fabStartY) >= 8) {
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
      if (!panelMoved && Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY) >= 3) {
        panelMoved = true;
      }
      if (panelMoved) {
        const x = Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, e.clientX - dragOffsetX));
        const y = Math.max(8, Math.min(window.innerHeight - panel.offsetHeight - 8, e.clientY - dragOffsetY));
        panel.style.left = `${x}px`;
        panel.style.top = `${y}px`;
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      }
      return;
    }

    if (isResizing) {
      const minW = 310;
      const maxW = Math.min(720, resizeStartRight - 8);
      const minH = 240;
      const maxH = Math.min(window.innerHeight - 24, resizeStartBottom - 8);

      const newW = Math.max(minW, Math.min(maxW, resizeStartRight - e.clientX));
      const newH = Math.max(minH, Math.min(maxH, resizeStartBottom - e.clientY));

      panel.style.width = `${newW}px`;
      panel.style.height = `${newH}px`;
      panel.style.left = `${resizeStartRight - newW}px`;
      panel.style.top = `${resizeStartBottom - newH}px`;
    }
  });

  function finishDragOrResize() {
    if (fabDragging) {
      fabDragging = false;
      fab.style.transition = '';
      if (fabMoved) {
        suppressNextFabClick = true;
        setTimeout(() => { suppressNextFabClick = false; }, 0);
        const left = parseFloat(fab.style.left);
        const top = parseFloat(fab.style.top);
        if (Number.isFinite(left) && Number.isFinite(top)) {
          try { localStorage.setItem('pp_fabPos', JSON.stringify({ left, top })); } catch (_) {}
        }
      }
    }

    if (isDragging) {
      isDragging = false;
      panel.style.transition = '';
      if (panelMoved) {
        const left = parseFloat(panel.style.left);
        const top = parseFloat(panel.style.top);
        if (Number.isFinite(left) && Number.isFinite(top)) {
          try { localStorage.setItem('pp_panelPos', JSON.stringify({ left, top })); } catch (_) {}
        }
      }
      panelMoved = false;
    }

    if (isResizing) {
      isResizing = false;
      panel.style.transition = '';
      const sizeObj = { w: panel.offsetWidth, h: panel.offsetHeight };
      const left = parseFloat(panel.style.left);
      const top = parseFloat(panel.style.top);
      persistPreference('panelSize', sizeObj);
      try {
        localStorage.setItem('pp_panelSize', JSON.stringify(sizeObj));
        if (Number.isFinite(left) && Number.isFinite(top)) {
          localStorage.setItem('pp_panelPos', JSON.stringify({ left, top }));
        }
      } catch (_) {}
    }
  }

  window.addEventListener('mouseup', finishDragOrResize);
  window.addEventListener('blur', finishDragOrResize);

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
  // Ouverture / Fermeture / Nettoyage / Arrêt de génération
  // --------------------------------------------------------------------------
  function setPanelOpen(open) {
    if (isEmbedded && !open) return;
    if (!open && isSettingsOpen()) closeSettings();
    panel.classList.toggle('is-open', open);
    fab.classList.toggle('is-open', open);
    if (open) {
      refreshSelectionState();
      clampPanelWithinViewport();
      if (!config.apiKey && (storedPrefsLoaded || !hasValidChromeStorage())) {
        openSettings();
      } else {
        promptInput.focus();
      }
    }
  }

  function togglePanel() {
    setPanelOpen(!panel.classList.contains('is-open'));
  }

  function setWorkingState(working) {
    isGenerating = working;
    fab.classList.toggle('is-working', working);
    if (statusLed) statusLed.classList.toggle('working', working);
    if (working) {
      btnSend.classList.add('is-stop');
      btnSend.innerHTML = ICONS.stop;
      btnSend.title = 'Arrêter la génération';
      btnSend.disabled = false;
    } else {
      btnSend.classList.remove('is-stop');
      btnSend.innerHTML = ICONS.send;
      btnSend.title = 'Envoyer (Entrée)';
      btnSend.disabled = false;
      activeAbortController = null;
    }
  }

  function stopActiveGeneration() {
    if (activeAbortController) {
      activeAbortController.abort();
      activeAbortController = null;
      statusText.textContent = 'interrompu';
      showToast('génération arrêtée');
    }
  }

  btnClose.addEventListener('click', () => setPanelOpen(false));

  function clearCurrentView() {
    if (isGenerating) stopActiveGeneration();

    if (activeMode === 'chat') {
      chatMessages = [];
      renderedCodeBlocks = [];
      chatBody.querySelectorAll('.pp-chat-msg').forEach(el => el.remove());
      attachedFiles = [];
      renderAttachedFiles();
      saveChatHistory();
      syncBodyCompactState();
      syncInputRowState();
      triggerBrandPulse();
      statusText.textContent = 'nouveau chat';
      showToast('chat réinitialisé');
      return;
    }

    body.querySelectorAll('.pp-result-card').forEach(el => el.remove());
    attachedFiles = [];
    extractedChallenge = null;
    lastAnswers = [];
    lastPixPromptContext = null;
    renderAttachedFiles();
    syncBodyCompactState();
    syncInputRowState();
    triggerBrandPulse();
    statusText.textContent = 'prêt';
  }

  btnClear.addEventListener('click', clearCurrentView);

  // Raccourcis cliquables Pix (empty state)
  body.addEventListener('click', (e) => {
    const kbdBtn = e.target.closest('.pp-kbd-btn');
    if (!kbdBtn) return;
    const action = kbdBtn.dataset.action;
    if (action === 'scan') btnScan.click();
    else if (action === 'cap') takeChallengeScreenshot(false);
    else if (action === 'help') renderHelpCard();
  });

  // Suggestions rapides Chat (empty state)
  chatBody.addEventListener('click', async (e) => {
    const starterBtn = e.target.closest('.pp-starter-chip');
    if (starterBtn) {
      const kind = starterBtn.dataset.starter;
      if (kind === 'summarize') {
        pageContextEnabled = true;
        updatePageContextPill();
        await submitChatMessage('Résume cette page en points clés clairs et concis.');
      } else if (kind === 'explain') {
        pageContextEnabled = true;
        refreshSelectionState();
        const prompt = lastSelectionText
          ? 'Explique clairement le texte sélectionné ci-dessus.'
          : 'Explique le sujet principal et les points importants de cette page.';
        await submitChatMessage(prompt);
      } else if (kind === 'capture') {
        await takeChallengeScreenshot(false);
        if (attachedFiles.some(f => f.type === 'image')) {
          await submitChatMessage('Analyse cette capture d’écran et explique l’essentiel.');
        }
      }
      return;
    }

    // Bouton Copier dans les blocs de code Markdown
    const codeCopyBtn = e.target.closest('.pp-code-copy');
    if (codeCopyBtn) {
      const idx = parseInt(codeCopyBtn.dataset.codeIdx, 10);
      const rawCode = renderedCodeBlocks[idx];
      if (rawCode !== undefined) {
        const ok = await copyToClipboard(rawCode);
        if (ok) {
          codeCopyBtn.textContent = 'Copié ✓';
          setTimeout(() => { codeCopyBtn.textContent = 'Copier'; }, 1400);
        }
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    const pureAlt = e.altKey && !e.ctrlKey && !e.metaKey && !(e.getModifierState && e.getModifierState('AltGraph'));
    if (pureAlt) {
      const k = e.key.toLowerCase();
      if (k === 'p' || e.code === 'KeyP') {
        e.preventDefault();
        togglePanelFromShortcut();
      } else if (k === '1') {
        e.preventDefault();
        if (!panel.classList.contains('is-open')) setPanelOpen(true);
        setActiveMode('pix', true);
      } else if (k === '2') {
        e.preventDefault();
        if (!panel.classList.contains('is-open')) setPanelOpen(true);
        setActiveMode('chat', true);
      } else if (k === 'c') {
        e.preventDefault();
        takeChallengeScreenshot(true);
      } else if (k === 's') {
        e.preventDefault();
        if (!panel.classList.contains('is-open')) setPanelOpen(true);
        if (activeMode !== 'pix') setActiveMode('pix', false);
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
        clearCurrentView();
      }
    } else if (e.key === 'Escape') {
      if (previewModal.classList.contains('is-active')) {
        closeImagePreview();
      } else if (settingsModal.classList.contains('is-active')) {
        closeSettings();
      } else if (!isEmbedded && panel.classList.contains('is-open')) {
        setPanelOpen(false);
      }
    }
  }, true);

  fab.addEventListener('dragover', (e) => e.preventDefault());
  fab.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (!panel.classList.contains('is-open')) setPanelOpen(true);
    const files = Array.from(e.dataTransfer.files || []);
    for (const f of files) await handleFileUpload(f);
  });

  // --------------------------------------------------------------------------
  // Paramètres (Modèle, Effort, Comportement, Clé API)
  // --------------------------------------------------------------------------
  // Réglages appliqués EN DIRECT : chaque option prend effet et est sauvegardée immédiatement
  let saveHintTimer = null;
  let keySaveTimer = null;
  let customModelTimer = null;

  function flashSaved(ok = true) {
    if (!cfgSavedHint) return;
    cfgSavedHint.textContent = ok ? 'Enregistré' : 'Appliqué · F5 pour sauver';
    cfgSavedHint.classList.toggle('is-warn', !ok);
    cfgSavedHint.classList.remove('is-visible');
    void cfgSavedHint.offsetWidth;
    cfgSavedHint.classList.add('is-visible');
    clearTimeout(saveHintTimer);
    saveHintTimer = setTimeout(() => cfgSavedHint.classList.remove('is-visible'), 1600);
  }

  function commitPref(storageKey, value) {
    const ok = persistPreference(storageKey, value);
    flashSaved(ok);
    return ok;
  }

  function updateKeyStatus() {
    if (!cfgKeyStatus) return;
    const k = String(config.apiKey || '').trim();
    cfgKeyStatus.classList.remove('is-ok', 'is-warn');
    if (!k) {
      cfgKeyStatus.textContent = 'Aucune clé · nécessaire pour utiliser l’IA';
      cfgKeyStatus.classList.add('is-warn');
    } else if (/^AIza[0-9A-Za-z_-]{30,}$/.test(k)) {
      cfgKeyStatus.textContent = 'Clé active · stockée uniquement dans l’extension';
      cfgKeyStatus.classList.add('is-ok');
    } else {
      cfgKeyStatus.textContent = 'Format inhabituel · vérifie la clé';
      cfgKeyStatus.classList.add('is-warn');
    }
  }

  function syncSettingsForm() {
    if (shadow.activeElement !== cfgKey) cfgKey.value = config.apiKey || '';
    if (KNOWN_MODELS.includes(config.model)) {
      cfgModel.value = config.model;
      cfgCustomModel.hidden = true;
    } else {
      cfgModel.value = 'custom';
      if (shadow.activeElement !== cfgCustomModel) cfgCustomModel.value = config.model;
      cfgCustomModel.hidden = false;
    }
    renderEffortSelector(config.thinkingLevel);
    if (cfgAutoApply) cfgAutoApply.checked = Boolean(config.autoApply);
    if (cfgGhost) cfgGhost.checked = Boolean(config.ghostMode);
    if (cfgCompact) cfgCompact.checked = Boolean(config.compactMode);
    if (cfgGoogleGlass) cfgGoogleGlass.checked = config.googleGlass !== false;
    if (cfgHideHost && CURRENT_HOST) {
      cfgHideHost.checked = Array.isArray(config.hiddenHosts) && config.hiddenHosts.includes(CURRENT_HOST);
    }
    updateKeyStatus();
  }

  function isSettingsOpen() {
    return settingsModal.classList.contains('is-active');
  }

  function openSettings() {
    syncSettingsForm();
    cfgKey.type = 'password';
    if (cfgToggleKey) cfgToggleKey.classList.remove('is-on');
    settingsModal.classList.add('is-active');
    if (settingsScrim) settingsScrim.classList.add('is-active');
    btnSettings.classList.add('is-active');
    if (!config.apiKey) {
      setTimeout(() => { if (isSettingsOpen()) cfgKey.focus(); }, 280);
    }
  }

  function closeSettings() {
    flushKeySave();
    settingsModal.classList.remove('is-active');
    if (settingsScrim) settingsScrim.classList.remove('is-active');
    btnSettings.classList.remove('is-active');
  }

  btnSettings.addEventListener('click', () => (isSettingsOpen() ? closeSettings() : openSettings()));
  modelBadge.addEventListener('click', openSettings);
  btnCloseSettings.addEventListener('click', closeSettings);
  if (settingsScrim) settingsScrim.addEventListener('click', closeSettings);

  // Effort : appliqué au clic
  if (cfgEffortGroup) {
    cfgEffortGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.pp-effort-btn');
      if (!btn || !btn.dataset.effort) return;
      const lvl = normalizeEffort(btn.dataset.effort);
      if (lvl === config.thinkingLevel) return;
      config.thinkingLevel = lvl;
      updateModelBadge();
      renderEffortSelector(lvl);
      commitPref('thinkingLevel', lvl);
    });
  }

  // Modèle : appliqué au changement
  function applyModel(nextModel) {
    const model = String(nextModel || '').trim() || DEFAULT_MODEL;
    if (model === config.model) return;
    config.model = model;
    updateModelBadge();
    commitPref('geminiModel', model);
  }

  cfgModel.addEventListener('change', () => {
    if (cfgModel.value === 'custom') {
      cfgCustomModel.hidden = false;
      cfgCustomModel.focus();
      if (cfgCustomModel.value.trim()) applyModel(cfgCustomModel.value);
      return;
    }
    cfgCustomModel.hidden = true;
    applyModel(cfgModel.value);
  });

  cfgCustomModel.addEventListener('input', () => {
    clearTimeout(customModelTimer);
    customModelTimer = setTimeout(() => {
      if (cfgCustomModel.value.trim()) applyModel(cfgCustomModel.value);
    }, 500);
  });

  // Clé API : sauvegardée pendant la frappe (debounce) et à la sortie du champ
  function flushKeySave() {
    clearTimeout(keySaveTimer);
    keySaveTimer = null;
    if (!cfgKey) return;
    const key = cfgKey.value.trim();
    if (key === String(config.apiKey || '')) return;
    config.apiKey = key;
    commitPref('geminiApiKey', key);
    updateKeyStatus();
  }

  cfgKey.addEventListener('input', () => {
    clearTimeout(keySaveTimer);
    keySaveTimer = setTimeout(flushKeySave, 600);
  });
  cfgKey.addEventListener('change', flushKeySave);
  cfgKey.addEventListener('blur', flushKeySave);
  cfgKey.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    flushKeySave();
    if (config.apiKey) {
      closeSettings();
      promptInput.focus();
    }
  });

  if (cfgToggleKey) {
    cfgToggleKey.addEventListener('click', () => {
      cfgKey.type = cfgKey.type === 'password' ? 'text' : 'password';
      cfgToggleKey.classList.toggle('is-on', cfgKey.type === 'text');
    });
  }

  // Interrupteurs : effet immédiat
  function bindLiveToggle(el, key) {
    if (!el) return;
    el.addEventListener('change', () => {
      config[key] = el.checked;
      commitPref(key, config[key]);
      syncModeUI();
    });
  }

  bindLiveToggle(cfgAutoApply, 'autoApply');
  bindLiveToggle(cfgGhost, 'ghostMode');
  bindLiveToggle(cfgCompact, 'compactMode');
  bindLiveToggle(cfgGoogleGlass, 'googleGlass');

  if (cfgHideHost) {
    cfgHideHost.addEventListener('change', () => {
      const ok = toggleHideFabOnCurrentHost(cfgHideHost.checked);
      flashSaved(ok);
    });
  }

  // --------------------------------------------------------------------------
  // Capture d'écran GPU & Fichiers
  // --------------------------------------------------------------------------
  async function captureTabDataUrl() {
    const prevRootVis = root.style.visibility;
    if (!isEmbedded) {
      root.style.visibility = 'hidden';
    }

    try {
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise(r => setTimeout(r, 40));

      let dataUrl = null;
      const bgRes = await sendBgMessage({ action: 'capture-visible-tab' }, 10000);
      if (bgRes && bgRes.success && bgRes.dataUrl) {
        dataUrl = bgRes.dataUrl;
      }

      if (!dataUrl && typeof html2canvas !== 'undefined') {
        try {
          const candidates = [
            document.querySelector('article.challenge-item'),
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

      return dataUrl;
    } finally {
      root.style.visibility = prevRootVis;
    }
  }

  async function takeChallengeScreenshot(openIfClosed = false) {
    if (btnScreenshot) btnScreenshot.disabled = true;
    statusText.textContent = 'capture...';

    const dataUrl = await captureTabDataUrl();
    if (btnScreenshot) btnScreenshot.disabled = false;

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
      showToast('capture jointe ✓');
    } else {
      statusText.textContent = 'err: capture';
    }
  }

  btnScreenshot.addEventListener('click', () => takeChallengeScreenshot(false));
  if (chatBtnCap) chatBtnCap.addEventListener('click', () => takeChallengeScreenshot(false));
  btnAttach.addEventListener('click', () => fileInput.click());
  if (chatBtnFile) chatBtnFile.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files || []);
    for (const f of files) await handleFileUpload(f);
    fileInput.value = '';
  });

  panel.addEventListener('dragover', (e) => e.preventDefault());
  panel.addEventListener('drop', async (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    for (const f of files) await handleFileUpload(f);
  });

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
    showToast('image collée ✓');
  });

  promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = `${Math.min(promptInput.scrollHeight, 120)}px`;
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
      showToast(err.message ? err.message.slice(0, 42) : 'fichier illisible');
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
  // Commandes CMD locales
  // --------------------------------------------------------------------------
  function renderHelpCard() {
    if (activeMode === 'chat') {
      const card = appendAssistantChatCard('help');
      const helpMd = [
        '**Commandes rapides :**',
        '- `/chat` ou `Alt+2` · Basculer en mode Chat libre',
        '- `/pix` ou `Alt+1` · Basculer en mode Pix',
        '- `/effort min|low|med|high` · Régler le niveau de réflexion',
        '- `/page` · Activer/couper le contexte de la page web',
        '- `/cap` ou `Alt+C` · Capturer l’onglet actif',
        '- `/ghost` (`Alt+G`) · Mode discret · `/mini` (`Alt+M`) · Format compact',
        '- `/hide` · Masquer le bouton flottant sur ce site (`Alt+P` reste actif)',
        '- `/cls` (`Alt+L`) · Vider la conversation · `/cfg` · Configuration'
      ].join('\n');
      finalizeAssistantChatCard(card, helpMd, 'help', false);
      return;
    }

    const card = document.createElement('div');
    card.className = 'pp-result-card pp-help-card';
    card.innerHTML = `
      <div class="pp-card-meta">
        <div class="pp-cmd-tag"><span class="prompt">&gt;_</span><span>help</span></div>
        <button type="button" class="pp-btn-card-close" title="Fermer">&times;</button>
      </div>
      <div class="pp-help-grid">
        <span class="pp-help-cmd">/scan · Alt+S</span><span class="pp-help-desc">Scanner l'épreuve Pix</span>
        <span class="pp-help-cmd">/chat · Alt+2</span><span class="pp-help-desc">Onglet Chat IA libre</span>
        <span class="pp-help-cmd">/effort high</span><span class="pp-help-desc">Effort (min/low/med/high)</span>
        <span class="pp-help-cmd">/cap · Alt+C</span><span class="pp-help-desc">Capturer l'onglet</span>
        <span class="pp-help-cmd">/apply · Alt+A</span><span class="pp-help-desc">Appliquer réponses</span>
        <span class="pp-help-cmd">/ghost · Alt+G</span><span class="pp-help-desc">Mode discret</span>
        <span class="pp-help-cmd">/mini · Alt+M</span><span class="pp-help-desc">Format compact</span>
        <span class="pp-help-cmd">/hide</span><span class="pp-help-desc">Masquer bouton ici</span>
        <span class="pp-help-cmd">/cls · Alt+L</span><span class="pp-help-desc">Vider la vue</span>
      </div>
    `;
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

    // Commande paramétrée : /effort min|low|med|high
    const effortMatch = normalized.match(/^\/?effort\s+(min|minimal|low|med|medium|high|0)$/);
    if (effortMatch) {
      consumePromptInput();
      setEffortLevel(effortMatch[1], true);
      showToast(`effort : ${config.thinkingLevel}`);
      return true;
    }

    const commandHandlers = {
      '/pix': () => setActiveMode('pix', true),
      '/chat': () => setActiveMode('chat', true),
      '/page': () => {
        if (activeMode !== 'chat') setActiveMode('chat', true);
        pageCtxTogglePill.click();
      },
      '/hide': () => toggleHideFabOnCurrentHost(),
      '/scan': () => { setActiveMode('pix', false); btnScan.click(); },
      scan: () => { if (activeMode === 'pix') btnScan.click(); else return false; },
      '/cap': () => takeChallengeScreenshot(false),
      '/capture': () => takeChallengeScreenshot(false),
      '/apply': () => applyLatestAnswers(),
      '/copy': async () => {
        const toCopy = activeMode === 'chat'
          ? ([...chatMessages].reverse().find(m => m.role === 'model')?.text || '')
          : lastAnswers.join('\n');
        if (toCopy) {
          const ok = await copyToClipboard(toCopy);
          showToast(ok ? 'copié ✓' : 'échec copie');
        } else {
          showToast('rien à copier');
        }
      },
      '/cls': () => clearCurrentView(),
      '/clear': () => clearCurrentView(),
      '/new': () => clearCurrentView(),
      '/ghost': () => toggleGhostMode(),
      '/discret': () => toggleGhostMode(),
      '/mini': () => toggleCompactMode(),
      '/compact': () => toggleCompactMode(),
      '/auto': () => toggleAutoApply(),
      '/cfg': () => openSettings(),
      '/config': () => openSettings(),
      '/settings': () => openSettings(),
      '/help': () => renderHelpCard(),
      '/?': () => renderHelpCard()
    };

    const handler = commandHandlers[normalized];
    if (!handler) return false;
    if (normalized === 'scan' && activeMode !== 'pix') return false;
    consumePromptInput();
    handler();
    return true;
  }

  // --------------------------------------------------------------------------
  // Rendu Markdown riche & XSS-safe pour l'onglet Chat
  // --------------------------------------------------------------------------
  function renderChatMarkdown(rawText, options = {}) {
    const { streaming = false, captureCodeBlocks = true } = options;
    const src = String(rawText || '');
    const codePlaceholders = [];

    const makeCodeBlockHtml = (lang, code, isStreamingOpen = false) => {
      const cleanCode = code.replace(/\r?\n$/, '');
      let codeIdx = -1;
      if (captureCodeBlocks) {
        codeIdx = renderedCodeBlocks.length;
        renderedCodeBlocks.push(cleanCode);
      }
      const langLabel = escapeHtml((lang || 'code').trim());
      return (
        `<div class="pp-code-block${isStreamingOpen ? ' is-streaming-code' : ''}">` +
          `<div class="pp-code-header"><span>${langLabel}</span>` +
          `<button type="button" class="pp-code-copy" data-code-idx="${codeIdx}">Copier</button></div>` +
          `<pre><code>${escapeHtml(cleanCode)}</code></pre>` +
        `</div>`
      );
    };

    // 1. Extraire les blocs de code ```lang ... ``` (y compris le bloc ouvert pendant le streaming)
    let text = src.replace(/```([a-zA-Z0-9_+#.-]*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
      const token = `@@PP_CODE_${codePlaceholders.length}@@`;
      codePlaceholders.push(makeCodeBlockHtml(lang, code, false));
      return `\n${token}\n`;
    });

    if (streaming) {
      text = text.replace(/```([a-zA-Z0-9_+#.-]*)\r?\n([\s\S]*)$/, (_, lang, code) => {
        const token = `@@PP_CODE_${codePlaceholders.length}@@`;
        codePlaceholders.push(makeCodeBlockHtml(lang, code, true));
        return `\n${token}\n`;
      });
    }

    // 2. Transformer ligne par ligne (titres, listes, citations, tables, paragraphes)
    const formatInline = (line) => {
      let s = escapeHtml(line);
      const inlineCodes = [];
      s = s.replace(/`([^`\n]+)`/g, (_, c) => {
        const idx = inlineCodes.length;
        inlineCodes.push(`<code class="pp-inline-code">${c}</code>`);
        return `@@PP_IC_${idx}@@`;
      });
      s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
      s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
      s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
      s = s.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
      s = s.replace(/@@PP_IC_(\d+)@@/g, (_, idx) => inlineCodes[Number(idx)] || '');
      return s;
    };

    const lines = text.split(/\r?\n/);
    const html = [];
    let listType = null; // 'ul' | 'ol'
    let tableRows = [];

    const closeList = () => {
      if (listType) {
        html.push(`</${listType}>`);
        listType = null;
      }
    };

    const flushTable = () => {
      if (tableRows.length === 0) return;
      const [head, ...rest] = tableRows;
      const bodyRows = rest.filter(r => !r.every(c => /^:?-{2,}:?$/.test(c.trim())));
      let tHtml = '<table><thead><tr>' + head.map(c => `<th>${formatInline(c.trim())}</th>`).join('') + '</tr></thead>';
      if (bodyRows.length > 0) {
        tHtml += '<tbody>' + bodyRows.map(r => '<tr>' + r.map(c => `<td>${formatInline(c.trim())}</td>`).join('') + '</tr>').join('') + '</tbody>';
      }
      tHtml += '</table>';
      html.push(tHtml);
      tableRows = [];
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (/^@@PP_CODE_\d+@@$/.test(line)) {
        closeList();
        flushTable();
        const idx = Number(line.match(/\d+/)[0]);
        html.push(codePlaceholders[idx] || '');
        continue;
      }

      if (/^\|.+\|$/.test(line)) {
        closeList();
        const cells = line.slice(1, -1).split('|');
        tableRows.push(cells);
        continue;
      } else {
        flushTable();
      }

      if (!line) {
        closeList();
        continue;
      }

      if (/^---+$/.test(line)) {
        closeList();
        html.push('<hr>');
        continue;
      }

      const hMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (hMatch) {
        closeList();
        const lvl = hMatch[1].length;
        html.push(`<h${lvl}>${formatInline(hMatch[2])}</h${lvl}>`);
        continue;
      }

      if (line.startsWith('> ')) {
        closeList();
        html.push(`<blockquote>${formatInline(line.slice(2))}</blockquote>`);
        continue;
      }

      const ulMatch = line.match(/^[-*•]\s+(.+)$/);
      if (ulMatch) {
        if (listType !== 'ul') {
          closeList();
          listType = 'ul';
          html.push('<ul>');
        }
        html.push(`<li>${formatInline(ulMatch[1])}</li>`);
        continue;
      }

      const olMatch = line.match(/^\d+[.)]\s+(.+)$/);
      if (olMatch) {
        if (listType !== 'ol') {
          closeList();
          listType = 'ol';
          html.push('<ol>');
        }
        html.push(`<li>${formatInline(olMatch[1])}</li>`);
        continue;
      }

      closeList();
      html.push(`<p>${formatInline(line)}</p>`);
    }

    closeList();
    flushTable();
    return html.join('');
  }

  // --------------------------------------------------------------------------
  // Onglet CHAT LIBRE (Multi-tours, Streaming SSE, Contexte page, Régénérer)
  // --------------------------------------------------------------------------
  function appendUserChatBubble(text, metaTags = []) {
    const wrap = document.createElement('div');
    wrap.className = 'pp-chat-msg is-user';

    const bubble = document.createElement('div');
    bubble.className = 'pp-chat-user-bubble';
    bubble.textContent = text;
    wrap.appendChild(bubble);

    if (Array.isArray(metaTags) && metaTags.length > 0) {
      const meta = document.createElement('div');
      meta.className = 'pp-chat-user-meta';
      metaTags.forEach(t => {
        const tag = document.createElement('span');
        tag.className = 'pp-chat-meta-tag';
        tag.textContent = t;
        meta.appendChild(tag);
      });
      wrap.appendChild(meta);
    }

    chatBody.appendChild(wrap);
    syncBodyCompactState();
    chatBody.scrollTop = chatBody.scrollHeight;
    return wrap;
  }

  function appendAssistantChatCard(label) {
    const wrap = document.createElement('div');
    wrap.className = 'pp-chat-msg is-assistant';

    const card = document.createElement('div');
    card.className = 'pp-chat-ai-card is-thinking';
    card.innerHTML = `
      <div class="pp-chat-ai-bar">
        <span class="pp-chat-ai-label"><span class="pp-ai-dot"></span><span class="pp-chat-ai-tag">${escapeHtml(label)}</span></span>
        <div class="pp-msg-actions"></div>
      </div>
      <div class="pp-md">
        <div class="pp-loading-stack">
          <span class="pp-loading-inline"><span class="pp-spinner"></span><span>Réflexion<span class="pp-loading-dots"></span></span></span>
          <div class="pp-skel-group">
            <span class="pp-skel-pill"></span>
            <span class="pp-skel-pill is-short"></span>
          </div>
        </div>
      </div>
    `;

    wrap.appendChild(card);
    chatBody.appendChild(wrap);
    syncBodyCompactState();
    chatBody.scrollTop = chatBody.scrollHeight;
    return card;
  }

  function finalizeAssistantChatCard(card, markdownText, labelText, allowRegen = true, animateReveal = true) {
    const tagEl = card.querySelector('.pp-chat-ai-tag');
    const mdEl = card.querySelector('.pp-md');
    const actionsEl = card.querySelector('.pp-msg-actions');
    const cameFromStream = card.dataset.streamed === '1';

    card.classList.remove('is-thinking', 'is-streaming');
    if (tagEl && labelText) tagEl.textContent = labelText;
    if (mdEl) {
      mdEl.innerHTML = renderChatMarkdown(markdownText);
      if (animateReveal && !cameFromStream) {
        Array.from(mdEl.children).forEach((child, idx) => {
          child.style.setProperty('--pp-b', String(Math.min(idx, 6)));
        });
      }
    }

    if (animateReveal) {
      if (!cameFromStream) pulseClass(card, 'is-fresh', 750);
      card.classList.add('is-settled');
    }

    if (actionsEl) {
      actionsEl.innerHTML = '';
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'pp-micro-btn';
      copyBtn.title = 'Copier la réponse';
      copyBtn.innerHTML = `${ICONS.copy} <span>copier</span>`;
      copyBtn.addEventListener('click', async () => {
        const ok = await copyToClipboard(markdownText);
        if (ok) {
          copyBtn.classList.add('is-ok');
          copyBtn.innerHTML = `${ICONS.check} <span>ok</span>`;
          setTimeout(() => {
            copyBtn.classList.remove('is-ok');
            copyBtn.innerHTML = `${ICONS.copy} <span>copier</span>`;
          }, 1400);
        }
      });
      actionsEl.appendChild(copyBtn);

      if (allowRegen) {
        const regenBtn = document.createElement('button');
        regenBtn.type = 'button';
        regenBtn.className = 'pp-micro-btn';
        regenBtn.title = 'Régénérer la dernière réponse';
        regenBtn.innerHTML = `${ICONS.retry}`;
        regenBtn.addEventListener('click', () => regenerateLastChatMessage());
        actionsEl.appendChild(regenBtn);
      }
    }
  }

  async function regenerateLastChatMessage() {
    if (isGenerating || chatMessages.length === 0) return;
    if (chatMessages[chatMessages.length - 1].role === 'model') {
      chatMessages.pop();
      const allMsgs = chatBody.querySelectorAll('.pp-chat-msg.is-assistant');
      if (allMsgs.length > 0) allMsgs[allMsgs.length - 1].remove();
    }
    const lastUser = chatMessages[chatMessages.length - 1];
    if (!lastUser || lastUser.role !== 'user') return;
    await runChatStreamRequest(null);
  }

  async function submitChatMessage(overrideText = null) {
    if (isGenerating) {
      stopActiveGeneration();
      return;
    }

    if (!config.apiKey) {
      openSettings();
      return;
    }

    const rawText = overrideText !== null ? String(overrideText).trim() : promptInput.value.trim();
    if (!rawText && attachedFiles.length === 0) return;

    const filesToSend = [...attachedFiles];
    const metaTags = filesToSend.map(f => f.name);

    let pageCtx = null;
    if (pageContextEnabled) {
      if (isEmbedded) {
        const bgCtx = await sendBgMessage({ action: 'get-active-tab-context' }, 5000);
        if (bgCtx && bgCtx.success && bgCtx.context) {
          pageCtx = bgCtx.context;
          metaTags.unshift(pageCtx.selection ? '@sélection' : '@page');
        }
      } else if (window.PixExtractor?.extractPageContext) {
        refreshSelectionState();
        pageCtx = window.PixExtractor.extractPageContext();
        if (lastSelectionText && !pageCtx.selection) {
          pageCtx.selection = lastSelectionText;
        }
        metaTags.unshift(pageCtx.selection ? '@sélection' : '@page');
      }
    }

    const userDisplayText = rawText || (filesToSend.length > 0 ? 'Analyse ces éléments.' : '');
    if (overrideText === null) consumePromptInput();

    attachedFiles = [];
    renderAttachedFiles();

    chatMessages.push({
      role: 'user',
      text: userDisplayText,
      files: filesToSend,
      meta: metaTags
    });
    appendUserChatBubble(userDisplayText, metaTags);

    await runChatStreamRequest(pageCtx);
  }

  // --------------------------------------------------------------------------
  // Moteur d'écriture temps réel fluide + micro-corrections humaines rapides
  // --------------------------------------------------------------------------
  const ADJACENT_KEYS = {
    a: 'z', b: 'n', c: 'v', d: 's', e: 'r', f: 'g', g: 'h', h: 'j',
    i: 'o', l: 'k', m: 'p', n: 'b', o: 'i', p: 'o', r: 'e', s: 'd',
    t: 'y', u: 'i', v: 'c', y: 't', z: 'a'
  };

  function isSafeProseContext(prefixText) {
    if (!prefixText) return true;
    // Hors bloc de code ```
    if ((prefixText.match(/```/g) || []).length % 2 === 1) return false;
    const lastNl = prefixText.lastIndexOf('\n');
    const currentLine = lastNl >= 0 ? prefixText.slice(lastNl + 1) : prefixText;
    // Hors inline code `, tableaux, titres Markdown, citations, URL ou commandes
    if ((currentLine.match(/`/g) || []).length % 2 === 1) return false;
    if (/^\s*(?:[|#>\-*+]|\d+\.)/.test(currentLine)) return false;
    if (/(?:https?:\/\/\S*|\[[^\]]*\]\([^)]*|[/@=<$`*0-9]\S*)$/.test(currentLine)) return false;
    return true;
  }

  function createHumanStreamAnimator({ onFrame, signal, streamStartTime }) {
    let target = '';
    let cursor = 0;
    let transientSuffix = '';
    let opsQueue = [];
    let slipCount = 0;
    let falseStartUsed = false;
    let lastSlipAt = -35;
    let timerId = null;
    let draining = false;
    let drainDeadline = 0;
    let finishResolver = null;
    let destroyed = false;

    const MAX_SLIPS = 4;

    const maybeQueueHumanSlip = () => {
      if (draining || prefersReducedMotion() || slipCount >= MAX_SLIPS) return false;
      if (cursor - lastSlipAt < 58) return false;
      const remaining = target.length - cursor;
      if (remaining < 10) return false;

      const prevCh = cursor > 0 ? target[cursor - 1] : '';
      const atClauseStart = cursor === 0 || /(?:[.!?]\s|,\s|\n)$/.test(target.slice(Math.max(0, cursor - 4), cursor));
      const atWordBoundary = cursor === 0 || /[\s('’«]/.test(prevCh);
      if (!atWordBoundary) return false;

      const confirmedPrefix = target.slice(0, cursor);
      if (!isSafeProseContext(confirmedPrefix)) return false;

      const tail = target.slice(cursor);
      const wordMatch = tail.match(/^([a-zàâéèêëîïôöùûüç]{6,})(?=[\s.,;:!?])/);
      if (!wordMatch) return false;
      const word = wordMatch[1];

      // 1. Faux départ rapide en début de clause (1 fois par message long) : tape 4-5 lettres puis les efface visiblement
      if (!falseStartUsed && atClauseStart && cursor > 20) {
        const alt = /^c['’]?e|^cet/.test(word) ? 'pour ' : 'en fait';
        if (!word.startsWith(alt.slice(0, 2))) {
          falseStartUsed = true;
          slipCount++;
          lastSlipAt = cursor;
          for (const ch of alt.slice(0, 5)) {
            opsQueue.push({ act: 'push', ch, ms: 30, edit: false });
          }
          opsQueue.push({ act: 'pause', ms: 145, edit: true });
          for (let i = 0; i < 5; i++) {
            opsQueue.push({ act: 'pop', ms: 42, edit: true });
          }
          opsQueue.push({ act: 'pause', ms: 60, edit: false });
          return true;
        }
      }

      // 2. Inversion de 2 lettres ou faute de frappe adjacente puis correction visible
      slipCount++;
      lastSlipAt = cursor;
      if (word.length >= 7 && word[2] !== word[3]) {
        cursor += 2;
        opsQueue.push({ act: 'push', ch: word[3], ms: 32, edit: false });
        opsQueue.push({ act: 'push', ch: word[2], ms: 34, edit: false });
        opsQueue.push({ act: 'pause', ms: 120, edit: true });
        opsQueue.push({ act: 'pop', ms: 48, edit: true });
        opsQueue.push({ act: 'pop', ms: 45, edit: true });
        opsQueue.push({ act: 'pause', ms: 45, edit: false });
        return true;
      }

      const keyChar = word[3]?.toLowerCase();
      const wrong = ADJACENT_KEYS[keyChar];
      if (wrong && wrong !== keyChar) {
        cursor += 3;
        opsQueue.push({ act: 'push', ch: wrong, ms: 32, edit: false });
        opsQueue.push({ act: 'pause', ms: 115, edit: true });
        opsQueue.push({ act: 'pop', ms: 50, edit: true });
        opsQueue.push({ act: 'pause', ms: 40, edit: false });
        return true;
      }
      return false;
    };

    const emitFrame = (isEditing) => {
      onFrame(target.slice(0, cursor) + transientSuffix, { isEditing: Boolean(isEditing) });
    };

    const stopTimer = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const completeDrain = () => {
      stopTimer();
      opsQueue = [];
      transientSuffix = '';
      cursor = target.length;
      if (finishResolver) {
        const res = finishResolver;
        finishResolver = null;
        res();
      }
    };

    const nextCharDelay = (ch, baseMs) => {
      if (/[.!?]/.test(ch)) return baseMs + 48;
      if (/[,;:\n]/.test(ch)) return baseMs + 24;
      return baseMs;
    };

    const step = () => {
      timerId = null;
      if (destroyed || signal?.aborted) {
        completeDrain();
        return;
      }

      // Laisser les micro-corrections démarrées se dérouler jusqu'à effacement complet
      if (opsQueue.length > 0 && (!draining || performance.now() < drainDeadline)) {
        const op = opsQueue.shift();
        if (op.act === 'push') {
          transientSuffix += op.ch;
        } else if (op.act === 'pop') {
          transientSuffix = transientSuffix.slice(0, -1);
        }
        emitFrame(op.edit);
        timerId = setTimeout(step, op.ms || 32);
        return;
      }

      if (draining && performance.now() >= drainDeadline) {
        completeDrain();
        return;
      }

      // Sécurité : purger un éventuel suffixe transitoire avant d'avancer
      if (opsQueue.length === 0 && transientSuffix) {
        transientSuffix = '';
      }

      const remaining = target.length - cursor;
      if (remaining <= 0) {
        if (draining) {
          completeDrain();
        }
        return;
      }

      // En flux normal (ou en drain long si aucune erreur n'a encore eu lieu), placer une micro-correction naturelle
      const allowSlipNow = !draining || (target.length >= 90 && (drainDeadline - performance.now()) > 500);
      if (allowSlipNow && opsQueue.length === 0 && maybeQueueHumanSlip()) {
        emitFrame(false);
        timerId = setTimeout(step, 24);
        return;
      }

      if (draining) {
        const timeLeft = Math.max(18, drainDeadline - performance.now());
        const stepMs = 18;
        const framesLeft = Math.max(1, Math.floor(timeLeft / stepMs));
        const chunk = Math.max(1, Math.ceil(remaining / framesLeft));
        cursor = Math.min(target.length, cursor + chunk);
        const lastCh = target[cursor - 1] || '';
        emitFrame(false);
        if (cursor >= target.length) {
          completeDrain();
          return;
        }
        timerId = setTimeout(step, chunk === 1 ? nextCharDelay(lastCh, stepMs) : stepMs);
        return;
      }

      // Rythme humain lisible en prose (~45-95 car/s), un peu plus vif dans les blocs de code
      const inCodeOrStruct = !isSafeProseContext(target.slice(0, cursor));
      const advance = inCodeOrStruct
        ? (remaining > 60 ? 5 : 3)
        : remaining > 220
          ? Math.min(3, Math.ceil(remaining / 110))
          : remaining > 90
            ? 2
            : 1;
      cursor = Math.min(target.length, cursor + advance);
      const lastCh = target[cursor - 1] || '';
      emitFrame(false);

      if (cursor < target.length) {
        const baseDelay = inCodeOrStruct ? 14 : (remaining > 90 ? 15 : 21);
        timerId = setTimeout(step, inCodeOrStruct ? baseDelay : nextCharDelay(lastCh, baseDelay));
      }
    };

    return {
      pushTarget(nextText) {
        if (destroyed) return;
        target = String(nextText || '');
        if (!timerId && (cursor < target.length || opsQueue.length > 0)) {
          step();
        }
      },
      finish(finalText) {
        target = String(finalText || target || '');
        if (destroyed || signal?.aborted || prefersReducedMotion() || cursor >= target.length) {
          completeDrain();
          return Promise.resolve();
        }
        draining = true;
        const streamElapsed = performance.now() - streamStartTime;
        const remaining = target.length - cursor;
        const isTinyQuick = streamElapsed < 110 && target.length < 75;
        if (isTinyQuick) {
          opsQueue = [];
          transientSuffix = '';
        }
        const capMs = isTinyQuick
          ? 55
          : Math.min(3600, Math.max(480, Math.round(remaining * 17)));
        drainDeadline = performance.now() + capMs;

        return new Promise((resolve) => {
          finishResolver = resolve;
          if (!timerId) {
            step();
          }
        });
      },
      abort() {
        destroyed = true;
        completeDrain();
      }
    };
  }

  async function runChatStreamRequest(pageCtx) {
    const modelLabel = `${modelBadge.textContent}`;
    const aiCard = appendAssistantChatCard(`${modelLabel} · ...`);
    const mdEl = aiCard.querySelector('.pp-md');
    const tagEl = aiCard.querySelector('.pp-chat-ai-tag');

    activeAbortController = new AbortController();
    setWorkingState(true);

    const startTime = performance.now();
    statusText.textContent = 'chat 0.0s';
    const timerInterval = setInterval(() => {
      const secs = ((performance.now() - startTime) / 1000).toFixed(1);
      statusText.textContent = `chat ${secs}s`;
    }, 100);

    let streamedText = '';

    const renderLiveFrame = (displayStr, { isEditing }) => {
      if (!displayStr) return;
      if (aiCard.dataset.streamed !== '1') {
        aiCard.dataset.streamed = '1';
        aiCard.classList.remove('is-thinking');
        aiCard.classList.add('is-streaming');
      }
      const atBottom = (chatBody.scrollHeight - chatBody.scrollTop - chatBody.clientHeight) < 88;
      mdEl.innerHTML = renderChatMarkdown(displayStr, { streaming: true, captureCodeBlocks: false });

      // Place le curseur directement au bout du dernier bloc de texte en cours d'écriture
      const caret = document.createElement('span');
      caret.className = `pp-stream-caret${isEditing ? ' is-editing' : ''}`;
      const caretHost = mdEl.querySelector('p:last-child, li:last-child, blockquote:last-child, h1:last-child, h2:last-child, h3:last-child, h4:last-child, pre:last-child code') || mdEl;
      caretHost.appendChild(caret);

      if (atBottom) chatBody.scrollTop = chatBody.scrollHeight;
    };

    const animator = createHumanStreamAnimator({
      onFrame: renderLiveFrame,
      signal: activeAbortController.signal,
      streamStartTime: startTime
    });

    try {
      const finalText = await window.PixGemini.streamChat({
        apiKey: config.apiKey,
        model: config.model,
        thinkingLevel: config.thinkingLevel,
        messages: chatMessages,
        pageContext: pageCtx,
        signal: activeAbortController.signal,
        onStreamChunk: (accumulated) => {
          streamedText = accumulated;
          animator.pushTarget(accumulated);
        }
      });

      const cleanFinal = (finalText || streamedText || '').trim() || '_Réponse vide._';
      await animator.finish(cleanFinal);

      clearInterval(timerInterval);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

      chatMessages.push({ role: 'model', text: cleanFinal, meta: { label: `${modelLabel} · ${elapsed}s` } });
      finalizeAssistantChatCard(aiCard, cleanFinal, `${modelLabel} · ${elapsed}s`, true, true);
      chatBody.scrollTop = chatBody.scrollHeight;
      statusText.textContent = `ok (${elapsed}s)`;

      try {
        saveChatHistory();
      } catch (storageErr) {
        console.warn('[PixPilot] Sauvegarde historique chat ignorée:', storageErr?.message || storageErr);
      }
    } catch (err) {
      animator.abort();
      clearInterval(timerInterval);
      aiCard.classList.remove('is-thinking', 'is-streaming');
      if (err.name === 'AbortError') {
        const partial = streamedText.trim();
        if (partial) {
          chatMessages.push({ role: 'model', text: partial, meta: { label: `${modelLabel} · stop` } });
          finalizeAssistantChatCard(aiCard, partial, `${modelLabel} · stop`, true, true);
          try {
            saveChatHistory();
          } catch (storageErr) {
            console.warn('[PixPilot] Sauvegarde partielle ignorée:', storageErr?.message || storageErr);
          }
        } else {
          aiCard.closest('.pp-chat-msg')?.remove();
          syncBodyCompactState();
        }
      } else {
        const msg = err?.message || 'Erreur inconnue';
        const isCtxErr = /extension context invalidated/i.test(msg);
        const partial = streamedText.trim();
        if (partial && isCtxErr) {
          chatMessages.push({ role: 'model', text: partial, meta: { label: `${modelLabel} · ok` } });
          finalizeAssistantChatCard(aiCard, partial, `${modelLabel} · ok`, true, true);
          chatBody.scrollTop = chatBody.scrollHeight;
          statusText.textContent = 'ok · F5 pour synchro';
        } else {
          aiCard.classList.add('is-error');
          if (tagEl) tagEl.textContent = 'erreur';
          const displayMsg = isCtxErr
            ? 'Extension rechargée : rafraîchis cet onglet (F5) pour reconnecter PixPilot.'
            : msg;
          mdEl.innerHTML = `<span style="color:var(--pp-danger);font-family:var(--pp-font-mono);font-size:11px;">${escapeHtml(displayMsg)}</span>`;
          statusText.textContent = 'error';
        }
      }
    } finally {
      animator.abort();
      clearInterval(timerInterval);
      setWorkingState(false);
    }
  }

  // --------------------------------------------------------------------------
  // Mode PIX : Scan, Capture auto, Auto-Fetch, Résolution & Explication
  // --------------------------------------------------------------------------
  function checkHasVisualContent(challenge) {
    if (challenge && challenge.failedImageCount > 0) return true;
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
    statusText.textContent = 'cap: visuel...';
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
    btnScan.innerHTML = `<span class="pp-spinner"></span><span>Analyse…</span>`;
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
      btnScan.innerHTML = `${ICONS.scan}<span>Scanner</span><span class="pp-key-hint">Alt S</span>`;
    }
  });

  function dispatchSubmit() {
    if (isGenerating) {
      stopActiveGeneration();
      return;
    }
    const raw = promptInput.value.trim();
    if (raw) {
      if (cmdHistory[0] !== raw) cmdHistory.unshift(raw);
      if (cmdHistory.length > 30) cmdHistory.pop();
      cmdHistoryIdx = -1;
    }
    if (tryExecuteLocalCommand(raw)) return;

    if (activeMode === 'chat') {
      submitChatMessage();
    } else {
      submitToGemini(false);
    }
  }

  btnSend.addEventListener('click', dispatchSubmit);

  promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      dispatchSubmit();
      return;
    }

    if (e.key === 'ArrowUp' && cmdHistory.length > 0 && promptInput.selectionStart === 0) {
      e.preventDefault();
      cmdHistoryIdx = Math.min(cmdHistory.length - 1, cmdHistoryIdx + 1);
      promptInput.value = cmdHistory[cmdHistoryIdx] || '';
      promptInput.style.height = 'auto';
      promptInput.style.height = `${Math.min(promptInput.scrollHeight, 120)}px`;
      syncInputRowState();
    } else if (e.key === 'ArrowDown' && cmdHistoryIdx >= 0) {
      e.preventDefault();
      cmdHistoryIdx = cmdHistoryIdx - 1;
      promptInput.value = cmdHistoryIdx >= 0 ? cmdHistory[cmdHistoryIdx] : '';
      promptInput.style.height = 'auto';
      promptInput.style.height = `${Math.min(promptInput.scrollHeight, 120)}px`;
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
      labels.push(challenge.questionType === 'qcm-multiple' ? 'Cases à cocher multiples' : 'Choix unique');
    }
    return labels;
  }

  function getExpectedAnswerCount(challenge) {
    if (!challenge) return 0;
    const inputCount = Array.isArray(challenge.inputs) ? challenge.inputs.length : 0;
    const selectCount = Array.isArray(challenge.selects) ? challenge.selects.length : 0;
    if (inputCount > 0 || selectCount > 0) return inputCount + selectCount;
    if (challenge.questionType === 'qcm-unique') return 1;
    return 0;
  }

  function tryExtractWordFromRowAnswers(answersList) {
    if (!answersList || answersList.length <= 1) return null;
    if (answersList.every(a => a.trim().length === 1)) {
      return answersList.map(a => a.trim()).join('');
    }
    const lastParts = answersList.map(a => {
      const m = a.trim().match(/(?:^|[,;|:\s])([a-zA-ZÀ-ÿ0-9])['"`\s]*$/);
      return m ? m[1] : null;
    });
    if (lastParts.every(Boolean)) return lastParts.join('');
    const codeMatch = answersList.map(a => {
      const m = a.match(/(?:code|indice|lettre|mot)\s*[:=]\s*([a-zA-ZÀ-ÿ0-9])/i);
      return m ? m[1] : null;
    });
    if (codeMatch.every(Boolean)) return codeMatch.join('');
    return null;
  }

  function sanitizeExcelDateOutput(ans, promptText = '') {
    if (!ans || typeof ans !== 'string') return ans;
    if (!/format de cellule|nouveau format|afficher la cellule|cellule\s+[A-Z]\d+|format.*date/i.test(promptText)) return ans;
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
      if (matchPattern.test(res)) res = res.replace(matchPattern, `$1${m.full}$2`);
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
      try {
        await autoCaptureIfVisual(extractedChallenge);
      } catch (err) {
        console.warn('[PixPilot] Auto-capture warning:', err);
      }
    }

    // Téléchargement automatique des fichiers joints Pix
    const failedAutoFetches = [];
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

            const acceptBlob = (candidateBlob, candidateCt) => {
              if (!candidateBlob || candidateBlob.size === 0) return false;
              const lowerCt = (candidateCt || candidateBlob.type || '').toLowerCase();
              if (lowerCt.includes('text/html')) return false;
              return true;
            };

            try {
              const resp = await fetch(dl.url, { mode: 'cors' });
              if (resp.ok) {
                const candidateCt = (resp.headers.get('content-type') || '').toLowerCase();
                const candidateBlob = await resp.blob();
                if (acceptBlob(candidateBlob, candidateCt)) {
                  blob = candidateBlob;
                  cd = resp.headers.get('content-disposition') || '';
                  ct = candidateCt || (blob.type || '').toLowerCase();
                }
              }
            } catch (err) {
              console.warn('[PixPilot] Direct CORS fetch failed:', err?.message || err);
            }

            if (!blob) {
              try {
                const resp = await fetch(dl.url, { credentials: 'omit' });
                if (resp.ok) {
                  const candidateCt = (resp.headers.get('content-type') || '').toLowerCase();
                  const candidateBlob = await resp.blob();
                  if (acceptBlob(candidateBlob, candidateCt)) {
                    blob = candidateBlob;
                    cd = resp.headers.get('content-disposition') || '';
                    ct = candidateCt || (blob.type || '').toLowerCase();
                  }
                }
              } catch (err) {
                console.warn('[PixPilot] Fetch omit failed:', err?.message || err);
              }
            }

            if (!blob) {
              const bgRes = await sendBgMessage({ action: 'fetch-file-base64', url: dl.url }, 20000);
              const bgCt = (bgRes?.contentType || '').toLowerCase();
              if (bgRes && bgRes.success && bgRes.base64 && !bgCt.includes('text/html')) {
                const binStr = atob(bgRes.base64);
                const bytes = new Uint8Array(binStr.length);
                for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
                ct = bgCt;
                cd = bgRes.contentDisposition || '';
                blob = new Blob([bytes], { type: ct });
              }
            }

            if (!blob) {
              failedAutoFetches.push(dl.name);
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
            fetchedFamilies.add(fileFamily(fileName.split('.').pop()));
            fetchedFamilies.add(fileFamily(dl.ext));
            renderAttachedFiles();
          } catch (e) {
            console.warn('[PixPilot] Auto-fetch attachment warning:', e);
            failedAutoFetches.push(dl.name);
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
        <div class="pp-loading-stack" style="width:100%;">
          <div class="pp-loading-inline">
            <span class="pp-spinner"></span>
            <span>Analyse en cours<span class="pp-loading-dots"></span></span>
          </div>
          <span class="pp-skel-pill is-short"></span>
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

    const attachCardMetaActions = (allowExplain = true) => {
      if (allowExplain && lastPixPromptContext) {
        const explainBtn = document.createElement('button');
        explainBtn.type = 'button';
        explainBtn.className = 'pp-btn-card-close';
        explainBtn.title = 'Expliquer dans le Chat';
        explainBtn.textContent = '?';
        explainBtn.addEventListener('click', () => {
          const ctx = lastPixPromptContext;
          setActiveMode('chat', true);
          submitChatMessage(`Explique étape par étape pourquoi la réponse à cette question Pix est : ${ctx.answers.join(' / ')}\n\nContexte :\n${ctx.prompt.slice(0, 2200)}`);
        });
        metaActionsGroup.appendChild(explainBtn);

        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'pp-btn-card-close';
        retryBtn.title = 'Re-scanner';
        retryBtn.innerHTML = ICONS.retry;
        retryBtn.addEventListener('click', () => btnScan.click());
        metaActionsGroup.appendChild(retryBtn);
      }

      const closeCardBtn = document.createElement('button');
      closeCardBtn.type = 'button';
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

    activeAbortController = new AbortController();
    setWorkingState(true);

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
        thinkingLevel: config.thinkingLevel,
        userPrompt: fullPrompt,
        files: filesToSend,
        images: imagesToSend,
        signal: activeAbortController.signal
      });

      let finalAnswers = Array.isArray(response.answers) ? [...response.answers] : [];
      let querySuccess = false;

      if (dataTables.length > 0 && typeof window.PixQueryEngine !== 'undefined' && Array.isArray(response.queries) && response.queries.length > 0) {
        const hasExplicitFields = response.queries.some(q => Number.isInteger(q?.field) && q.field >= 1);
        if (hasExplicitFields) {
          const mergedAnswers = [...finalAnswers];
          let appliedQueries = 0;
          for (const q of response.queries) {
            try {
              const res = window.PixQueryEngine.execute(dataTables, q);
              if (res && res.ok && Array.isArray(res.answers) && res.answers.length > 0 && Number.isInteger(q.field) && q.field >= 1) {
                mergedAnswers[q.field - 1] = res.answers.join(' | ');
                appliedQueries++;
              }
            } catch (qe) {
              console.warn('[PixPilot] Query execution err:', qe);
            }
          }
          if (appliedQueries > 0) {
            finalAnswers = mergedAnswers;
            querySuccess = true;
          }
        } else {
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
          if (qAnswers.length > 0 && (qAnswers.length >= finalAnswers.length || finalAnswers.length === 0)) {
            finalAnswers = qAnswers;
            querySuccess = true;
          }
        }
      }

      const isSingleTextInputOnly = challengeSnapshot?.inputs?.length === 1 &&
        (!challengeSnapshot?.options || challengeSnapshot.options.length === 0) &&
        (!challengeSnapshot?.selects || challengeSnapshot.selects.length === 0);

      if (isSingleTextInputOnly && finalAnswers.length > 1) {
        const extractedWord = tryExtractWordFromRowAnswers(finalAnswers);
        if (extractedWord) finalAnswers = [extractedWord];
      }

      if (isSingleTextInputOnly && finalAnswers.length > 1 && !querySuccess) {
        statusText.textContent = 'corr: 1 mot...';
        try {
          const correctionPrompt = `ERREUR : La page Pix comporte UNIQUEMENT 1 champ de saisie ("${fieldLabels[0] || 'Mot'}").
Tu as renvoyé ${finalAnswers.length} items (${finalAnswers.slice(0, 3).join(' | ')}...).
Donne UNIQUEMENT la valeur UNIQUE finale attendue.
<answers><item>valeur_unique</item></answers>`;
          const retryRes = await window.PixGemini.generateAnswer({
            apiKey: config.apiKey,
            model: config.model,
            thinkingLevel: config.thinkingLevel,
            userPrompt: fullPrompt + '\n\n' + correctionPrompt,
            files: filesToSend,
            images: imagesToSend,
            signal: activeAbortController.signal
          });
          if (retryRes && Array.isArray(retryRes.answers) && retryRes.answers.length === 1) {
            finalAnswers = retryRes.answers;
            if (retryRes.explanation) response.explanation = retryRes.explanation;
          }
        } catch (retryErr) {
          console.warn('[PixPilot] Correction retry error:', retryErr);
        }
      }

      const mentionsLetterChart = /lettres?\s*s'affichent|forme(?:nt)?\s*la\s*lettre|diagramme.*lettre|barres.*lettre/i.test(fullPrompt);
      if (!querySuccess && mentionsLetterChart && dataTables.some(t => t.detectedBarWord)) {
        const detected = dataTables.find(t => t.detectedBarWord)?.detectedBarWord;
        if (detected) finalAnswers = [detected.toUpperCase()];
      }

      const mentionsSalesTotal = /montant\s*total\s*(?:des\s*)?ventes|chiffre\s*d'affaires|quantit[eé]\s*vendue\s*[×x*]\s*prix/i.test(fullPrompt);
      if (!querySuccess && mentionsSalesTotal && dataTables.some(t => t.detectedSumproduct)) {
        const spTable = dataTables.find(t => t.detectedSumproduct);
        if (spTable) {
          if (expectedCount <= 1) finalAnswers = [String(spTable.detectedSumproduct)];
          else if (expectedCount === 2 && spTable.detectedSumproductFormula) {
            finalAnswers = [String(spTable.detectedSumproduct), spTable.detectedSumproductFormula];
          }
        }
      }

      const birthYearMatch = fullPrompt.match(/ann[eé]e\s+de\s+naissance\s+d['’]([a-zA-ZÀ-ÿ\s-]+)/i);
      if (!querySuccess && birthYearMatch) {
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
          if (cleanLetters.length === 4) finalAnswers[0] = cleanLetters;
        }
      }

      clearInterval(timerInterval);
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

      if (cmdStatus) {
        let tagText = `${cmdTitle} · ${elapsed}s`;
        if (finalAnswers.length > 1) tagText += ` · ${finalAnswers.length} items`;
        if (querySuccess) tagText += ' · [calc]';
        else if (attachedFileNames.length > 0) tagText += ` · [${attachedFileNames[0]}]`;
        else if (failedAutoFetches.length > 0) tagText += ' · [!]';
        cmdStatus.textContent = tagText;
      }

      if (failedAutoFetches.length > 0 && attachedFileNames.length === 0) {
        const warnNotice = document.createElement('div');
        warnNotice.className = 'pp-file-alert';
        warnNotice.innerHTML = `[!] <span>Fichier non lu (${escapeHtml(failedAutoFetches.join(', '))}). Glisse-le ou clique sur <strong>Fichier</strong>.</span>`;
        answersDisplay.before(warnNotice);
      }

      lastAnswers = finalAnswers;
      lastPixPromptContext = { prompt: fullPrompt, answers: finalAnswers };
      resultCard.classList.remove('is-loading');
      pulseClass(resultCard, 'is-complete', 900);
      const answersRevealPromise = renderAnswers(finalAnswers, answersDisplay, metaActionsGroup);
      attachCardMetaActions(true);

      if (config.autoApply && finalAnswers.length > 0) {
        try {
          const appliedCount = await applyLatestAnswers();
          if (appliedCount > 0) pulseClass(resultCard, 'is-applied', 1050);
          statusText.textContent = appliedCount > 0 ? `applied: ${appliedCount} (${elapsed}s)` : `ok (${elapsed}s)`;
        } catch (applyErr) {
          console.warn('[PixPilot] auto-apply ignoré:', applyErr?.message || applyErr);
          statusText.textContent = `ok (${elapsed}s)`;
        }
      } else {
        statusText.textContent = `ok (${elapsed}s)`;
      }

      await answersRevealPromise;

      if (response.explanation && response.explanation.trim()) {
        explanationSection.classList.remove('is-empty');
        await runTypewriterAnimation(response.explanation, typewriterText);
      }
    } catch (err) {
      clearInterval(timerInterval);
      resultCard.classList.remove('is-loading');
      if (err.name === 'AbortError') {
        dismissCard(resultCard);
      } else {
        console.error(err);
        if (cmdStatus) {
          cmdStatus.textContent = `${cmdTitle} · err`;
          cmdStatus.style.color = 'var(--pp-danger)';
        }
        const msg = /extension context invalidated/i.test(err?.message || '')
          ? 'Extension rechargée : rafraîchis cet onglet (F5) pour reconnecter PixPilot.'
          : (err?.message || 'Erreur inconnue');
        answersDisplay.innerHTML = `<span style="color: var(--pp-danger); font-size: 11px; font-family: var(--pp-font-mono);">${escapeHtml(msg)}</span>`;
        attachCardMetaActions(false);
        statusText.textContent = 'error';
      }
    } finally {
      clearInterval(timerInterval);
      setWorkingState(false);
    }
  }

  // --------------------------------------------------------------------------
  // Affichage progressif des réponses Pix
  // --------------------------------------------------------------------------
  async function streamTextProgressive(targetEl, rawText, { startDelayMs = 0, totalDurationCapMs = 260 } = {}) {
    const text = String(rawText ?? '');
    if (!text) return;
    if (prefersReducedMotion()) {
      targetEl.textContent = text;
      return;
    }
    if (startDelayMs > 0) await new Promise(r => setTimeout(r, startDelayMs));

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
    setTimeout(() => { if (caret.isConnected) caret.remove(); }, 160);
  }

  async function copyTextWithFeedback(textToCopy, hostEl, toastMsg = 'copié ✓') {
    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      if (hostEl) pulseClass(hostEl, 'is-copied', 520);
      if (toastMsg) showToast(toastMsg);
    } else {
      showToast('échec copie');
    }
  }

  function renderAnswers(answers, container, actionsHeader) {
    container.innerHTML = '';
    actionsHeader.innerHTML = '';

    if (!answers || answers.length === 0) {
      container.className = 'pp-single-answer-box';
      container.innerHTML = `<span style="color: var(--pp-text-secondary); font-size: 11px; font-family: var(--pp-font-mono);">aucune réponse détectée</span>`;
      return Promise.resolve();
    }

    if (answers.length === 1) {
      container.className = 'pp-single-answer-box is-revealed';
      const ans = answers[0];

      const textEl = document.createElement('span');
      textEl.className = 'pp-answer-text';
      textEl.title = 'Cliquer pour copier';
      textEl.addEventListener('click', () => copyTextWithFeedback(ans, container, 'copié ✓'));

      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'pp-header-actions-group';
      actionsWrap.appendChild(createApplyButton(answers));
      actionsWrap.appendChild(createCopyButton(ans, container));

      container.appendChild(textEl);
      container.appendChild(actionsWrap);
      return streamTextProgressive(textEl, ans, { startDelayMs: 25, totalDurationCapMs: 260 });
    }

    container.className = 'pp-multi-answers-grid';
    actionsHeader.appendChild(createApplyButton(answers));

    const copyAllBtn = document.createElement('button');
    copyAllBtn.type = 'button';
    copyAllBtn.className = 'pp-btn-action';
    copyAllBtn.innerHTML = `${ICONS.copy} <span>Tout</span>`;
    copyAllBtn.addEventListener('click', async () => {
      await copyTextWithFeedback(answers.join('\n'), copyAllBtn, null);
      copyAllBtn.innerHTML = `${ICONS.check} <span>OK</span>`;
      copyAllBtn.style.color = 'var(--pp-cmd-green)';
      setTimeout(() => {
        copyAllBtn.innerHTML = `${ICONS.copy} <span>Tout</span>`;
        copyAllBtn.style.color = '';
      }, 1600);
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
        startDelayMs: staggerIndex * 55 + 35,
        totalDurationCapMs: 220
      });
    });

    return Promise.all(streamPromises);
  }

  function createCopyButton(textToCopy, hostEl = null) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pp-btn-action';
    btn.title = 'Copier';
    btn.innerHTML = ICONS.copy;

    btn.addEventListener('click', async () => {
      await copyTextWithFeedback(textToCopy, hostEl || btn, null);
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
    btn.type = 'button';
    btn.className = 'pp-btn-action primary';
    btn.title = 'Appliquer sur la page (Alt+A)';
    btn.innerHTML = `${ICONS.bolt} <span>Appliquer</span>`;

    btn.addEventListener('click', async () => {
      const count = window.PixExtractor?.autoApplyAnswers
        ? await window.PixExtractor.autoApplyAnswers(answers)
        : 0;
      btn.innerHTML = count > 0 ? `${ICONS.check} <span>${count}</span>` : `<span>0</span>`;
      setTimeout(() => {
        btn.innerHTML = `${ICONS.bolt} <span>Appliquer</span>`;
      }, 1600);
    });

    return btn;
  }

  async function runTypewriterAnimation(fullText, container) {
    const text = (fullText || '').trim();
    if (!text) return;
    if (prefersReducedMotion()) {
      container.innerHTML = formatLightMarkdown(text);
      return;
    }
    container.innerHTML = '';
    const textNode = document.createTextNode('');
    const cursor = document.createElement('span');
    cursor.className = 'pp-cursor';
    container.appendChild(textNode);
    container.appendChild(cursor);

    const stepSize = text.length > 260 ? 3 : text.length > 120 ? 2 : 1;
    for (let i = 0; i < text.length; i += stepSize) {
      textNode.nodeValue = text.slice(0, i + stepSize);
      await new Promise(r => setTimeout(r, 13));
    }
    cursor.classList.add('is-done');
    await new Promise(r => setTimeout(r, 110));
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
    div.textContent = String(str ?? '');
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
      setTimeout(() => toast.remove(), 320);
    }, 1700);
  }

  // Initialisation finale
  loadStoredPreferences();
  setActiveMode(activeMode, false);
  if (isEmbedded) {
    shell.classList.add('is-embedded');
    setPanelOpen(true);
  }
})();
