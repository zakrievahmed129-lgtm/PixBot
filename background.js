/**
 * PixPilot - Service Worker
 * Gère l'initialisation, la capture GPU native de l'onglet,
 * l'extraction profonde multi-frames (Chart.js, Highcharts, SVG, iframes Pix)
 * et l'application automatique des réponses dans les iframes.
 */

const PIXPILOT_SCRIPTS = [
  'lib/jszip.min.js',
  'lib/xlsx.mini.js',
  'lib/html2canvas.min.js',
  'lib/pix-extractor.js',
  'lib/file-parser.js',
  'lib/query-engine.js',
  'lib/gemini.js',
  'lib/google-glass.js',
  'content/content.js'
];

function isInjectableUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'file:') {
      return false;
    }
    const host = u.hostname.toLowerCase();
    if (host === 'chromewebstore.google.com') return false;
    if (host === 'chrome.google.com' && u.pathname.startsWith('/webstore')) return false;
    if (/\.pdf(?:$|[?#])/i.test(u.pathname)) return false;
    return true;
  } catch (_) {
    return false;
  }
}

function isPixUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const u = new URL(rawUrl);
    if (u.protocol === 'file:') return true;
    const h = u.hostname.toLowerCase();
    return /(^|\.)pix\.(fr|org)$/i.test(h) || h === 'localhost' || h === '127.0.0.1';
  } catch (_) {
    return false;
  }
}

async function injectIntoTab(tabId, url) {
  if (!tabId || !chrome.scripting || !isInjectableUrl(url)) return false;
  try {
    if (isPixUrl(url)) {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        world: 'MAIN',
        files: ['content/privacy-shield.js']
      }).catch(() => { });
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: PIXPILOT_SCRIPTS
    });
    return true;
  } catch (_) {
    return false;
  }
}

async function injectAllOpenTabs() {
  if (!chrome.tabs || !chrome.scripting) return;
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab?.id || !isInjectableUrl(tab.url)) continue;
      // N'injecter que si le script n'est pas déjà monté dans l'onglet
      chrome.tabs.sendMessage(tab.id, { action: 'ping-pixpilot' }, (res) => {
        if (chrome.runtime.lastError || !res?.alive) {
          injectIntoTab(tab.id, tab.url);
        }
      });
    }
  } catch (_) { }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => { });

  chrome.storage.local.get(['geminiModel', 'thinkingLevel'], (data) => {
    const updates = {};
    if (!data.geminiModel || data.geminiModel === 'gemini-2.5-flash') {
      updates.geminiModel = 'gemini-3.5-flash-lite';
    }
    if (!data.thinkingLevel) {
      updates.thinkingLevel = 'high';
    }
    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });

  injectAllOpenTabs();
});

chrome.runtime.onStartup?.addListener(() => {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: false }).catch(() => { });
  injectAllOpenTabs();
});

