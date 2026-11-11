/**
 * PixPilot - Service Worker
 * Gère l'initialisation, la capture GPU native de l'onglet,
 * l'extraction profonde multi-frames (Chart.js, Highcharts, SVG, iframes Pix)
 * et l'application automatique des réponses dans les iframes.
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

chrome.commands?.onCommand?.addListener((command) => {
  if (command === 'toggle-pixpilot') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'toggle-panel' });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 1. Capture d'écran GPU réelle de l'onglet visible (inclut iframes, canvas, graphiques, infobulles)
  if (message.action === 'capture-visible-tab') {
    const windowId = sender?.tab?.windowId ?? chrome.windows.WINDOW_ID_CURRENT;
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

    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: 'MAIN',
      func: () => {
        const isSubFrame = window !== window.top;
        const data = {
          isSubFrame,
          charts: [],
          svgLabels: [],
          tables: [],
          iframeText: '',
          selects: [],
          inputs: [],
          options: []
        };

        try {
          // A. Extraction Chart.js (v2, v3, v4)
          const chartInstances = new Set();
          if (window.Chart) {
            if (window.Chart.instances) {
              const inst = window.Chart.instances;
              const list = inst instanceof Map ? Array.from(inst.values()) : Object.values(inst);
              list.forEach(c => c && chartInstances.add(c));
            }
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

          // D. Extraction SVG & attributs de données / tooltips
          document.querySelectorAll('svg text, svg title, [data-tooltip], [aria-label]').forEach(el => {
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
              return Array.from(tr.querySelectorAll('th, td')).map(cell => cell.innerText.replace(/\s+/g, ' ').trim()).join(' | ');
            }).filter(Boolean);
            if (rows.length > 0) {
              data.tables.push(rows.join('\n'));
            }
          });

          // F. Si sous-frame (iframe d'exercice Pix), extraire son texte et ses champs
          if (isSubFrame && document.body) {
            const rawText = document.body.innerText?.trim() || '';
            if (rawText.length > 0) {
              data.iframeText = rawText.slice(0, 2000);
            }

            document.querySelectorAll('select').forEach((sel, idx) => {
              const opts = Array.from(sel.options).map(o => o.text.trim()).filter(Boolean);
              if (opts.length > 0) {
                data.selects.push({ label: `Menu iframe #${idx + 1}`, options: opts });
              }
            });

            document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(inp => {
              const lbl = inp.closest('label')?.innerText?.trim() || inp.nextElementSibling?.innerText?.trim() || '';
              if (lbl) data.options.push({ type: inp.type, text: lbl });
            });
          }
        } catch (_) {}

        return data;
      }
    }).then((results) => {
      const frames = (results || []).map(r => r.result).filter(Boolean);
      sendResponse({ success: true, frames });
    }).catch((err) => {
      sendResponse({ success: false, error: err.message, frames: [] });
    });

    return true;
  }

  // 3. Application automatique des réponses dans toutes les sous-frames (iframes cross-origin Pix)
  if (message.action === 'apply-all-frames') {
    const tabId = sender?.tab?.id;
    const answers = message.answers || [];
    if (!tabId || !chrome.scripting || answers.length === 0) {
      sendResponse({ success: false, count: 0 });
      return false;
    }

    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (ansList) => {
        if (window === window.top) return 0; // La frame principale est déjà gérée par PixExtractor
        let count = 0;
        const norm = (s) => (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
        const cleanAnswers = ansList.map(a => a.replace(/^([^:=→>]{2,40}?)\s*(?::|=|->|→)\s*/, '').trim());

        // Radios & Checkboxes dans l'iframe
        document.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(inp => {
          const lbl = norm(inp.closest('label')?.innerText || inp.nextElementSibling?.innerText || '');
          if (lbl && cleanAnswers.some(a => norm(a) === lbl || (norm(a).length > 3 && lbl.includes(norm(a))))) {
            if (!inp.checked) inp.click();
            count++;
          }
        });

        // Selects dans l'iframe
        document.querySelectorAll('select').forEach(sel => {
          for (const opt of Array.from(sel.options)) {
            if (cleanAnswers.some(a => norm(a) === norm(opt.text) || norm(a) === norm(opt.value))) {
              sel.value = opt.value;
              opt.selected = true;
              sel.dispatchEvent(new Event('input', { bubbles: true }));
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              count++;
              break;
            }
          }
        });

        // Champs texte dans l'iframe
        const textInputs = Array.from(document.querySelectorAll('input:not([type]), input[type="text"], input[type="number"], input[type="search"], textarea'));
        textInputs.forEach((inp, idx) => {
          if (idx < cleanAnswers.length && !inp.disabled && !inp.readOnly) {
            inp.focus();
            inp.value = cleanAnswers[idx];
            inp.dispatchEvent(new Event('input', { bubbles: true }));
            inp.dispatchEvent(new Event('change', { bubbles: true }));
            count++;
          }
        });

        return count;
      },
      args: [answers]
    }).then((results) => {
      const total = (results || []).reduce((acc, r) => acc + (r.result || 0), 0);
      sendResponse({ success: true, count: total });
    }).catch(() => {
      sendResponse({ success: false, count: 0 });
    });

    return true;
  }

  // 4. Téléchargement sans blocage CORS des fichiers d'exercices Pix (Excel, ODS, ZIP, Word, PDF...)
  if (message.action === 'fetch-file-base64' && message.url) {
    (async () => {
      try {
        let resp = null;
        try {
          resp = await fetch(message.url, { credentials: 'omit', cache: 'no-store' });
        } catch (_) {}
        if (!resp || !resp.ok) {
          resp = await fetch(message.url, { credentials: 'include', cache: 'no-store' });
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
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }
});
