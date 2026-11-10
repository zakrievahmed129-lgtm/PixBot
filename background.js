/**
 * PixPilot - Service Worker
 * Gère l'initialisation, les raccourcis clavier, la capture d'écran et la communication.
 */

chrome.runtime.onInstalled.addListener(() => {
  const defaultApiKey = 'AQ.Ab8RN6L3GTYcNvQ4NRRpzTxYcns9jRauXN_besAXxCGTY7Qbmg';
  chrome.storage.local.get(['geminiApiKey', 'geminiModel'], (data) => {
    const updates = {};
    if (!data.geminiApiKey) {
      updates.geminiApiKey = defaultApiKey;
    }
    if (!data.geminiModel) {
      updates.geminiModel = 'gemini-2.5-flash';
    }
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });
});

// Écoute des commandes de raccourcis configurées dans le navigateur
chrome.commands?.onCommand?.addListener((command) => {
  if (command === 'toggle-pixpilot') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle-panel' });
      }
    });
  }
});

// Écoute des messages des scripts de contenu (ex: capture d'écran visuelle du quiz)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture-visible-tab') {
    const windowId = sender?.tab?.windowId ?? null;
    try {
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({ success: false, error: chrome.runtime.lastError?.message || 'Capture non disponible' });
        } else {
          sendResponse({ success: true, dataUrl: dataUrl });
        }
      });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true; // Réponse asynchrone
  }
});