chrome.commands?.onCommand?.addListener((command) => {
  if (command === 'toggle-pixpilot') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab?.id) return;

      const isOwnNewTab = typeof tab.url === 'string' && tab.url.startsWith(chrome.runtime.getURL('newtab/'));

      // Pages protégées Chrome (chrome://, Web Store, PDF, etc.) : ouvrir le Side Panel directement sans rompre le geste utilisateur
      if (!isInjectableUrl(tab.url) && !isOwnNewTab) {
        if (chrome.sidePanel?.open) {
          chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
            chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => { });
          });
        }
        return;
      }

      chrome.tabs.sendMessage(tab.id, { action: 'toggle-panel' }, async () => {
        if (chrome.runtime.lastError) {
          const ok = await injectIntoTab(tab.id, tab.url);
          if (ok) {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, { action: 'toggle-panel' }, () => {
                void chrome.runtime.lastError;
              });
            }, 120);
          }
        }
      });
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Capture d'écran GPU réelle de l'onglet visible (inclut iframes, canvas, graphiques, infobulles)
  if (message.action === 'capture-visible-tab') {
    const windowId = sender?.tab?.windowId ?? chrome.windows?.WINDOW_ID_CURRENT ?? null;
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
    return true;
  }

  // 2. Extraction profonde dans toutes les frames + monde JS principal (Chart.js, Highcharts, SVG, tables, iframes)
  if (message.action === 'extract-all-frames') {
    const tabId = sender?.tab?.id;
    if (!tabId || !chrome.scripting) {
      sendResponse({ success: false, frames: [] });
      return false;
    }

    const topOrigin = (() => {
      try {
        return sender?.tab?.url ? new URL(sender.tab.url).origin : '';
      } catch (_) {
        return '';
      }
    })();

    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      args: [topOrigin],
      func: (parentOrigin) => {
        const isSubFrame = window !== window.top;
        const isCrossOriginSubFrame = isSubFrame && (!parentOrigin || window.location.origin !== parentOrigin);
        const data = {
          isSubFrame,
          isCrossOriginSubFrame,
          charts: [],
          svgLabels: [],
          tables: [],
          iframeText: '',
          selects: [],
          inputs: [],
          options: []
        };

        const isVisibleElement = (el) => {
          if (!el || el.disabled || el.hidden || el.getAttribute?.('aria-hidden') === 'true') return false;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        };

        try {
          // A. Extraction Chart.js (v2, v3, v4)
          const chartInstances = new Set();
          if (window.Chart && window.Chart.instances) {
            const inst = window.Chart.instances;
            const list = inst instanceof Map ? Array.from(inst.values()) : Object.values(inst);
            list.forEach(c => c && chartInstances.add(c));
          }
          document.querySelectorAll('canvas').forEach(canvas => {
            const c = window.Chart?.getChart?.(canvas) || canvas.__chartjs__ || canvas._chart || canvas.chart;
            if (c) chartInstances.add(c);
          });

          chartInstances.forEach(chart => {
            const cfg = chart.config || chart;
            const labels = cfg.data?.labels || [];
            const datasets = cfg.data?.datasets || [];
            datasets.forEach(ds => {
              const pairs = [];
              (ds.data || []).forEach((val, i) => {
                const lbl = labels[i] !== undefined ? labels[i] : `Item ${i + 1}`;
                const v = typeof val === 'object' && val !== null ? JSON.stringify(val) : val;
                pairs.push(`${lbl}: ${v}`);
              });
              if (pairs.length > 0) {
                data.charts.push(`${ds.label ? ds.label + ' -> ' : ''}${pairs.join(' | ')}`);
              }
            });
          });

          // B. Extraction Highcharts
          if (window.Highcharts && Array.isArray(window.Highcharts.charts)) {
            window.Highcharts.charts.filter(Boolean).forEach(chart => {
              (chart.series || []).forEach(s => {
                const pairs = (s.data || []).map(p => `${p.name || p.category || ''}: ${p.y ?? p.value ?? ''}`).filter(Boolean);
                if (pairs.length > 0) {
                  data.charts.push(`${s.name ? s.name + ' -> ' : ''}${pairs.join(' | ')}`);
                }
              });
            });
          }

          // C. Extraction Plotly
          document.querySelectorAll('.js-plotly-plot').forEach(plot => {
            if (Array.isArray(plot.data)) {
              plot.data.forEach(trace => {
                const labels = trace.labels || trace.x || [];
                const values = trace.values || trace.y || [];
                const pairs = labels.map((l, i) => `${l}: ${values[i]}`);
                if (pairs.length > 0) data.charts.push(pairs.join(' | '));
              });
            }
          });

          // D. Extraction SVG & attributs de données / tooltips (ciblée sur les graphiques pour éviter la pollution UI)
          document.querySelectorAll('svg text, svg title, svg [aria-label], [data-tooltip]').forEach(el => {
            if (el.closest && el.closest('#pixpilot-root')) return;
            const txt = (el.textContent || el.getAttribute('aria-label') || el.getAttribute('data-tooltip') || '').trim();
            if (txt && txt.length > 1 && txt.length < 150 && !data.svgLabels.includes(txt)) {
              data.svgLabels.push(txt);
            }
          });

          // E. Extraction des tableaux HTML (<table>)
          document.querySelectorAll('table').forEach(table => {
            if (table.closest('#pixpilot-root')) return;
            const rows = Array.from(table.querySelectorAll('tr')).slice(0, 40).map(tr => {
              return Array.from(tr.querySelectorAll('th, td')).map(cell => (cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim()).join(' | ');
            }).filter(Boolean);
            if (rows.length > 0) {
              data.tables.push(rows.join('\n'));
            }
          });

          // F. Si sous-frame cross-origin (iframe d'exercice Pix), extraire son texte et ses champs (évite les doublons same-origin)
          if (isCrossOriginSubFrame && document.body) {
            const rawText = (document.body.innerText || document.body.textContent || '').trim();
            if (rawText.length > 0) {
              data.iframeText = rawText.slice(0, 2000);
            }

            document.querySelectorAll('select').forEach((sel, idx) => {
              if (!isVisibleElement(sel)) return;
              const opts = Array.from(sel.options).map(o => o.text.trim()).filter(Boolean);
              if (opts.length > 0) {
                data.selects.push({ label: `Menu iframe #${idx + 1}`, options: opts });
              }
            });

            document.querySelectorAll('input:not([type]), input[type="text"], input[type="number"], input[type="search"], textarea').forEach((inp, idx) => {
              if (!isVisibleElement(inp) || inp.readOnly) return;
              const lbl = inp.closest('label')?.innerText?.trim() ||
                inp.getAttribute('aria-label') ||
                inp.placeholder ||
                `Champ iframe #${idx + 1}`;
              data.inputs.push({
                type: inp.getAttribute('type') || (inp.tagName === 'TEXTAREA' ? 'textarea' : 'text'),
                placeholder: inp.placeholder || '',
                label: lbl
              });
            });

            document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(inp => {
              if (!isVisibleElement(inp)) return;
              if (inp.name === 'attachment_selector' || inp.classList?.contains('challenge-statement__file-option_input')) return;
              const lbl = inp.closest('label')?.innerText?.trim() || inp.nextElementSibling?.innerText?.trim() || '';
              if (lbl) data.options.push({ type: inp.type, text: lbl });
            });
          }
        } catch (err) {
          console.warn('[PixPilot] extract-all-frames frame error:', err);
        }

        return data;
      }
    }).then((results) => {
      const frames = (results || []).map(r => r.result).filter(Boolean);
      sendResponse({ success: true, frames });
    }).catch((err) => {
      console.warn('[PixPilot] extract-all-frames error:', err);
      sendResponse({ success: false, error: err.message, frames: [] });
    });

    return true;
  }

  // 3. Application automatique des réponses dans toutes les sous-frames cross-origin Pix
  if (message.action === 'apply-all-frames') {
    const tabId = sender?.tab?.id;
    const answers = message.answers || [];
    if (!tabId || !chrome.scripting || answers.length === 0) {
      sendResponse({ success: false, count: 0 });
      return false;
    }

    const topOrigin = (() => {
      try {
        return sender?.tab?.url ? new URL(sender.tab.url).origin : '';
      } catch (_) {
        return '';
      }
    })();

    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      args: [answers, topOrigin],
      func: (ansList, parentOrigin) => {
        if (window === window.top) return 0; // La frame principale est déjà gérée par PixExtractor
        if (parentOrigin && window.location.origin === parentOrigin) return 0; // Iframe same-origin déjà gérée par PixExtractor

        let count = 0;
        const norm = (s) => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
        const isStructuredUrlOrTime = (s) => /^https?:\/\//i.test(s) || /^\d{1,2}:\d{2}(:\d{2})?$/.test(s) || /^([0-9a-f]{1,4}:){2,}/i.test(s) || /^\s*=/.test(s);
        const cleanAnswers = ansList.map(a => {
          const s = String(a || '').trim();
          return isStructuredUrlOrTime(s) ? s : s.replace(/^([^:=→>]{2,40}?)\s*(?::|=|->|→)\s*/, '').trim();
        });

        const isVisible = (el) => {
          if (!el || el.disabled || el.hidden || el.getAttribute?.('aria-hidden') === 'true') return false;
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        };

        const setNativeVal = (el, val) => {
          const proto = el.tagName === 'TEXTAREA'
            ? HTMLTextAreaElement.prototype
            : el.tagName === 'SELECT'
              ? HTMLSelectElement.prototype
              : HTMLInputElement.prototype;
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          if (desc?.set) desc.set.call(el, val);
          else el.value = val;
        };

        // Radios & Checkboxes dans l'iframe
        document.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(inp => {
          if (!isVisible(inp)) return;
          if (inp.name === 'attachment_selector' || inp.classList?.contains('challenge-statement__file-option_input')) return;
          const lbl = norm(inp.closest('label')?.innerText || inp.nextElementSibling?.innerText || '');
          if (lbl && cleanAnswers.some(a => norm(a) === lbl || (norm(a).length > 3 && lbl.includes(norm(a))))) {
            if (!inp.checked) inp.click();
            if (inp.checked) count++;
          }
        });

        // Selects dans l'iframe
        document.querySelectorAll('select').forEach(sel => {
          if (!isVisible(sel)) return;
          for (const opt of Array.from(sel.options)) {
            if (cleanAnswers.some(a => norm(a) === norm(opt.text) || norm(a) === norm(opt.value))) {
              setNativeVal(sel, opt.value);
              sel.selectedIndex = opt.index;
              opt.selected = true;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              count++;
              break;
            }
          }
        });

        // Champs texte visibles dans l'iframe
        const textInputs = Array.from(document.querySelectorAll('input:not([type]), input[type="text"], input[type="number"], input[type="search"], textarea'))
          .filter(inp => isVisible(inp) && !inp.readOnly);
        textInputs.forEach((inp, idx) => {
          if (idx < cleanAnswers.length) {
            const val = inp.type === 'number' ? cleanAnswers[idx].replace(/\s+/g, '').replace(',', '.') : cleanAnswers[idx];
            inp.focus();
            setNativeVal(inp, val);
            try {
              inp.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: String(val) }));
            } catch (_) {
              inp.dispatchEvent(new Event('input', { bubbles: true }));
            }
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            count++;
          }
        });

        return count;
      }
    }).then((results) => {
      const total = (results || []).reduce((acc, r) => acc + (r.result || 0), 0);
      sendResponse({ success: true, count: total });
    }).catch((err) => {
      console.warn('[PixPilot] apply-all-frames error:', err);
      sendResponse({ success: false, error: err.message, count: 0 });
    });

    return true;
  }

  // 5. Fallback CSP : fournir le CSS du panneau au Shadow DOM si <link> est bloqué par la page
  if (message.action === 'get-panel-css') {
    (async () => {
      try {
        const resp = await fetch(chrome.runtime.getURL('content/content.css'));
        const css = resp.ok ? await resp.text() : '';
        sendResponse({ success: Boolean(css), css });
      } catch (err) {
        sendResponse({ success: false, error: err?.message || 'CSS fetch failed', css: '' });
      }
    })();
    return true;
  }

  // 6. Injection à la demande sans F5 (appelée depuis le popup sur un onglet ouvert avant installation)
  if (message.action === 'inject-and-open' && message.tabId) {
    (async () => {
      const ok = await injectIntoTab(message.tabId, message.url || '');
      if (!ok) {
        sendResponse({ success: false });
        return;
      }
      setTimeout(() => {
        chrome.tabs.sendMessage(message.tabId, message.payload || { action: 'toggle-panel' }, () => {
          const err = chrome.runtime.lastError;
          sendResponse({ success: !err });
        });
      }, 130);
    })();
    return true;
  }

  // 7. Contexte de l'onglet actif pour le Side Panel intégré
  if (message.action === 'get-active-tab-context') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs && tabs[0];
        if (!tab?.id) {
          sendResponse({ success: false, context: null });
          return;
        }
        const fallbackCtx = {
          title: tab.title || '',
          url: tab.url || '',
          selection: '',
          text: ''
        };
        if (!isInjectableUrl(tab.url) || !chrome.scripting) {
          sendResponse({ success: true, context: fallbackCtx });
          return;
        }
        const results = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            let selection = '';
            try { selection = (window.getSelection?.()?.toString() || '').trim().slice(0, 4000); } catch (_) { }
            const mainEl = document.querySelector('main, article, [role="main"]') || document.body;
            const clone = mainEl ? mainEl.cloneNode(true) : null;
            let text = '';
            if (clone) {
              clone.querySelectorAll('#pixpilot-root, script, style, noscript, svg').forEach(el => el.remove());
              text = (clone.innerText || clone.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 8000);
            }
            return { title: document.title || '', url: location.href || '', selection, text };
          }
        }).catch(() => null);
        const res = results && results[0]?.result;
        sendResponse({ success: true, context: res || fallbackCtx });
      } catch (_) {
        sendResponse({ success: false, context: null });
      }
    })();
    return true;
  }

  // 4. Téléchargement sans blocage CORS des fichiers d'exercices Pix (Excel, ODS, ZIP, Word, PDF...)
  if (message.action === 'fetch-file-base64' && message.url) {
    (async () => {
      const fetchWithTimeout = async (url, opts) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
          return await fetch(url, { ...opts, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
      };

      try {
        let resp = null;
        try {
          resp = await fetchWithTimeout(message.url, { credentials: 'omit', cache: 'no-store' });
        } catch (err) {
          console.warn('[PixPilot] fetch omit error:', err);
        }
        if (!resp || !resp.ok) {
          resp = await fetchWithTimeout(message.url, { credentials: 'include', cache: 'no-store' });
        }
        if (!resp || !resp.ok) {
          sendResponse({ success: false, error: `HTTP ${resp ? resp.status : 'network'}` });
          return;
        }
        const cd = resp.headers.get('content-disposition') || '';
        const ct = resp.headers.get('content-type') || '';
        const buf = await resp.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        const base64 = btoa(binary);
        sendResponse({
          success: true,
          base64,
          contentType: ct,
          contentDisposition: cd
        });
      } catch (err) {
        console.warn('[PixPilot] fetch-file-base64 error:', err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
