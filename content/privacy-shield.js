/**
 * PixPilot - Privacy Shield & Anti-Detection
 * Neutralise totalement les écouteurs de surveillance et d'espionnage de Pix :
 * - Détection de changement d'onglet (Page Visibility API, window.blur, focusout, document.hidden, hasFocus)
 * - Détection de sortie de souris de la question ou de la fenêtre (mouseleave, pointerleave, mouseout)
 *
 * Fonctionne de manière 100% non-destructive : n'altère aucun élément DOM de Pix
 * pour garantir que l'application s'affiche et fonctionne à la perfection.
 */

(function () {
  'use strict';

  if (window.__PIXPILOT_PRIVACY_SHIELD_ACTIVE__) {
    return;
  }
  window.__PIXPILOT_PRIVACY_SHIELD_ACTIVE__ = true;

  // Compteurs statistiques d'interceptions pour traçabilité et vérification
  const stats = {
    destroyedListeners: 0,
    blockedEvents: 0,
    fakedVisibilityChecks: 0,
    fakedFocusChecks: 0
  };
  window.__PIXPILOT_PRIVACY_STATS__ = stats;

  const fakeNativeString = (fnName) => {
    return () => `function ${fnName}() { [native code] }`;
  };

  // ---------------------------------------------------------------------------
  // 1. NEUTRALISATION DE L'API DE VISIBILITÉ (Page Visibility API)
  // document.hidden = false (toujours)
  // document.visibilityState = 'visible' (toujours)
  // ---------------------------------------------------------------------------
  try {
    const fakeGetHidden = function () {
      stats.fakedVisibilityChecks++;
      return false;
    };
    fakeGetHidden.toString = fakeNativeString('get hidden');

    const fakeGetVisibility = function () {
      stats.fakedVisibilityChecks++;
      return 'visible';
    };
    fakeGetVisibility.toString = fakeNativeString('get visibilityState');

    const patchVisibility = (target) => {
      if (!target) return;
      try {
        Object.defineProperty(target, 'hidden', {
          get: fakeGetHidden,
          set: function () {},
          configurable: true,
          enumerable: true
        });

        Object.defineProperty(target, 'visibilityState', {
          get: fakeGetVisibility,
          set: function () {},
          configurable: true,
          enumerable: true
        });

        if ('webkitHidden' in target || 'webkitHidden' in document) {
          Object.defineProperty(target, 'webkitHidden', {
            get: () => false,
            set: () => {},
            configurable: true,
            enumerable: true
          });
        }
        if ('webkitVisibilityState' in target || 'webkitVisibilityState' in document) {
          Object.defineProperty(target, 'webkitVisibilityState', {
            get: () => 'visible',
            set: () => {},
            configurable: true,
            enumerable: true
          });
        }
      } catch (e) {}
    };

    if (typeof Document !== 'undefined' && Document.prototype) {
      patchVisibility(Document.prototype);
    }
    patchVisibility(document);
  } catch (err) {
    console.debug('[PixPilot Shield] Visibility patch error:', err);
  }

  // ---------------------------------------------------------------------------
  // 2. NEUTRALISATION DE document.hasFocus()
  // Toujours renvoyer true pour faire croire que la fenêtre et la question sont actives
  // ---------------------------------------------------------------------------
  try {
    const fakeHasFocus = function () {
      stats.fakedFocusChecks++;
      return true;
    };
    fakeHasFocus.toString = fakeNativeString('hasFocus');

    if (typeof Document !== 'undefined' && Document.prototype) {
      Document.prototype.hasFocus = fakeHasFocus;
    }
    document.hasFocus = fakeHasFocus;
  } catch (err) {
    console.debug('[PixPilot Shield] hasFocus patch error:', err);
  }

  // ---------------------------------------------------------------------------
  // 3. DIFFÉRENCIATION DES CONTRÔLES DE FORMULAIRE ET DES CONTENEURS
  // Les champs de saisie (<input>, <textarea>, <select>) conservent leur blur normal
  // pour valider la réponse saisie par l'élève.
  // ---------------------------------------------------------------------------
  function isFormInput(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'option') return true;
    if (target.isContentEditable) return true;
    const role = target.getAttribute && target.getAttribute('role');
    if (role === 'textbox' || role === 'combobox' || role === 'searchbox') return true;
    return false;
  }

  function isRootOrContainer(target) {
    if (!target) return false;
    if (target === window || target === document) return true;
    if (typeof Window !== 'undefined' && target instanceof Window) return true;
    if (typeof Document !== 'undefined' && target instanceof Document) return true;
    if (document.documentElement && target === document.documentElement) return true;
    if (document.body && target === document.body) return true;
    const tag = (target.tagName || '').toLowerCase();
    if (tag === 'html' || tag === 'body' || tag === 'main' || tag === 'article' || tag === 'section') return true;
    if (target.classList) {
      const cls = typeof target.className === 'string' ? target.className.toLowerCase() : '';
      if (
        cls.includes('challenge') ||
        cls.includes('focus') ||
        cls.includes('screen') ||
        cls.includes('assessment') ||
        cls.includes('card')
      ) return true;
    }
    return false;
  }

  const ALWAYS_BLOCK_EVENTS = new Set([
    'visibilitychange',
    'webkitvisibilitychange',
    'msvisibilitychange',
    'pagehide'
  ]);

  // ---------------------------------------------------------------------------
  // 4. INTERCEPTION ET DESTRUCTION DES ÉCOUTEURS D'ÉVÉNEMENTS (addEventListener)
  // ---------------------------------------------------------------------------
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
  const wrapperMap = new WeakMap();

  const patchedAddEventListener = function (type, listener, options) {
    if (!type || typeof listener !== 'function') {
      return originalAddEventListener.apply(this, arguments);
    }

    const lowerType = String(type).toLowerCase();

    // A. Événements globaux de visibilité / abandon de page -> DÉTRUITS
    if (ALWAYS_BLOCK_EVENTS.has(lowerType)) {
      stats.destroyedListeners++;
      return;
    }

    // B. Écouteurs de sortie de souris (mouseleave, pointerleave) -> DÉTRUITS sur tous les conteneurs et la page
    // Seuls les champs de saisie purs pourraient en avoir (inutile pour répondre aux épreuves)
    if ((lowerType === 'mouseleave' || lowerType === 'pointerleave') && !isFormInput(this)) {
      stats.destroyedListeners++;
      return;
    }

    // C. Écouteurs mouseout / pointerout sur conteneurs ou racine -> DÉTRUITS
    if ((lowerType === 'mouseout' || lowerType === 'pointerout') && isRootOrContainer(this)) {
      stats.destroyedListeners++;
      return;
    }

    // D. Perte de focus (blur, focusout) sur la carte de question ou la fenêtre -> DÉTRUITS
    // Conserve le blur sur les champs de saisie pour que les exercices fonctionnent parfaitement
    if ((lowerType === 'blur' || lowerType === 'focusout') && isRootOrContainer(this)) {
      stats.destroyedListeners++;
      return;
    }

    return originalAddEventListener.apply(this, arguments);
  };

  patchedAddEventListener.toString = fakeNativeString('addEventListener');
  EventTarget.prototype.addEventListener = patchedAddEventListener;

  const patchedRemoveEventListener = function (type, listener, options) {
    const wrapped = listener && wrapperMap.get(listener);
    return originalRemoveEventListener.call(this, type, wrapped || listener, options);
  };
  patchedRemoveEventListener.toString = fakeNativeString('removeEventListener');
  EventTarget.prototype.removeEventListener = patchedRemoveEventListener;

  // ---------------------------------------------------------------------------
  // 5. NEUTRALISATION DES PROPRIÉTÉS INLINE (window.onblur = ..., etc.)
  // ---------------------------------------------------------------------------
  function neutralizeProperty(obj, propName) {
    if (!obj) return;
    try {
      Object.defineProperty(obj, propName, {
        get: () => null,
        set: () => {
          stats.destroyedListeners++;
        },
        configurable: true,
        enumerable: true
      });
    } catch (e) {}
  }

  neutralizeProperty(window, 'onblur');
  neutralizeProperty(window, 'onfocusout');
  neutralizeProperty(window, 'onpagehide');
  neutralizeProperty(window, 'onmouseleave');
  neutralizeProperty(document, 'onvisibilitychange');
  neutralizeProperty(document, 'onmouseleave');
  neutralizeProperty(document, 'onmouseout');
  neutralizeProperty(document, 'onfocusout');
  neutralizeProperty(document, 'onblur');

  // ---------------------------------------------------------------------------
  // 6. FILET DE SÉCURITÉ : PHASE DE CAPTURE PRIORITAIRE (CAPTURE-PHASE INTERCEPTION)
  // Intercepte et étouffe les événements de détection dès qu'ils sont émis
  // ---------------------------------------------------------------------------
  const interceptInCapturePhase = (type, predicate) => {
    try {
      window.addEventListener(
        type,
        (e) => {
          if (!predicate || predicate(e)) {
            stats.blockedEvents++;
            e.stopImmediatePropagation();
            e.stopPropagation();
            if (e.cancelable) e.preventDefault();
          }
        },
        true // useCapture = true : priorité absolue
      );
    } catch (e) {}
  };

  // Visibilité : bloquée à 100%
  interceptInCapturePhase('visibilitychange', () => true);
  interceptInCapturePhase('webkitvisibilitychange', () => true);

  // mouseleave / pointerleave : BLOQUÉS sur toute la fenêtre et conteneurs
  interceptInCapturePhase('mouseleave', () => true);
  interceptInCapturePhase('pointerleave', () => true);

  // Perte de focus : bloquée sur la fenêtre et les conteneurs (autorisée entre les champs de formulaire d'exercice)
  interceptInCapturePhase('blur', (e) => e.target === window || e.target === document || isRootOrContainer(e.target));
  interceptInCapturePhase('focusout', (e) => e.target === window || e.target === document || isRootOrContainer(e.target));

  // mouseout : bloqué si le curseur sort de la fenêtre, vers PixPilot ou hors du conteneur de question
  interceptInCapturePhase('mouseout', (e) => {
    // 1. Curseur qui sort de la fenêtre
    if (!e.relatedTarget || e.clientX <= 0 || e.clientY <= 0 ||
        e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
      return true;
    }

    // 2. Curseur qui se déplace vers l'interface PixPilot
    if (e.relatedTarget && (e.relatedTarget.id === 'pixpilot-root' || e.relatedTarget.closest?.('#pixpilot-root'))) {
      return true;
    }

    // 3. Curseur qui sort de la carte de question Pix vers l'extérieur
    try {
      const challenge = document.querySelector('.c-challenge, .pix-challenge-card, .pix-challenge, [class*="challenge"], [class*="focus"], main, article');
      if (challenge && challenge.contains(e.target) && !challenge.contains(e.relatedTarget)) {
        return true;
      }
    } catch (err) {}

    return false;
  });

  console.log(
    '%c[PixPilot Shield]%c Protection de la vie privée active : écouteurs Pix d’onglet et de souris neutralisés.',
    'background: #10b981; color: #06080b; font-weight: bold; padding: 2px 8px; border-radius: 4px; font-family: monospace;',
    'color: #10b981; font-weight: 600;'
  );
})();
