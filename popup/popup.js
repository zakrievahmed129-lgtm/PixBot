document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const toggleKeyBtn = document.getElementById('toggle-key-visibility');
  const modelSelect = document.getElementById('model-select');
  const customModelInput = document.getElementById('custom-model-input');
  const saveFeedback = document.getElementById('save-feedback');
  const statusDot = document.getElementById('status-dot');
  const keyStatus = document.getElementById('key-status');

  const openPanelBtn = document.getElementById('open-panel-btn');
  const openChatBtn = document.getElementById('open-chat-btn');
  const openSidePanelBtn = document.getElementById('open-sidepanel-btn');
  const effortGroup = document.getElementById('effort-group');
  const effortHint = document.getElementById('effort-hint');

  const optAutoApply = document.getElementById('opt-auto-apply');
  const optGhostMode = document.getElementById('opt-ghost-mode');
  const optCompactMode = document.getElementById('opt-compact-mode');
  const optGoogleGlass = document.getElementById('opt-google-glass');
  const hideHostRow = document.getElementById('hide-host-row');
  const hideHostLabel = document.getElementById('hide-host-label');
  const optHideHost = document.getElementById('opt-hide-host');

  const scopePill = document.getElementById('scope-pill');

  const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
  const KNOWN_MODELS = ['gemini-3.5-flash-lite', 'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash-lite'];
  const EFFORT_LABELS = { minimal: 'Minimal', low: 'Bas', medium: 'Moyen', high: 'Élevé' };

  let currentEffort = 'high';
  let currentModel = DEFAULT_MODEL;
  let currentKey = '';
  let activeHost = '';
  let activeTabObj = null;
  let hiddenHosts = [];
  let hintTimer = null;
  let keySaveTimer = null;
  let customModelTimer = null;

  function isWebTabInjectable(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    try {
      const ownNewTab = chrome.runtime?.getURL ? rawUrl.startsWith(chrome.runtime.getURL('newtab/')) : false;
      if (ownNewTab) return true;
      const u = new URL(rawUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'file:') return false;
      const h = u.hostname.toLowerCase();
      if (h === 'chromewebstore.google.com') return false;
      if (h === 'chrome.google.com' && u.pathname.startsWith('/webstore')) return false;
      if (/\.pdf(?:$|[?#])/i.test(u.pathname)) return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function showFeedback(text = 'Enregistré', isError = false) {
    if (!saveFeedback) return;
    saveFeedback.textContent = text;
    saveFeedback.classList.toggle('is-error', isError);
    saveFeedback.classList.remove('is-visible');
    void saveFeedback.offsetWidth;
    saveFeedback.classList.add('is-visible');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      saveFeedback.classList.remove('is-visible');
    }, 1800);
  }

  function saveStorage(patch, okText = 'Enregistré') {
    chrome.storage.local.set(patch, () => {
      if (chrome.runtime?.lastError) {
        showFeedback(chrome.runtime.lastError.message || 'Erreur sauvegarde', true);
        return;
      }
      showFeedback(okText, false);
    });
  }

  function updateKeyIndicator(keyVal) {
    const k = String(keyVal || '').trim();
    statusDot.classList.toggle('is-active', Boolean(k));
    if (!keyStatus) return;
    keyStatus.classList.remove('is-ok', 'is-warn');
    if (!k) {
      keyStatus.textContent = 'Aucune clé · requise pour utiliser l’IA';
      keyStatus.classList.add('is-warn');
    } else if (/^AIza[0-9A-Za-z_-]{30,}$/.test(k)) {
      keyStatus.textContent = 'Clé active · prête à l’emploi';
      keyStatus.classList.add('is-ok');
    } else {
      keyStatus.textContent = 'Format inhabituel · vérifie ta clé';
      keyStatus.classList.add('is-warn');
    }
  }

  function renderEffortButtons(level) {
    const v = String(level || 'high').toLowerCase().trim();
    currentEffort = ['minimal', 'low', 'medium', 'high'].includes(v) ? v : 'high';
    if (effortHint) effortHint.textContent = EFFORT_LABELS[currentEffort] || currentEffort;
    if (effortGroup) {
      effortGroup.dataset.level = currentEffort;
      effortGroup.querySelectorAll('.effort-btn').forEach(btn => {
        const active = btn.dataset.effort === currentEffort;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', String(active));
      });
    }
  }

  function applyStateToForm(data) {
    if (!data) return;
    if (data.geminiApiKey !== undefined) {
      currentKey = typeof data.geminiApiKey === 'string' ? data.geminiApiKey : '';
      if (document.activeElement !== apiKeyInput) {
        apiKeyInput.value = currentKey;
      }
      updateKeyIndicator(currentKey);
    }
    if (data.geminiModel !== undefined) {
      currentModel = data.geminiModel || DEFAULT_MODEL;
      if (KNOWN_MODELS.includes(currentModel)) {
        modelSelect.value = currentModel;
        customModelInput.hidden = true;
      } else {
        modelSelect.value = 'custom';
        if (document.activeElement !== customModelInput) {
          customModelInput.value = currentModel;
        }
        customModelInput.hidden = false;
      }
    }
    if (data.thinkingLevel !== undefined) {
      renderEffortButtons(data.thinkingLevel);
    }
    if (data.autoApply !== undefined && optAutoApply) {
      optAutoApply.checked = Boolean(data.autoApply);
    }
    if (data.ghostMode !== undefined && optGhostMode) {
      optGhostMode.checked = Boolean(data.ghostMode);
    }
    if (data.compactMode !== undefined && optCompactMode) {
      optCompactMode.checked = Boolean(data.compactMode);
    }
    if (data.googleGlass !== undefined && optGoogleGlass) {
      optGoogleGlass.checked = data.googleGlass !== false;
    }
    if (data.hiddenHosts !== undefined) {
      hiddenHosts = Array.isArray(data.hiddenHosts) ? data.hiddenHosts : [];
      if (optHideHost && activeHost) {
        optHideHost.checked = hiddenHosts.includes(activeHost);
      }
    }
  }

  // Charger en parallèle l'onglet actif et le stockage pour éviter toute race condition
  const getActiveTab = new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      void chrome.runtime?.lastError;
      resolve(tabs && tabs[0] ? tabs[0] : null);
    });
  });

  const getStoredConfig = new Promise((resolve) => {
    chrome.storage.local.get(
      ['geminiApiKey', 'geminiModel', 'thinkingLevel', 'autoApply', 'ghostMode', 'compactMode', 'googleGlass', 'hiddenHosts'],
      (data) => {
        void chrome.runtime?.lastError;
        resolve(data || {});
      }
    );
  });

  Promise.all([getActiveTab, getStoredConfig]).then(([tab, data]) => {
    activeTabObj = tab || null;
    if (tab?.url) {
      try {
        const u = new URL(tab.url);
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          activeHost = u.hostname;
          const isPix = /(^|\.)pix\.(fr|org)$/i.test(activeHost);
          if (isPix && scopePill) {
            scopePill.textContent = 'Bouclier : actif';
            scopePill.classList.add('is-on');
          } else if (scopePill) {
            scopePill.textContent = 'Bouclier : veille';
          }
          if (hideHostRow && hideHostLabel) {
            hideHostRow.hidden = false;
            hideHostLabel.textContent = `Sur ${activeHost} · Alt+P reste actif`;
          }
        }
      } catch (_) { }
    }

    applyStateToForm({
      geminiApiKey: '',
      geminiModel: DEFAULT_MODEL,
      thinkingLevel: 'high',
      autoApply: false,
      ghostMode: false,
      compactMode: false,
      googleGlass: true,
      hiddenHosts: [],
      ...data
    });
  });

  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area && area !== 'local') return;
    const patch = {};
    for (const k of Object.keys(changes)) {
      patch[k] = changes[k].newValue;
    }
    applyStateToForm(patch);
  });

  function openNativeSidePanelSync() {
    if (!chrome.sidePanel?.open) return false;
    const target = activeTabObj?.id
      ? { tabId: activeTabObj.id }
      : { windowId: chrome.windows?.WINDOW_ID_CURRENT };
    try {
      chrome.sidePanel.open(target).catch(() => {});
      window.close();
      return true;
    } catch (_) {
      return false;
    }
  }

  function sendTabAction(payload) {
    // Sur chrome://, PDF, Chrome Web Store : ouvrir le panneau latéral natif immédiatement dans le geste utilisateur
    if (!activeTabObj?.id || !isWebTabInjectable(activeTabObj.url)) {
      if (!openNativeSidePanelSync()) {
        showFeedback('Page protégée par Chrome', true);
      }
      return;
    }

    chrome.tabs.sendMessage(activeTabObj.id, payload, () => {
      if (!chrome.runtime?.lastError) {
        window.close();
        return;
      }
      // Onglet ouvert avant l'installation : injecter sans F5 via background.js
      chrome.runtime.sendMessage({
        action: 'inject-and-open',
        tabId: activeTabObj.id,
        url: activeTabObj.url,
        payload
      }, (res) => {
        if (chrome.runtime?.lastError || !res?.success) {
          showFeedback('Rafraîchis l’onglet (F5)', true);
          return;
        }
        window.close();
      });
    });
  }

  openPanelBtn?.addEventListener('click', () => sendTabAction({ action: 'toggle-panel' }));
  openChatBtn?.addEventListener('click', () => sendTabAction({ action: 'open-mode', mode: 'chat' }));
  openSidePanelBtn?.addEventListener('click', openNativeSidePanelSync);

  effortGroup?.addEventListener('click', (e) => {
    const btn = e.target.closest('.effort-btn');
    if (!btn || !btn.dataset.effort) return;
    if (btn.dataset.effort === currentEffort) return;
    renderEffortButtons(btn.dataset.effort);
    saveStorage({ thinkingLevel: currentEffort });
  });

  [
    [optAutoApply, 'autoApply'],
    [optGhostMode, 'ghostMode'],
    [optCompactMode, 'compactMode'],
    [optGoogleGlass, 'googleGlass']
  ].forEach(([el, key]) => {
    if (!el) return;
    el.addEventListener('change', () => {
      saveStorage({ [key]: el.checked });
    });
  });

  optHideHost?.addEventListener('change', () => {
    if (!activeHost) return;
    const set = new Set(hiddenHosts);
    if (optHideHost.checked) set.add(activeHost);
    else set.delete(activeHost);
    hiddenHosts = Array.from(set);
    saveStorage({ hiddenHosts });
  });

  modelSelect.addEventListener('change', () => {
    if (modelSelect.value === 'custom') {
      customModelInput.hidden = false;
      customModelInput.focus();
      const customVal = customModelInput.value.trim();
      if (customVal) {
        currentModel = customVal;
        saveStorage({ geminiModel: customVal });
      }
      return;
    }
    customModelInput.hidden = true;
    currentModel = modelSelect.value;
    saveStorage({ geminiModel: currentModel });
  });

  customModelInput.addEventListener('input', () => {
    clearTimeout(customModelTimer);
    customModelTimer = setTimeout(() => {
      const val = customModelInput.value.trim() || DEFAULT_MODEL;
      currentModel = val;
      saveStorage({ geminiModel: val });
    }, 450);
  });

  function flushKeySave() {
    clearTimeout(keySaveTimer);
    keySaveTimer = null;
    const nextKey = apiKeyInput.value.trim();
    if (nextKey === currentKey) return;
    currentKey = nextKey;
    updateKeyIndicator(nextKey);
    saveStorage({ geminiApiKey: nextKey });
  }

  apiKeyInput.addEventListener('input', () => {
    clearTimeout(keySaveTimer);
    keySaveTimer = setTimeout(flushKeySave, 500);
  });
  apiKeyInput.addEventListener('change', flushKeySave);
  apiKeyInput.addEventListener('blur', flushKeySave);
  apiKeyInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      flushKeySave();
    }
  });
  window.addEventListener('pagehide', flushKeySave);

  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    toggleKeyBtn.classList.toggle('is-on', isPassword);
  });
});
