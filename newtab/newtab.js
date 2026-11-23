(function () {
  const form = document.getElementById('nt-search-form');
  const input = document.getElementById('nt-search-input');
  const openAiBtn = document.getElementById('nt-open-ai');
  const grid = document.getElementById('nt-shortcuts-grid');

  const scrim = document.getElementById('nt-modal-scrim');
  const scForm = document.getElementById('nt-shortcut-form');
  const scName = document.getElementById('nt-sc-name');
  const scUrl = document.getElementById('nt-sc-url');
  const scClose = document.getElementById('nt-modal-close');
  const scCancel = document.getElementById('nt-modal-cancel');

  const BRAND_ICONS = {
    pix: `<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="6" fill="#5B5BF0"/><path d="M9 17V8h4.2a3.2 3.2 0 0 1 0 6.4H9" stroke="#fff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    youtube: `<svg viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="4.5" fill="#FF0033"/><path d="M10 9l6 3-6 3V9z" fill="#fff"/></svg>`,
    gmail: `<svg viewBox="0 0 24 24" fill="none"><path d="M4 7.5V18a1.5 1.5 0 0 0 1.5 1.5H8v-7.2L12 15l4-2.7v7.2h2.5A1.5 1.5 0 0 0 20 18V7.5l-8 5.5-8-5.5z" fill="#EA4335"/><path d="M4 7.5A1.5 1.5 0 0 1 6.4 6.3L12 10.2l5.6-3.9A1.5 1.5 0 0 1 20 7.5l-8 5.5-8-5.5z" fill="#4285F4"/></svg>`,
    gemini: `<svg viewBox="0 0 24 24" fill="none"><defs><linearGradient id="ntGem" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse"><stop stop-color="#4E8EFF"/><stop offset="1" stop-color="#A86BFF"/></linearGradient></defs><path d="M12 2.5c.4 0 .7.3.8.6l1.3 4.4a5.2 5.2 0 0 0 3.4 3.4l4.4 1.3c.3.1.6.4.6.8s-.3.7-.6.8l-4.4 1.3a5.2 5.2 0 0 0-3.4 3.4l-1.3 4.4c-.1.3-.4.6-.8.6s-.7-.3-.8-.6l-1.3-4.4a5.2 5.2 0 0 0-3.4-3.4l-4.4-1.3c-.3-.1-.6-.4-.6-.8s.3-.7.6-.8l4.4-1.3a5.2 5.2 0 0 0 3.4-3.4l1.3-4.4c.1-.3.4-.6.8-.6z" fill="url(#ntGem)"/></svg>`,
    chatgpt: `<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" fill="#10A37F"/><g stroke="#fff" stroke-width="1.5" stroke-linejoin="round"><polygon points="12,5.8 17.4,8.9 17.4,15.1 12,18.2 6.6,15.1 6.6,8.9" opacity="0.9"/><circle cx="12" cy="12" r="2.2" fill="#fff"/></g></svg>`,
    github: `<svg viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C6.48 2 2 6.58 2 12.26c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.62.07-.62 1 .07 1.53 1.06 1.53 1.06.89 1.57 2.34 1.12 2.91.85.09-.66.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.08 0-1.12.39-2.04 1.03-2.76-.1-.26-.45-1.31.1-2.72 0 0 .84-.28 2.75 1.05A9.3 9.3 0 0 1 12 6.96c.85 0 1.71.12 2.51.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.46.1 2.72.64.72 1.03 1.64 1.03 2.76 0 3.95-2.34 4.82-4.57 5.07.36.32.68.94.68 1.9 0 1.37-.01 2.48-.01 2.82 0 .27.18.59.69.49A10.02 10.02 0 0 0 22 12.26C22 6.58 17.52 2 12 2z"/></svg>`
  };

  const PLUS_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

  const DEFAULT_SHORTCUTS = [
    { name: 'Pix', url: 'https://app.pix.fr', icon: 'pix' },
    { name: 'YouTube', url: 'https://www.youtube.com', icon: 'youtube' },
    { name: 'Gmail', url: 'https://mail.google.com', icon: 'gmail' },
    { name: 'Gemini', url: 'https://gemini.google.com', icon: 'gemini' },
    { name: 'ChatGPT', url: 'https://chatgpt.com', icon: 'chatgpt' },
    { name: 'GitHub', url: 'https://github.com', icon: 'github' }
  ];

  let shortcuts = [...DEFAULT_SHORTCUTS];

  function detectIconKey(url, fallback) {
    if (fallback && BRAND_ICONS[fallback]) return fallback;
    const u = String(url || '').toLowerCase();
    if (u.includes('pix.fr') || u.includes('pix.org')) return 'pix';
    if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
    if (u.includes('mail.google.com')) return 'gmail';
    if (u.includes('gemini.google.com')) return 'gemini';
    if (u.includes('chatgpt.com') || u.includes('openai.com')) return 'chatgpt';
    if (u.includes('github.com')) return 'github';
    return null;
  }

  function saveShortcuts() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local && chrome.runtime?.id) {
        chrome.storage.local.set({ newtabShortcuts: shortcuts }, () => { void chrome.runtime?.lastError; });
        return;
      }
      localStorage.setItem('pp_newtabShortcuts', JSON.stringify(shortcuts));
    } catch (_) {}
  }

  function loadShortcuts() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage?.local && chrome.runtime?.id) {
        chrome.storage.local.get(['newtabShortcuts'], (res) => {
          void chrome.runtime?.lastError;
          if (Array.isArray(res?.newtabShortcuts) && res.newtabShortcuts.length > 0) {
            shortcuts = res.newtabShortcuts.slice(0, 8);
          }
          renderShortcuts();
        });
        return;
      }
      const saved = JSON.parse(localStorage.getItem('pp_newtabShortcuts') || 'null');
      if (Array.isArray(saved) && saved.length > 0) shortcuts = saved.slice(0, 8);
    } catch (_) {}
    renderShortcuts();
  }

  function renderShortcuts() {
    if (!grid) return;
    grid.innerHTML = '';

    shortcuts.forEach((sc, idx) => {
      const tile = document.createElement('a');
      tile.className = 'nt-tile';
      tile.href = sc.url;
      tile.title = sc.url;

      const orb = document.createElement('div');
      orb.className = 'nt-tile-orb';
      const iconKey = detectIconKey(sc.url, sc.icon);
      if (iconKey) {
        orb.innerHTML = BRAND_ICONS[iconKey];
      } else {
        const letter = document.createElement('span');
        letter.className = 'nt-tile-letter';
        letter.textContent = (sc.name || '?').trim().charAt(0).toUpperCase();
        orb.appendChild(letter);
      }

      const label = document.createElement('span');
      label.className = 'nt-tile-label';
      label.textContent = sc.name;

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'nt-tile-remove';
      removeBtn.title = 'Supprimer';
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        shortcuts.splice(idx, 1);
        if (shortcuts.length === 0) shortcuts = [...DEFAULT_SHORTCUTS];
        saveShortcuts();
        renderShortcuts();
      });

      tile.appendChild(removeBtn);
      tile.appendChild(orb);
      tile.appendChild(label);
      grid.appendChild(tile);
    });

    if (shortcuts.length < 8) {
      const addTile = document.createElement('button');
      addTile.type = 'button';
      addTile.className = 'nt-tile';
      addTile.title = 'Ajouter un raccourci';

      const orb = document.createElement('div');
      orb.className = 'nt-tile-orb';
      orb.innerHTML = PLUS_ICON;

      const label = document.createElement('span');
      label.className = 'nt-tile-label';
      label.textContent = 'Ajouter';

      addTile.appendChild(orb);
      addTile.appendChild(label);
      addTile.addEventListener('click', () => openShortcutModal());
      grid.appendChild(addTile);
    }
  }

  function openShortcutModal() {
    if (!scrim) return;
    scName.value = '';
    scUrl.value = '';
    scrim.hidden = false;
    setTimeout(() => scName.focus(), 40);
  }

  function closeShortcutModal() {
    if (!scrim) return;
    scrim.hidden = true;
  }

  scClose?.addEventListener('click', closeShortcutModal);
  scCancel?.addEventListener('click', closeShortcutModal);
  scrim?.addEventListener('click', (e) => {
    if (e.target === scrim) closeShortcutModal();
  });

  scForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = scName.value.trim();
    let url = scUrl.value.trim();
    if (!name || !url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      shortcuts.push({ name: name.slice(0, 24), url: parsed.toString() });
      saveShortcuts();
      renderShortcuts();
      closeShortcutModal();
    } catch (_) {}
  });

  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = (input?.value || '').trim();
    if (!q) return;

    if (/^https?:\/\//i.test(q)) {
      location.href = q;
      return;
    }
    if (!/\s/.test(q) && /^[a-z0-9.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(q)) {
      location.href = `https://${q}`;
      return;
    }
    location.href = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.shiftKey) {
      e.preventDefault();
      openAiBtn?.click();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && scrim && !scrim.hidden) {
      closeShortcutModal();
      return;
    }
    if (e.key === '/' && (!scrim || scrim.hidden) && document.activeElement !== input && document.activeElement?.id !== 'pixpilot-root') {
      e.preventDefault();
      input?.focus();
    }
  });

  openAiBtn?.addEventListener('click', () => {
    const q = (input?.value || '').trim();
    if (q) input.value = '';
    window.dispatchEvent(new CustomEvent('pixpilot:open', { detail: { mode: 'chat', prompt: q } }));
  });

  loadShortcuts();
})();
