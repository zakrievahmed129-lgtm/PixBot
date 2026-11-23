/**
 * PixPilot - Google Search Glass Theme
 * Habille Google Recherche (en-tête, barre, puces, Aperçu IA replié/déployé,
 * sources, suivi "Posez une question", résultats) dans le style ovale & glass
 * minimaliste de PixPilot, avec détection auto clair/sombre et respect du layout.
 */
(function () {
  if (typeof window === 'undefined' || window.PixGoogleGlass) return;

  function isGoogleSearchUrl(hostname, pathname) {
    try {
      const h = String(hostname || '').toLowerCase();
      const p = String(pathname || '');
      return /^(?:www\.)?google\.(?:com|fr|be|ch|ca|de|co\.uk|es|it|nl|lu|pt|pl|ma|dz|tn|com\.\w+|co\.\w+)$/.test(h) &&
        p.startsWith('/search');
    } catch (_) {
      return false;
    }
  }

  const isGoogleSearchPage = (() => {
    try {
      if (location.protocol === 'file:' && document.documentElement?.dataset?.ppTestGoogleSearch === '1') {
        return true;
      }
      return isGoogleSearchUrl(location.hostname, location.pathname);
    } catch (_) {
      return false;
    }
  })();

  const GLASS_CSS = `
    html[data-pp-google-glass="on"] {
      --pp-g-bg: #f6f7fb;
      --pp-g-glow:
        radial-gradient(circle at 16% 8%, rgba(91, 91, 240, 0.10), transparent 44%),
        radial-gradient(circle at 86% 78%, rgba(34, 211, 238, 0.08), transparent 48%);
      --pp-g-header: rgba(246, 247, 251, 0.84);
      --pp-g-card: rgba(255, 255, 255, 0.72);
      --pp-g-card-hover: rgba(255, 255, 255, 0.88);
      --pp-g-ai: rgba(255, 255, 255, 0.78);
      --pp-g-fade-mid: rgba(249, 250, 253, 0.72);
      --pp-g-fade-end: rgba(248, 249, 253, 0.96);
      --pp-g-followup: rgba(255, 255, 255, 0.88);
      --pp-g-pill: rgba(15, 23, 42, 0.045);
      --pp-g-pill-hover: rgba(15, 23, 42, 0.085);
      --pp-g-border: rgba(15, 23, 42, 0.08);
      --pp-g-border-ai: rgba(91, 91, 240, 0.24);
      --pp-g-border-strong: rgba(91, 91, 240, 0.40);
      --pp-g-accent: #5b5bf0;
      --pp-g-ring: rgba(91, 91, 240, 0.14);
      --pp-g-inset: inset 0 1px 0 rgba(255, 255, 255, 0.65);
      --pp-g-shadow: 0 14px 38px -20px rgba(15, 23, 42, 0.16), 0 2px 8px -2px rgba(15, 23, 42, 0.05);
      --pp-g-ai-shadow: 0 22px 54px -26px rgba(91, 91, 240, 0.20), 0 6px 18px -10px rgba(15, 23, 42, 0.07);
      --pp-g-followup-shadow: 0 16px 38px -14px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.75);
    }

    html[data-pp-google-glass="on"][data-pp-google-theme="dark"] {
      --pp-g-bg: #101116;
      --pp-g-glow:
        radial-gradient(circle at 18% 10%, rgba(124, 128, 255, 0.11), transparent 44%),
        radial-gradient(circle at 84% 82%, rgba(56, 189, 248, 0.07), transparent 48%);
      --pp-g-header: rgba(16, 17, 22, 0.84);
      --pp-g-card: rgba(255, 255, 255, 0.036);
      --pp-g-card-hover: rgba(255, 255, 255, 0.062);
      --pp-g-ai: rgba(24, 26, 35, 0.66);
      --pp-g-fade-mid: rgba(22, 24, 33, 0.74);
      --pp-g-fade-end: rgba(22, 24, 33, 0.96);
      --pp-g-followup: rgba(20, 22, 32, 0.84);
      --pp-g-pill: rgba(255, 255, 255, 0.055);
      --pp-g-pill-hover: rgba(255, 255, 255, 0.105);
      --pp-g-border: rgba(255, 255, 255, 0.085);
      --pp-g-border-ai: rgba(139, 139, 255, 0.24);
      --pp-g-border-strong: rgba(139, 139, 255, 0.42);
      --pp-g-accent: #8b8bff;
      --pp-g-ring: rgba(139, 139, 255, 0.18);
      --pp-g-inset: inset 0 1px 0 rgba(255, 255, 255, 0.06);
      --pp-g-shadow: 0 18px 46px -22px rgba(0, 0, 0, 0.62), 0 2px 10px -2px rgba(0, 0, 0, 0.30);
      --pp-g-ai-shadow: 0 24px 60px -24px rgba(0, 0, 0, 0.72), inset 0 1px 0 rgba(255, 255, 255, 0.07);
      --pp-g-followup-shadow: 0 18px 42px -12px rgba(0, 0, 0, 0.78), inset 0 1px 0 rgba(255, 255, 255, 0.07);
    }

    html[data-pp-google-glass="on"],
    html[data-pp-google-glass="on"] body {
      background-color: var(--pp-g-bg) !important;
      background-image: var(--pp-g-glow) !important;
      background-attachment: fixed !important;
    }

    /* En-tête : transparent en haut de page (zéro bande à y=16), verre flouté dès que l'en-tête fixe apparaît au scroll */
    html[data-pp-google-glass="on"] #searchform {
      background: transparent !important;
      border-bottom-color: transparent !important;
    }

    html[data-pp-google-glass="on"] #searchform.minidiv,
    html[data-pp-google-glass="on"] [data-pp-gs="pinned-header"] {
      background: var(--pp-g-header) !important;
      backdrop-filter: blur(24px) saturate(165%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(165%) !important;
      box-sizing: border-box !important;
      border-bottom: 0 !important;
      box-shadow: inset 0 -1px 0 var(--pp-g-border) !important;
    }

    /* Conteneurs structurels de Google rendus transparents pour laisser respirer le fond */
    html[data-pp-google-glass="on"] #cnt,
    html[data-pp-google-glass="on"] #rcnt,
    html[data-pp-google-glass="on"] #center_col,
    html[data-pp-google-glass="on"] #rhs,
    html[data-pp-google-glass="on"] #main,
    html[data-pp-google-glass="on"] #search,
    html[data-pp-google-glass="on"] #appbar,
    html[data-pp-google-glass="on"] #extabar,
    html[data-pp-google-glass="on"] #top_nav,
    html[data-pp-google-glass="on"] #hdtb,
    html[data-pp-google-glass="on"] #hdtb-msb,
    html[data-pp-google-glass="on"] #botstuff,
    html[data-pp-google-glass="on"] #footcnt,
    html[data-pp-google-glass="on"] #fbar {
      background: transparent !important;
      background-image: none !important;
      border-color: var(--pp-g-border) !important;
    }

    /* Wrappers opaques et dégradés de Google neutralisés (ex: DIV.Zze5V, DIV.zNsLfb, SPAN.G8GJkb) */
    html[data-pp-google-glass="on"] [data-pp-gs="transparent-wrap"],
    html[data-pp-google-glass="on"] [data-pp-gs="transparent-wrap"]::before,
    html[data-pp-google-glass="on"] [data-pp-gs="transparent-wrap"]::after,
    html[data-pp-google-glass="on"] [data-pp-gs-clear="1"],
    html[data-pp-google-glass="on"] [data-pp-gs-clear="1"]::before,
    html[data-pp-google-glass="on"] [data-pp-gs-clear="1"]::after {
      background: transparent !important;
      background-color: transparent !important;
      background-image: none !important;
      box-shadow: none !important;
      border-color: transparent !important;
    }

    /* Dégradé confiné à l'intérieur de l'Aperçu IA replié (remplace la plaque DIV.iIXkZe qui débordait de 210px) */
    html[data-pp-google-glass="on"] [data-pp-gs="ai-fade-mask"] {
      left: 0 !important;
      right: 0 !important;
      width: auto !important;
      bottom: 0 !important;
      border-radius: 0 0 25px 25px !important;
      background: transparent !important;
      background-image: linear-gradient(to bottom, transparent 0%, var(--pp-g-fade-mid) 52%, var(--pp-g-fade-end) 88%) !important;
      pointer-events: none !important;
    }

    /* Alignement exact de l'enveloppe absolue d'"Afficher plus" avec le texte interne (x = +20px sans cumul) */
    html[data-pp-google-glass="on"] [data-pp-gs="ai-show-more-wrap"] {
      left: 20px !important;
      margin-left: 0 !important;
    }

    /* Bouton "Afficher plus" en pilule glass assortie */
    html[data-pp-google-glass="on"] [data-pp-gs="ai-show-more"] {
      background: var(--pp-g-pill) !important;
      backdrop-filter: blur(14px) saturate(150%) !important;
      -webkit-backdrop-filter: blur(14px) saturate(150%) !important;
      border: 1px solid var(--pp-g-border-ai) !important;
      border-radius: 999px !important;
      box-shadow: var(--pp-g-inset) !important;
      transition: background-color 0.2s ease, border-color 0.2s ease !important;
    }

    html[data-pp-google-glass="on"] [data-pp-gs="ai-show-more"]:hover {
      background: var(--pp-g-pill-hover) !important;
      border-color: var(--pp-g-border-strong) !important;
    }

    /* Séparateurs parasites adoucis ou masqués */
    html[data-pp-google-glass="on"] [data-pp-gs="divider-soft"] {
      border-color: var(--pp-g-border) !important;
    }

    html[data-pp-google-glass="on"] [data-pp-gs="divider-hide"] {
      border-color: transparent !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }

    /* Barre de recherche Google en pilule glass */
    html[data-pp-google-glass="on"] .RNNXgb,
    html[data-pp-google-glass="on"] [data-pp-gs="search-bar"] {
      background: var(--pp-g-card) !important;
      backdrop-filter: blur(22px) saturate(165%) !important;
      -webkit-backdrop-filter: blur(22px) saturate(165%) !important;
      border: 1px solid var(--pp-g-border) !important;
      border-radius: 999px !important;
      box-shadow: var(--pp-g-inset), var(--pp-g-shadow) !important;
      transition: border-color 0.24s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.24s cubic-bezier(0.22, 1, 0.36, 1) !important;
    }

    html[data-pp-google-glass="on"] .RNNXgb:focus-within,
    html[data-pp-google-glass="on"] [data-pp-gs="search-bar"]:focus-within {
      border-color: var(--pp-g-border-strong) !important;
      box-shadow: 0 0 0 3px var(--pp-g-ring), var(--pp-g-shadow) !important;
    }

    /* Supprimer les couches internes empilées dans la barre de recherche (×, micro, Lens : .SDkEP, .dRYYxd, .ywK6Rd...) */
    html[data-pp-google-glass="on"] [data-pp-gs="search-bar"] > div,
    html[data-pp-google-glass="on"] [data-pp-gs="search-bar"] .SDkEP,
    html[data-pp-google-glass="on"] [data-pp-gs="search-bar"] .dRYYxd,
    html[data-pp-google-glass="on"] [data-pp-gs="search-bar"] .ywK6Rd,
    html[data-pp-google-glass="on"] [data-pp-gs="search-bar"] .A1IcJ,
    html[data-pp-google-glass="on"] [data-pp-gs="search-bar"] .WMDtKb,
    html[data-pp-google-glass="on"] [data-pp-gs="search-bar"] .Sw4CSc,
    html[data-pp-google-glass="on"] .RNNXgb > div,
    html[data-pp-google-glass="on"] .RNNXgb .SDkEP,
    html[data-pp-google-glass="on"] .RNNXgb .dRYYxd,
    html[data-pp-google-glass="on"] .RNNXgb .ywK6Rd {
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
    }

    html[data-pp-google-glass="on"] [data-pp-gs="search-bar"] .ACRAdd,
    html[data-pp-google-glass="on"] .RNNXgb .ACRAdd {
      border-left-color: var(--pp-g-border) !important;
    }

    /* Puces de filtres rapides uniquement (jamais la barre d'onglets Mode IA / Tous / Images) */
    html[data-pp-google-glass="on"] [data-pp-gs="chip"] {
      border-radius: 999px !important;
      background: var(--pp-g-pill) !important;
      border: 1px solid var(--pp-g-border) !important;
      backdrop-filter: blur(14px) saturate(150%) !important;
      -webkit-backdrop-filter: blur(14px) saturate(150%) !important;
      transition: background-color 0.2s ease, border-color 0.2s ease !important;
    }

    /* Nettoyer le fond charcoal opaque interne (ex: DIV.GKS7s) dans les puces Google */
    html[data-pp-google-glass="on"] [data-pp-gs="chip"] > div {
      background: transparent !important;
      background-color: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
    }

    html[data-pp-google-glass="on"] [data-pp-gs="chip"]:hover {
      background: var(--pp-g-pill-hover) !important;
      border-color: var(--pp-g-border-ai) !important;
    }

    /* Réponse Aperçu IA : mode carte colonne unique */
    html[data-pp-google-glass="on"] [data-pp-gs="ai-card"] {
      background: var(--pp-g-ai) !important;
      backdrop-filter: blur(24px) saturate(170%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(170%) !important;
      border: 1px solid var(--pp-g-border-ai) !important;
      border-radius: 24px !important;
      padding: 20px 20px !important;
      margin-left: -20px !important;
      box-sizing: border-box !important;
      max-width: var(--pp-g-ai-max-w, none) !important;
      box-shadow: var(--pp-g-ai-shadow) !important;
      transition: background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease !important;
    }

    /* Réponse Aperçu IA : mode enveloppe unifiée (replié ou déployé, bordure basse toujours intacte) */
    html[data-pp-google-glass="on"] [data-pp-gs="ai-shell"] {
      background: var(--pp-g-ai) !important;
      backdrop-filter: blur(24px) saturate(170%) !important;
      -webkit-backdrop-filter: blur(24px) saturate(170%) !important;
      border: 1px solid var(--pp-g-border-ai) !important;
      border-radius: 26px !important;
      box-sizing: content-box !important;
      padding: 20px calc(20px + var(--pp-g-shell-extra-r, 0px)) 14px 20px !important;
      margin-left: -20px !important;
      margin-right: calc(-20px - var(--pp-g-shell-extra-r, 0px)) !important;
      margin-bottom: 22px !important;
      box-shadow: var(--pp-g-ai-shadow) !important;
      transition: background-color 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease !important;
    }

    html[data-pp-google-glass="on"] [data-pp-gs="ai-card"] mark,
    html[data-pp-google-glass="on"] [data-pp-gs="ai-shell"] mark {
      background: var(--pp-g-ring) !important;
      color: inherit !important;
      border-radius: 7px !important;
      padding: 1px 6px !important;
    }

    /* Pastilles de citations inline dans l'Aperçu IA (Larousse +2, Wikipédia +9...) */
    html[data-pp-google-glass="on"] [data-pp-gs="ai-inline-pill"] {
      background: var(--pp-g-pill) !important;
      border: 1px solid var(--pp-g-border) !important;
      border-radius: 999px !important;
      backdrop-filter: blur(10px) !important;
      -webkit-backdrop-filter: blur(10px) !important;
    }

    html[data-pp-google-glass="on"] [data-pp-gs="ai-inline-pill"]:hover {
      background: var(--pp-g-pill-hover) !important;
    }

    /* Encadré des sources à droite de l'Aperçu IA */
    html[data-pp-google-glass="on"] [data-pp-gs="ai-sources"] {
      background: var(--pp-g-card) !important;
      backdrop-filter: blur(20px) saturate(160%) !important;
      -webkit-backdrop-filter: blur(20px) saturate(160%) !important;
      border: 1px solid var(--pp-g-border) !important;
      border-radius: 22px !important;
      box-shadow: var(--pp-g-inset), var(--pp-g-shadow) !important;
      transition: background-color 0.24s ease, border-color 0.24s ease !important;
    }

    /* Uniquement le bouton principal "Tout afficher" en pilule glass (laisse les menus ⋮ discrets) */
    html[data-pp-google-glass="on"] [data-pp-gs="ai-sources-btn"] {
      border-radius: 999px !important;
      background: var(--pp-g-pill) !important;
      border: 1px solid var(--pp-g-border) !important;
      transition: background-color 0.2s ease, border-color 0.2s ease !important;
    }

    html[data-pp-google-glass="on"] [data-pp-gs="ai-sources-btn"]:hover {
      background: var(--pp-g-pill-hover) !important;
      border-color: var(--pp-g-border-ai) !important;
    }

    /* Boîte de suivi "Posez une question" en pilule flottante glass (sans fond opaque interne SPAN.G8GJkb) */
    html[data-pp-google-glass="on"] [data-pp-gs="ai-followup"] {
      background: var(--pp-g-followup) !important;
      backdrop-filter: blur(28px) saturate(180%) !important;
      -webkit-backdrop-filter: blur(28px) saturate(180%) !important;
      border: 1px solid var(--pp-g-border-ai) !important;
      border-radius: 24px !important;
      margin-bottom: 6px !important;
      box-shadow: var(--pp-g-followup-shadow) !important;
      transition: border-color 0.24s ease, box-shadow 0.24s ease, background-color 0.24s ease !important;
    }

    html[data-pp-google-glass="on"] [data-pp-gs="ai-followup"]:focus-within {
      border-color: var(--pp-g-border-strong) !important;
      box-shadow: 0 0 0 3px var(--pp-g-ring), var(--pp-g-followup-shadow) !important;
    }

    /* Cartes de résultats organiques & Autres questions (alignées sur la marge gauche native x=260) */
    html[data-pp-google-glass="on"] [data-pp-gs="result-card"],
    html[data-pp-google-glass="on"] [data-pp-gs="paa-card"] {
      background: var(--pp-g-card) !important;
      backdrop-filter: blur(18px) saturate(155%) !important;
      -webkit-backdrop-filter: blur(18px) saturate(155%) !important;
      border: 1px solid var(--pp-g-border) !important;
      border-radius: 22px !important;
      box-sizing: content-box !important;
      padding: 16px 20px !important;
      margin-left: -20px !important;
      margin-right: -20px !important;
      margin-bottom: 14px !important;
      box-shadow: var(--pp-g-inset), var(--pp-g-shadow) !important;
      transition: background-color 0.22s ease, border-color 0.22s ease, transform 0.24s cubic-bezier(0.22, 1, 0.36, 1) !important;
    }

    html[data-pp-google-glass="on"] [data-pp-gs="result-card"]:hover {
      background: var(--pp-g-card-hover) !important;
      border-color: var(--pp-g-border-ai) !important;
      transform: translateY(-1px) !important;
    }

    /* Supprimer les grandes marges basses internes de Google (30px / 44px) dans les cartes */
    html[data-pp-google-glass="on"] [data-pp-gs-trim="1"],
    html[data-pp-google-glass="on"] [data-pp-gs="result-card"] .Ww4FFb,
    html[data-pp-google-glass="on"] [data-pp-gs="result-card"] .tF2Cxc,
    html[data-pp-google-glass="on"] [data-pp-gs="paa-card"] .cUnQKe {
      margin-bottom: 0 !important;
    }

    html[data-pp-google-glass="on"] [data-pp-gs="result-card"] *,
    html[data-pp-google-glass="on"] [data-pp-gs="paa-card"] * {
      box-shadow: none;
    }

    /* Lignes séparatrices adoucies dans les cartes & résultats */
    html[data-pp-google-glass="on"] #rcnt hr,
    html[data-pp-google-glass="on"] [data-pp-gs="result-card"] hr,
    html[data-pp-google-glass="on"] [data-pp-gs="paa-card"] hr {
      background-color: var(--pp-g-border) !important;
      border-color: var(--pp-g-border) !important;
      opacity: 0.7 !important;
    }
  `;

  let enabled = false;
  let sheetRef = null;
  let fallbackStyleEl = null;
  let observer = null;
  let headerObserver = null;
  let rescanTimer = null;
  let scrollBound = false;

  function parseRgb(colorStr) {
    const m = colorStr && colorStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/);
    if (!m) return null;
    return {
      r: parseInt(m[1], 10),
      g: parseInt(m[2], 10),
      b: parseInt(m[3], 10),
      a: m[4] === undefined ? 1 : parseFloat(m[4])
    };
  }

  function isOpaquePageBg(colorStr, isDark) {
    const rgb = parseRgb(colorStr);
    if (!rgb || rgb.a < 0.70) return false;
    const lum = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
    const chroma = Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b);
    if (chroma > 22) return false; // Préserver les fonds colorés intentionnels (bouton audio bleu...)
    return isDark ? lum < 68 : lum > 228;
  }

  function detectTheme(forceProbe = false) {
    let dark = false;
    try {
      const root = document.documentElement;
      let bg = document.body ? document.body.style.backgroundColor : '';
      if (!bg && (forceProbe || root.dataset.ppGoogleGlass !== 'on')) {
        const wasOn = root.dataset.ppGoogleGlass;
        if (wasOn === 'on') delete root.dataset.ppGoogleGlass;
        bg = document.body ? getComputedStyle(document.body).backgroundColor : '';
        if (wasOn === 'on') root.dataset.ppGoogleGlass = 'on';
      }
      const rgb = parseRgb(bg);
      if (rgb && rgb.a > 0.1) {
        const lum = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
        dark = lum < 128;
      } else if (forceProbe || root.dataset.ppGoogleGlass !== 'on') {
        const scheme = root.style.colorScheme || document.querySelector('meta[name="color-scheme"]')?.content || '';
        if (/dark|light/i.test(scheme)) {
          dark = /dark/i.test(scheme) && !/^light/i.test(scheme);
        } else if (window.matchMedia) {
          dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
      } else {
        return;
      }
    } catch (_) {}
    document.documentElement.dataset.ppGoogleTheme = dark ? 'dark' : 'light';
  }

  function applyStylesheet() {
    detectTheme();
    document.documentElement.dataset.ppGoogleGlass = 'on';

    if (typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in document) {
      try {
        if (!sheetRef) {
          sheetRef = new CSSStyleSheet();
          sheetRef.replaceSync(GLASS_CSS);
        }
        if (!document.adoptedStyleSheets.includes(sheetRef)) {
          document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheetRef];
        }
        return;
      } catch (_) {}
    }

    if (!fallbackStyleEl) {
      fallbackStyleEl = document.createElement('style');
      fallbackStyleEl.id = 'pp-google-glass-style';
      fallbackStyleEl.textContent = GLASS_CSS;
      (document.head || document.documentElement).appendChild(fallbackStyleEl);
    }
  }

  function clearCustomMetrics(el) {
    if (!el || !el.style) return;
    el.style.removeProperty('--pp-g-shell-extra-r');
    el.style.removeProperty('--pp-g-ai-max-w');
  }

  function removeStylesheet() {
    delete document.documentElement.dataset.ppGoogleGlass;
    delete document.documentElement.dataset.ppGoogleTheme;

    if (sheetRef && 'adoptedStyleSheets' in document) {
      try {
        document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== sheetRef);
      } catch (_) {}
    }
    if (fallbackStyleEl) {
      fallbackStyleEl.remove();
      fallbackStyleEl = null;
    }
    document.querySelectorAll('[data-pp-gs]').forEach(el => {
      clearCustomMetrics(el);
      el.removeAttribute('data-pp-gs');
    });
    document.querySelectorAll('[data-pp-gs-clear]').forEach(el => el.removeAttribute('data-pp-gs-clear'));
    document.querySelectorAll('[data-pp-gs-trim]').forEach(el => el.removeAttribute('data-pp-gs-trim'));
  }

  function setSingletonTag(tagName, targetEl) {
    document.querySelectorAll(`[data-pp-gs="${tagName}"]`).forEach(el => {
      if (el !== targetEl) {
        clearCustomMetrics(el);
        el.removeAttribute('data-pp-gs');
      }
    });
    if (targetEl && targetEl.getAttribute('data-pp-gs') !== tagName) {
      targetEl.setAttribute('data-pp-gs', tagName);
    }
  }

  function isLayoutBoundary(el) {
    if (!el || el === document.body || el === document.documentElement) return true;
    const id = (el.id || '').toLowerCase();
    if (['rcnt', 'center_col', 'rhs', 'main', 'search', 'rso', 'cnt', 'botstuff'].includes(id)) return true;
    if (el.getAttribute?.('role') === 'main') return true;
    if (el.querySelector?.('#rso')) return true;
    return false;
  }

  function lowestCommonAncestor(elements) {
    const valid = elements.filter(Boolean);
    if (!valid.length) return null;
    let cur = valid[0];
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (valid.every(el => cur.contains(el))) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  function syncPinnedHeader() {
    if (!enabled) return;
    let pinnedTarget = null;
    const searchHeader = document.getElementById('searchform');
    const candidates = [];
    if (searchHeader) {
      candidates.push(searchHeader);
      if (searchHeader.parentElement && searchHeader.parentElement !== document.body) {
        candidates.push(searchHeader.parentElement);
        if (searchHeader.parentElement.parentElement && searchHeader.parentElement.parentElement !== document.body) {
          candidates.push(searchHeader.parentElement.parentElement);
        }
      }
    }

    for (const el of candidates) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.position === 'fixed' && r.height >= 44 && r.height <= 140 &&
          r.width >= window.innerWidth * 0.7 && (window.scrollY > 20 || el.classList.contains('minidiv') || r.top <= 4)) {
        pinnedTarget = el;
        break;
      }
    }

    setSingletonTag('pinned-header', pinnedTarget);
  }

  function onScroll() {
    if (!enabled) return;
    syncPinnedHeader();
  }

  function findAiOverviewLabel() {
    const scope = document.querySelector('#rcnt, #main') || document.body;
    if (!scope) return null;

    const attrMatch = scope.querySelector('[aria-label*="Aperçu IA" i], [aria-label*="AI Overview" i]');
    if (attrMatch && !attrMatch.closest('#pixpilot-root') && !/Afficher plus|Show more/i.test(attrMatch.getAttribute('aria-label') || '')) {
      return attrMatch;
    }

    const candidates = scope.querySelectorAll('h1, h2, span, div, strong');
    for (const el of candidates) {
      if (el.closest('#pixpilot-root')) continue;
      if (el.children.length > 2) continue;
      const txt = (el.textContent || '').trim();
      if (/^(?:Aperçu IA|AI Overview|Vue d['’]ensemble par l['’]IA)$/i.test(txt)) {
        return el;
      }
    }
    return null;
  }

  function findAiShowMore(aiLabel) {
    const scope = document.querySelector('#rcnt, #main') || document.body;
    if (!scope || !aiLabel) return null;
    const rso = document.getElementById('rso');
    const candidates = scope.querySelectorAll(
      '[role="button"][aria-label*="Afficher plus" i], [role="button"][aria-label*="Show more" i], button, [role="button"]'
    );
    for (const el of candidates) {
      if (el.closest('#pixpilot-root') || (rso && rso.contains(el))) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 180 || r.height < 28 || r.height > 70) continue;
      const txt = (el.textContent || '').trim();
      const aria = (el.getAttribute('aria-label') || '').trim();
      if (/^(?:Afficher plus|Show more)$/i.test(txt) || /(?:Afficher plus|Show more).*(?:Aperçu IA|AI Overview)/i.test(aria)) {
        return el;
      }
    }
    return null;
  }

  function findAiSourcesCard(aiLabel) {
    const scope = document.querySelector('#rcnt, #main') || document.body;
    if (!scope || !aiLabel) return null;
    const aiRect = aiLabel.getBoundingClientRect();
    const rso = document.getElementById('rso');

    // 1. Piste ultra fiable : bouton "Tout afficher" / "Show all" ou aria-label "résultats associés"
    const btnCandidates = scope.querySelectorAll(
      'button, [role="button"], a, span, [aria-label*="résultats associés" i], [aria-label*="related results" i]'
    );
    for (const btn of btnCandidates) {
      if (btn.closest('#pixpilot-root') || (rso && rso.contains(btn))) continue;
      const txt = (btn.textContent || '').trim();
      const aria = (btn.getAttribute('aria-label') || '').trim();
      const matchBtn = /^(?:Tout afficher|Show all|Afficher tout|View all)$/i.test(txt) ||
        /(?:tous les résultats associés|all related results|show all sources)/i.test(aria);
      if (!matchBtn) continue;
      const br = btn.getBoundingClientRect();
      if (br.width === 0 || br.left < aiRect.left + 200) continue;

      const actionBtn = btn.closest('button, [role="button"], a') || btn;
      let cur = btn.parentElement;
      for (let i = 0; i < 8 && cur && !isLayoutBoundary(cur); i++) {
        const cr = cur.getBoundingClientRect();
        if (cr.width >= 200 && cr.width <= 460 && cr.height >= 120 && !cur.contains(aiLabel)) {
          const cs = getComputedStyle(cur);
          const hasCardChrome = parseFloat(cs.borderRadius) >= 12 || parseFloat(cs.borderTopWidth) >= 1;
          const hasItems = cur.querySelectorAll('a[href], [role="link"], li, [data-hveid]').length >= 2;
          if (hasCardChrome || hasItems) {
            return { card: cur, showAllBtn: actionBtn };
          }
        }
        cur = cur.parentElement;
      }
    }

    // 2. Repli géométrique : carte encadrée à droite de l'Aperçu IA
    let best = null;
    let bestArea = Infinity;
    const boxes = scope.querySelectorAll('aside, section, div');
    for (const el of boxes) {
      if (el.closest('#pixpilot-root') || isLayoutBoundary(el)) continue;
      if (rso && rso.contains(el)) continue;
      if (el.contains(aiLabel)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.width > 440 || r.height < 120 || r.height > 760) continue;
      if (r.left < aiRect.left + 240) continue;
      if (r.top < aiRect.top - 80 || r.top > aiRect.top + 480) continue;
      const items = el.querySelectorAll('a[href], [role="link"]');
      if (items.length < 2) continue;
      const area = r.width * r.height;
      const cs = getComputedStyle(el);
      const hasCardChrome = parseFloat(cs.borderRadius) >= 10 || parseFloat(cs.borderTopWidth) >= 1;
      if (hasCardChrome && area < bestArea) {
        best = el;
        bestArea = area;
      }
    }
    return best ? { card: best, showAllBtn: null } : null;
  }

  function findAiFollowup(aiLabel) {
    const scope = document.body;
    if (!scope) return null;
    const rso = document.getElementById('rso');
    const searchForm = document.getElementById('searchform');

    let trigger = scope.querySelector(
      'textarea[placeholder*="question" i], input[placeholder*="question" i], ' +
      'textarea[aria-label*="question" i], [contenteditable="true"][aria-label*="question" i], ' +
      '[data-placeholder*="question" i], textarea[placeholder*="follow" i], input[placeholder*="follow" i]'
    );

    if (!trigger) {
      const nodes = scope.querySelectorAll('span, div, p, label, button, textarea, input');
      for (const el of nodes) {
        if (el.closest('#pixpilot-root') || (rso && rso.contains(el)) || (searchForm && searchForm.contains(el))) continue;
        if (el.children.length > 1) continue;
        const txt = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim();
        if (/^(?:Pose[zr] une question(?:\s+.{0,24})?|Ask a follow[- ]?up|Ask anything)$/i.test(txt)) {
          trigger = el;
          break;
        }
      }
    }

    if (!trigger || trigger.closest('#pixpilot-root') || (rso && rso.contains(trigger)) || (searchForm && searchForm.contains(trigger))) return null;
    if (trigger.getBoundingClientRect().height === 0) return null;

    let pill = trigger;
    for (let i = 0; i < 6 && pill.parentElement; i++) {
      const p = pill.parentElement;
      if (isLayoutBoundary(p) || (aiLabel && p.contains(aiLabel))) break;
      const pr = p.getBoundingClientRect();
      if (pr.height > 155 || pr.width > 760) break;
      const cs = getComputedStyle(p);
      pill = p;
      if (pr.width >= 260 && pr.height >= 44 && parseFloat(cs.borderRadius) >= 14) {
        const gp = p.parentElement;
        if (gp && !isLayoutBoundary(gp) && !(aiLabel && gp.contains(aiLabel))) {
          const gpr = gp.getBoundingClientRect();
          const gcs = getComputedStyle(gp);
          const isTightWrapper = Math.abs(gpr.width - pr.width) <= 8 && Math.abs(gpr.height - pr.height) <= 8;
          const addsActions = gp.querySelectorAll('button, [role="button"], svg').length > p.querySelectorAll('button, [role="button"], svg').length;
          if (gpr.height <= 145 && gpr.width <= 720 && (parseFloat(gcs.borderRadius) >= 14 || isTightWrapper) && (addsActions || isTightWrapper)) {
            pill = gp;
          }
        }
        break;
      }
    }

    return (pill && !isLayoutBoundary(pill) && pill.offsetHeight >= 36 && pill.offsetHeight <= 165) ? pill : null;
  }

  function clearFollowupBackdrops(followupPill, aiLabel, sourcesCard, isDark) {
    if (!followupPill) return;

    // 1. Nettoyer toute plaque / fond opaque enfant ou frère (ex: DIV.Zze5V et SPAN.G8GJkb dans AgWCw)
    const inspectSet = new Set([
      ...Array.from(followupPill.querySelectorAll('div, span')),
      ...(followupPill.parentElement ? Array.from(followupPill.parentElement.children) : [])
    ]);
    for (const el of inspectSet) {
      if (!el || el === followupPill || el.closest('#pixpilot-root')) continue;
      if (el.hasAttribute('data-pp-gs')) continue;
      if (el.contains(followupPill)) continue;
      if (el.querySelector('textarea, input, [contenteditable="true"], button, [role="button"]')) continue;
      if (el.offsetHeight < 44) continue;
      const cs = getComputedStyle(el);
      const isGrad = cs.backgroundImage && /gradient/i.test(cs.backgroundImage);
      const isOpaque = isOpaquePageBg(cs.backgroundColor, isDark);
      const isBackdropOverlay = (cs.position === 'absolute' || cs.position === 'fixed') && (isGrad || isOpaque);
      if (isBackdropOverlay || isGrad) {
        el.setAttribute('data-pp-gs-clear', '1');
      }
    }

    // 2. Nettoyer les wrappers ancêtres opaques autour de "Posez une question"
    let wrap = followupPill.parentElement;
    for (let i = 0; i < 6 && wrap && !isLayoutBoundary(wrap); i++) {
      if (aiLabel && wrap.contains(aiLabel)) break;
      if (sourcesCard && wrap.contains(sourcesCard)) break;
      if (wrap.offsetHeight > 260) break;
      const cs = getComputedStyle(wrap);
      if (isOpaquePageBg(cs.backgroundColor, isDark) || (cs.backgroundImage && /gradient/i.test(cs.backgroundImage))) {
        wrap.setAttribute('data-pp-gs', 'transparent-wrap');
      }
      wrap = wrap.parentElement;
    }
  }

  function styleCollapsedShowMore(aiContainer, showMoreBtn, isDark) {
    setSingletonTag('ai-show-more', null);
    setSingletonTag('ai-show-more-wrap', null);
    setSingletonTag('ai-fade-mask', null);
    if (!aiContainer || !showMoreBtn) return;

    // 1. Habiller la pilule "Afficher plus" elle-même (le conteneur portant la bordure arrondie)
    const pillInner = Array.from(showMoreBtn.querySelectorAll('div')).find(el => {
      const cs = getComputedStyle(el);
      return el.offsetWidth >= 180 && el.offsetHeight >= 32 && parseFloat(cs.borderRadius) >= 14 &&
        (parseFloat(cs.borderTopWidth) >= 1 || el.offsetHeight >= 40);
    }) || showMoreBtn;
    setSingletonTag('ai-show-more', pillInner);

    // 2. Nettoyer le bloc opaque derrière "Afficher plus" (ex: DIV.zNsLfb) et aligner l'enveloppe absolue (ex: DIV.lACQkd)
    let cur = showMoreBtn.parentElement;
    for (let i = 0; i < 4 && cur && cur !== aiContainer && !isLayoutBoundary(cur); i++) {
      const cs = getComputedStyle(cur);
      if (isOpaquePageBg(cs.backgroundColor, isDark) && cur.offsetHeight <= 120) {
        cur.setAttribute('data-pp-gs-clear', '1');
      }
      if (cs.position === 'absolute' && cur.parentElement === aiContainer) {
        setSingletonTag('ai-show-more-wrap', cur);
      }
      cur = cur.parentElement;
    }

    // 3. Confiner et assortir le masque de fondu (ex: DIV.iIXkZe.LrrQLb qui débordait de 210px à gauche)
    const containerRect = aiContainer.getBoundingClientRect();
    const candidates = aiContainer.querySelectorAll('div');
    for (const el of candidates) {
      if (el.closest('#pixpilot-root') || el.hasAttribute('data-pp-gs')) continue;
      if (el.contains(showMoreBtn) || showMoreBtn.contains(el)) continue;
      const cs = getComputedStyle(el);
      const isGrad = cs.backgroundImage && /gradient/i.test(cs.backgroundImage);
      const r = el.getBoundingClientRect();
      if (isGrad && cs.position === 'absolute' && r.height >= 60 && r.width >= 400 && r.bottom >= containerRect.bottom - 50) {
        setSingletonTag('ai-fade-mask', el);
        break;
      }
    }
  }

  function clearOpaqueInside(container, isDark, protectedEls) {
    if (!container) return;
    const divs = container.querySelectorAll('div, section, aside');
    for (const el of divs) {
      if (el.closest('#pixpilot-root')) continue;
      if (el.hasAttribute('data-pp-gs')) continue;
      if (protectedEls && protectedEls.some(p => p && (p === el || p.contains(el)))) continue;
      if (el.offsetHeight < 38 || el.getAttribute('role') === 'button') continue;
      const cs = getComputedStyle(el);
      const hasOpaqueBg = isOpaquePageBg(cs.backgroundColor, isDark);
      const hasGradientBackdrop = cs.backgroundImage && /gradient/i.test(cs.backgroundImage) && el.offsetHeight >= 48;
      if (hasOpaqueBg || hasGradientBackdrop) {
        el.setAttribute('data-pp-gs-clear', '1');
      }
    }
  }

  function polishInlineAiPills(container, isDark, protectedEls) {
    if (!container) return;
    const candidates = container.querySelectorAll('button, [role="button"], a');
    for (const el of candidates) {
      if (el.closest('#pixpilot-root') || el.hasAttribute('data-pp-gs')) continue;
      if (protectedEls && protectedEls.some(p => p && (p === el || p.contains(el)))) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 18 || r.height > 30 || r.width < 36 || r.width > 240) continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.borderRadius) < 10) continue;
      if (isOpaquePageBg(cs.backgroundColor, isDark)) {
        el.setAttribute('data-pp-gs', 'ai-inline-pill');
      }
    }
  }

  function trimCardBottomMargins(card) {
    if (!card) return;
    const blocks = card.querySelectorAll('div, section');
    for (const el of blocks) {
      if (el.closest('#pixpilot-root')) continue;
      const cs = getComputedStyle(el);
      const mb = parseFloat(cs.marginBottom);
      if (mb >= 20 && el.offsetHeight >= 48) {
        const cr = card.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        if (cr.bottom - er.bottom >= mb + 8 && cr.bottom - er.bottom <= mb + 44) {
          el.setAttribute('data-pp-gs-trim', '1');
        }
      }
    }
  }

  function styleGoogleDividers(aiContainer) {
    document.querySelectorAll('[data-pp-gs="divider-soft"], [data-pp-gs="divider-hide"]').forEach(el => {
      el.removeAttribute('data-pp-gs');
    });

    const scrollY = window.scrollY || 0;
    const aiBottomDoc = aiContainer ? aiContainer.getBoundingClientRect().bottom + scrollY : null;
    const rso = document.getElementById('rso');
    const rsoTopDoc = rso ? rso.getBoundingClientRect().top + scrollY : null;

    const candidates = document.querySelectorAll('#cnt div, #rcnt div, #top_nav div, body > div div');
    for (const el of candidates) {
      if (el.closest('#pixpilot-root') || el.hasAttribute('data-pp-gs')) continue;
      if ((el.textContent || '').trim() !== '') continue;
      const r = el.getBoundingClientRect();
      if (r.height > 4 || r.width < 560) continue;
      const cs = getComputedStyle(el);
      if (parseFloat(cs.borderBottomWidth) < 1 && parseFloat(cs.borderTopWidth) < 1) continue;

      const docTop = r.top + scrollY;

      // Ligne horizontale parasite sous l'Aperçu IA (ex: DIV.omFXYd.hwGT0, replié ou déployé)
      if (aiBottomDoc !== null && docTop >= aiBottomDoc - 35 && (rsoTopDoc === null || docTop <= rsoTopDoc + 14)) {
        el.setAttribute('data-pp-gs', 'divider-hide');
        continue;
      }

      // Ligne sous les onglets du haut (ex: DIV.zLSRge.OMqmfd à docTop ~136)
      if (docTop >= 60 && docTop <= 210 && r.width >= window.innerWidth * 0.65) {
        el.setAttribute('data-pp-gs', 'divider-soft');
      }
    }
  }

  function tagGoogleElements(forceThemeProbe = false) {
    if (!enabled) return;
    detectTheme(forceThemeProbe);
    const isDark = document.documentElement.dataset.ppGoogleTheme === 'dark';

    document.querySelectorAll('[data-pp-gs="transparent-wrap"], [data-pp-gs="ai-inline-pill"]').forEach(el => {
      el.removeAttribute('data-pp-gs');
    });

    // 1. Barre de recherche & en-tête fixe au scroll
    syncPinnedHeader();
    const searchForm = document.querySelector('form[action="/search"], form[role="search"]');
    let searchBarEl = null;
    if (searchForm) {
      const box = searchForm.querySelector('.RNNXgb') ||
        searchForm.querySelector('[role="combobox"]')?.closest('div[class]')?.parentElement;
      if (box && !box.closest('#pixpilot-root') && !isLayoutBoundary(box)) {
        searchBarEl = box;
      }
    }
    setSingletonTag('search-bar', searchBarEl);
    if (searchBarEl) {
      searchBarEl.querySelectorAll('div').forEach(el => {
        if (el.closest('#pixpilot-root, .UUbT9, [role="listbox"]')) return;
        if (el.getAttribute('role') === 'button') return;
        const rgb = parseRgb(getComputedStyle(el).backgroundColor);
        if (rgb && rgb.a > 0.01) {
          el.setAttribute('data-pp-gs-clear', '1');
        }
      });
    }

    // 2. Aperçu IA (replié ou déployé) + Sources à droite + "Posez une question"
    const aiLabel = findAiOverviewLabel();
    const sourcesInfo = aiLabel ? findAiSourcesCard(aiLabel) : null;
    const sourcesCard = sourcesInfo ? sourcesInfo.card : null;
    const showAllBtn = sourcesInfo ? sourcesInfo.showAllBtn : null;
    const showMoreBtn = aiLabel ? findAiShowMore(aiLabel) : null;
    const followupPill = aiLabel ? findAiFollowup(aiLabel) : null;

    setSingletonTag('ai-sources', sourcesCard);
    setSingletonTag('ai-sources-btn', showAllBtn);
    setSingletonTag('ai-followup', followupPill);
    clearFollowupBackdrops(followupPill, aiLabel, sourcesCard, isDark);

    let activeAiContainer = null;
    if (aiLabel) {
      const rso = document.getElementById('rso');

      // Vérifier d'abord si l'Aperçu IA est un panneau 1 colonne séparé des sources
      let separateLeftCard = null;
      if (sourcesCard && !showMoreBtn) {
        const sr = sourcesCard.getBoundingClientRect();
        let cur = aiLabel;
        for (let i = 0; i < 16 && cur.parentElement; i++) {
          const p = cur.parentElement;
          if (isLayoutBoundary(p) || (rso && p.contains(rso))) break;
          if (!cur.contains(sourcesCard) && p.contains(sourcesCard)) {
            const cr = cur.getBoundingClientRect();
            const textLen = (cur.innerText || '').trim().length;
            const followupOk = !followupPill || cur.contains(followupPill);
            if (cur.offsetHeight >= 120 && textLen >= 60 && cr.right <= sr.left - 8 && followupOk) {
              separateLeftCard = cur;
            }
            break;
          }
          cur = p;
        }
      }

      if (separateLeftCard) {
        setSingletonTag('ai-shell', null);
        setSingletonTag('ai-card', separateLeftCard);
        clearCustomMetrics(separateLeftCard);
        activeAiContainer = separateLeftCard;
      } else {
        // Mode enveloppe unifiée : LCA de Aperçu IA + Sources + Afficher plus / Posez une question
        let target = lowestCommonAncestor([aiLabel, sourcesCard, showMoreBtn, followupPill]);
        if (!target || isLayoutBoundary(target) || (rso && target.contains(rso)) || target.getBoundingClientRect().width > 1280) {
          target = lowestCommonAncestor([aiLabel, sourcesCard, showMoreBtn]);
        }
        if (!target || isLayoutBoundary(target) || (rso && target.contains(rso)) || target.getBoundingClientRect().width > 1280) {
          target = lowestCommonAncestor([aiLabel, sourcesCard]);
        }
        if (!target || isLayoutBoundary(target) || (rso && target.contains(rso)) || target.getBoundingClientRect().width > 1280) {
          target = aiLabel;
          for (let i = 0; i < 18 && target.parentElement; i++) {
            const p = target.parentElement;
            if (isLayoutBoundary(p) || (rso && p.contains(rso))) break;
            if (target.offsetHeight > 100 && p.offsetHeight > target.offsetHeight * 2.1 && p.querySelector('a[href] h3')) break;
            target = p;
          }
        }

        if (target && !isLayoutBoundary(target) && target.offsetHeight > 60) {
          const wrapsSources = Boolean(sourcesCard && target.contains(sourcesCard));
          if (wrapsSources) {
            setSingletonTag('ai-card', null);
            setSingletonTag('ai-shell', target);
            clearCustomMetrics(target);
            const cr = target.getBoundingClientRect();
            const sr = sourcesCard.getBoundingClientRect();
            const extraRight = Math.ceil(sr.right - (cr.right - 20));
            if (extraRight > 2 && extraRight < 460) {
              target.style.setProperty('--pp-g-shell-extra-r', `${extraRight}px`);
            }
          } else {
            setSingletonTag('ai-shell', null);
            setSingletonTag('ai-card', target);
            clearCustomMetrics(target);
            if (sourcesCard) {
              const cr = target.getBoundingClientRect();
              const sr = sourcesCard.getBoundingClientRect();
              if (cr.right > sr.left - 14) {
                const safeMax = Math.max(360, Math.floor(sr.left - cr.left - 20));
                target.style.setProperty('--pp-g-ai-max-w', `${safeMax}px`);
              }
            }
          }
          activeAiContainer = target;
        } else {
          setSingletonTag('ai-card', null);
          setSingletonTag('ai-shell', null);
        }
      }

      styleCollapsedShowMore(activeAiContainer, showMoreBtn, isDark);

      if (activeAiContainer) {
        const fadeMask = activeAiContainer.querySelector('[data-pp-gs="ai-fade-mask"]');
        clearOpaqueInside(activeAiContainer, isDark, [sourcesCard, followupPill, showMoreBtn, fadeMask]);
        polishInlineAiPills(activeAiContainer, isDark, [sourcesCard, followupPill, showMoreBtn]);
      }
      if (sourcesCard) {
        clearOpaqueInside(sourcesCard, isDark, [showAllBtn]);
      }
    } else {
      setSingletonTag('ai-card', null);
      setSingletonTag('ai-shell', null);
      setSingletonTag('ai-show-more', null);
      setSingletonTag('ai-fade-mask', null);
    }

    // 3. Puces de filtres rapides (French, Synonyme, Traduction...) — JAMAIS les onglets Mode IA / Tous / Images
    const NAV_TAB_RE = /^(?:Mode IA|AI Mode|Tous|All|Images|Vidéos|Videos|Vidéos courtes|Short videos|Actualités|News|Shopping|Web|Livres|Books|Finance|Plus|More|Outils|Tools)$/i;
    document.querySelectorAll('.IUOThf a, #extabar a, #appbar a, #top_nav a, #hdtb a, [role="navigation"] a').forEach(a => {
      if (a.closest('#pixpilot-root') || a.closest('[data-pp-gs]')) return;
      if (a.closest('#hdtb-msb, #searchform, header, [role="tablist"], #rso')) return;
      const inFilterStrip = Boolean(a.closest('.IUOThf'));
      const txt = (a.textContent || '').trim();
      if (!inFilterStrip && (!txt || NAV_TAB_RE.test(txt))) return;
      const r = a.getBoundingClientRect();
      if (r.height < 22 || r.height > 46 || r.width < 28 || r.width > 240) return;
      const cs = getComputedStyle(a);
      const rgb = parseRgb(cs.backgroundColor);
      const hasNativeChipChrome = parseFloat(cs.borderRadius) >= 12 &&
        (parseFloat(cs.borderTopWidth) >= 1 || (rgb && rgb.a > 0.15));
      if (inFilterStrip || hasNativeChipChrome) {
        a.setAttribute('data-pp-gs', 'chip');
      }
    });

    // 4. Cartes de résultats organiques & "Autres questions"
    function classifyRsoBlock(node) {
      if (!node || node.closest('#pixpilot-root') || isLayoutBoundary(node)) return null;
      if (node.querySelector('[data-pp-gs="ai-card"], [data-pp-gs="ai-shell"]')) return null;
      if (node.offsetHeight < 52) return null;
      const txt = (node.innerText || '').trim();
      if (txt.length < 24) return null;
      if (/^(?:Autres questions|People also ask|Recherches associées|Related searches)/i.test(txt)) {
        return 'paa-card';
      }
      if (node.querySelector('a[href] h3, [role="heading"]')) {
        return 'result-card';
      }
      return null;
    }

    document.querySelectorAll('#rso > div').forEach(topNode => {
      if (!topNode || topNode.closest('#pixpilot-root') || isLayoutBoundary(topNode)) return;
      const childMatches = Array.from(topNode.children)
        .filter(c => c.tagName === 'DIV')
        .map(c => [c, classifyRsoBlock(c)])
        .filter(([, kind]) => Boolean(kind));

      if (childMatches.length >= 2) {
        if (topNode.hasAttribute('data-pp-gs')) topNode.removeAttribute('data-pp-gs');
        childMatches.forEach(([child, kind]) => {
          child.setAttribute('data-pp-gs', kind);
          clearOpaqueInside(child, isDark, []);
          trimCardBottomMargins(child);
        });
        return;
      }

      const topKind = classifyRsoBlock(topNode);
      if (topKind) {
        topNode.setAttribute('data-pp-gs', topKind);
        clearOpaqueInside(topNode, isDark, []);
        trimCardBottomMargins(topNode);
      }
    });

    // 5. Adoucir le séparateur sous les onglets et masquer la ligne parasite sous l'Aperçu IA
    styleGoogleDividers(activeAiContainer);
  }

  function scheduleTagging() {
    if (!enabled) return;
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => tagGoogleElements(false), 110);
  }

  function startObserver() {
    if (!scrollBound) {
      window.addEventListener('scroll', onScroll, { passive: true });
      scrollBound = true;
    }
    if (!headerObserver) {
      const sh = document.getElementById('searchform');
      if (sh) {
        headerObserver = new MutationObserver(() => syncPinnedHeader());
        headerObserver.observe(sh, { attributes: true, attributeFilter: ['class', 'style'] });
        if (sh.parentElement && sh.parentElement !== document.body) {
          headerObserver.observe(sh.parentElement, { attributes: true, attributeFilter: ['class', 'style'] });
        }
      }
    }
    if (observer || !document.body) return;
    observer = new MutationObserver((mutations) => {
      const relevant = mutations.some(m => m.type === 'childList' && m.addedNodes.length > 0);
      if (relevant) scheduleTagging();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function stopObserver() {
    if (scrollBound) {
      window.removeEventListener('scroll', onScroll);
      scrollBound = false;
    }
    if (headerObserver) {
      headerObserver.disconnect();
      headerObserver = null;
    }
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (rescanTimer) {
      clearTimeout(rescanTimer);
      rescanTimer = null;
    }
  }

  function setEnabled(next) {
    const want = Boolean(next) && isGoogleSearchPage;
    enabled = want;
    if (!want) {
      stopObserver();
      removeStylesheet();
      return;
    }
    applyStylesheet();
    tagGoogleElements(false);
    startObserver();
  }

  window.PixGoogleGlass = {
    isSupported: isGoogleSearchPage,
    isGoogleSearchUrl,
    setEnabled,
    refresh: () => tagGoogleElements(true)
  };
})();
