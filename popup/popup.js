document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const toggleKeyBtn = document.getElementById('toggle-key-visibility');
  const modelSelect = document.getElementById('model-select');
  const customModelInput = document.getElementById('custom-model-input');
  const saveBtn = document.getElementById('save-btn');
  const saveFeedback = document.getElementById('save-feedback');
  const statusDot = document.getElementById('status-dot');

  const DEFAULT_KEY = 'AQ.Ab8RN6L3GTYcNvQ4NRRpzTxYcns9jRauXN_besAXxCGTY7Qbmg';

  // Charger la configuration existante
  chrome.storage.local.get(['geminiApiKey', 'geminiModel'], (data) => {
    const activeKey = data.geminiApiKey || DEFAULT_KEY;
    apiKeyInput.value = activeKey;
    statusDot.classList.add('is-active');

    if (data.geminiModel) {
      const known = ['gemini-2.5-flash', 'gemini-2.0-flash-lite', 'gemini-3.1-flash-lite', 'gemini-1.5-flash'];
      if (known.includes(data.geminiModel)) {
        modelSelect.value = data.geminiModel;
      } else {
        modelSelect.value = 'custom';
        customModelInput.value = data.geminiModel;
        customModelInput.style.display = 'block';
      }
    }
  });

  // Afficher / masquer le mot de passe
  toggleKeyBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
  });

  // Changement de modèle
  modelSelect.addEventListener('change', () => {
    customModelInput.style.display = modelSelect.value === 'custom' ? 'block' : 'none';
  });

  // Sauvegarder
  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    let model = modelSelect.value;
    if (model === 'custom') {
      model = customModelInput.value.trim() || 'gemini-2.5-flash';
    }

    chrome.storage.local.set({
      geminiApiKey: key,
      geminiModel: model
    }, () => {
      saveFeedback.style.display = 'block';
      if (key) {
        statusDot.classList.add('is-active');
      } else {
        statusDot.classList.remove('is-active');
      }
      setTimeout(() => {
        saveFeedback.style.display = 'none';
      }, 2000);
    });
  });
});

