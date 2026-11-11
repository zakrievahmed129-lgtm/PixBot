/**
 * PixPilot - Query Engine
 * Exécute localement (en JavaScript, sur les données RÉELLES du tableur) les requêtes
 * <query>{...}</query> décrites par Gemini : filtres multi-critères, tri, limite, puis
 * sortie (concaténation, comptage, somme, moyenne, min, max, liste...).
 * => L'IA ne calcule plus "de tête" : elle décrit l'opération, le JS calcule le résultat exact.
 *
 * Format :
 * {
 *   "table": "Feuille1",                       (optionnel : nom de feuille ou de fichier)
 *   "filters": [
 *     {"col": "Ville", "op": "=", "value": "Calais"},
 *     {"col": "Age", "op": "=", "value": 20},
 *     {"col": "Note", "op": ">=", "value": 12},
 *     {"any": [ {...}, {...} ]}                 (groupe OU)
 *   ],
 *   "sort": [{"col": "Note", "dir": "desc"}],   (optionnel)
 *   "limit": 10,                                (optionnel)
 *   "output": {"col": "Code", "mode": "concat", "sep": "", "take": "first_char", "round": 2}
 * }
 * Opérateurs : = != > >= < <= contains not_contains starts ends in not_in between empty not_empty
 * Modes : concat | list | count | count_distinct | sum | avg | min | max | first | last | rows
 */

const PixQueryEngine = {
  norm(s) {
    return String(s ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[\u00A0\u202F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },

  toNum(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'boolean') return NaN;
    const c = String(v ?? '')
      .replace(/[\s\u00A0\u202F]+/g, '')
      .replace(/[€$%]/g, '')
      .replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(c) ? parseFloat(c) : NaN;
  },

  formatNum(n, round) {
    if (!Number.isFinite(n)) return '';
    let v = n;
    if (Number.isInteger(round) && round >= 0) {
      const p = Math.pow(10, round);
      v = Math.round(v * p) / p;
    }
    if (Number.isInteger(v)) return String(v);
    const s = (Number.isInteger(round) ? v.toFixed(round) : v.toFixed(4).replace(/\.?0+$/, ''));
    return s.replace('.', ',');
  },

  /**
   * Extrait et parse les blocs <query>...</query> d'une réponse brute de Gemini
   */
  extractQueries(rawText) {
    const out = [];
    if (!rawText) return out;
    const matches = rawText.matchAll(/<query>([\s\S]*?)<\/query>/gi);
    for (const m of matches) {
      const q = this.safeParseJSON(m[1]);
      if (q && typeof q === 'object') out.push(q);
    }
    return out;
  },

  safeParseJSON(str) {
    let s = String(str || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    const attempts = [
      s,
      s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'"),
      s.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1'),
      s.replace(/[“”]/g, '"').replace(/,\s*([}\]])/g, '$1').replace(/'/g, '"')
    ];
    for (const a of attempts) {
      try { return JSON.parse(a); } catch (_) {}
    }
    return null;
  },

  /**
   * Choisit la table la plus pertinente pour la requête
   */
  findTable(tables, q) {
    if (!tables || tables.length === 0) return null;
    const cols = this.collectColumns(q);
    let best = null;
    let bestScore = -1;
    for (const t of tables) {
      let score = 0;
      if (q.table) {
        const nt = this.norm(q.table);
        if (this.norm(t.sheet) === nt) score += 50;
        else if (this.norm(t.sheet).includes(nt) || nt.includes(this.norm(t.sheet))) score += 20;
        if (this.norm(t.source).includes(nt)) score += 10;
      }
      for (const c of cols) {
        if (this.resolveCol(t, c, false) >= 0) score += 10;
      }
      score += Math.min(5, t.rows.length / 100);
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  },

  collectColumns(q) {
    const cols = [];
    const walk = (filters) => {
      (filters || []).forEach(f => {
        if (!f) return;
        if (Array.isArray(f.any)) walk(f.any);
        else if (f.col !== undefined) cols.push(f.col);
      });
    };
    walk(q.filters);
    (q.sort || []).forEach(s => s && s.col !== undefined && cols.push(s.col));
    if (q.output && q.output.col !== undefined) cols.push(q.output.col);
    return cols;
  },

  /**
   * Résout une référence de colonne (nom d'en-tête, lettre Excel ou "B (Nom)") en index
   */
  resolveCol(table, ref, allowLetter = true) {
    if (ref === undefined || ref === null) return -1;
    const raw = String(ref).trim();
    const n = this.norm(raw);

    // "B (Note)" -> tenter le nom entre parenthèses puis la lettre
    const parenMatch = raw.match(/^([A-Z]{1,3})\s*\((.+)\)$/i);
    if (parenMatch) {
      const byName = this.resolveCol(table, parenMatch[2], false);
      if (byName >= 0) return byName;
      return this.resolveCol(table, parenMatch[1], true);
    }

    // 1. Correspondance exacte de l'en-tête
    let idx = table.headers.findIndex(h => h && this.norm(h) === n);
    if (idx >= 0) return idx;

    // 2. Lettre Excel exacte (A, B, AA...) si aucune en-tête ne correspond
    if (allowLetter && /^[A-Z]{1,3}$/i.test(raw)) {
      idx = table.letters.findIndex(l => l === raw.toUpperCase());
      if (idx >= 0) return idx;
    }

    // 3. Correspondance partielle (en-tête contient la référence ou inversement)
    idx = table.headers.findIndex(h => h && (this.norm(h).includes(n) || n.includes(this.norm(h))) && Math.min(n.length, this.norm(h).length) >= 2);
    if (idx >= 0) return idx;

    // 4. Correspondance sur les mots (ex: "note obtenue" vs "Note")
    const words = n.split(/[^a-z0-9]+/).filter(w => w.length >= 3);
    idx = table.headers.findIndex(h => {
      const nh = this.norm(h);
      return h && words.some(w => nh.includes(w));
    });
    return idx;
  },

  cellValue(row, idx) {
    const raw = row.raw ? row.raw[idx] : undefined;
    const disp = row.cells ? row.cells[idx] : undefined;
    return { raw: raw === undefined ? disp : raw, disp: disp === undefined ? String(raw ?? '') : String(disp) };
  },

  testFilter(table, row, f) {
    if (!f) return true;
    if (Array.isArray(f.any)) {
      return f.any.some(sub => this.testFilter(table, row, sub));
    }
    if (Array.isArray(f.all)) {
      return f.all.every(sub => this.testFilter(table, row, sub));
    }
    const idx = this.resolveCol(table, f.col);
    if (idx < 0) throw new Error(`Colonne introuvable : ${f.col}`);

    const { raw, disp } = this.cellValue(row, idx);
    const op = String(f.op || '=').toLowerCase().trim();
    const cellNum = this.toNum(raw !== '' && raw !== undefined ? raw : disp);
    const cellStr = this.norm(disp);
    const val = f.value;
    const valNum = this.toNum(val);
    const valStr = this.norm(val);
    const bothNum = !isNaN(cellNum) && !isNaN(valNum);

    switch (op) {
      case '=': case '==': case 'eq': case 'equals':
        return bothNum ? Math.abs(cellNum - valNum) < 1e-9 : cellStr === valStr;
      case '!=': case '<>': case 'ne': case 'not':
        return bothNum ? Math.abs(cellNum - valNum) >= 1e-9 : cellStr !== valStr;
      case '>': case 'gt':
        return bothNum ? cellNum > valNum : (cellStr.localeCompare(valStr, 'fr') > 0);
      case '>=': case 'gte': case 'ge':
        return bothNum ? cellNum >= valNum - 1e-9 : (cellStr.localeCompare(valStr, 'fr') >= 0);
      case '<': case 'lt':
        return bothNum ? cellNum < valNum : (cellStr.localeCompare(valStr, 'fr') < 0);
      case '<=': case 'lte': case 'le':
        return bothNum ? cellNum <= valNum + 1e-9 : (cellStr.localeCompare(valStr, 'fr') <= 0);
      case 'contains': case 'contient':
        return cellStr.includes(valStr);
      case 'not_contains':
        return !cellStr.includes(valStr);
      case 'starts': case 'startswith': case 'commence':
        return cellStr.startsWith(valStr);
      case 'ends': case 'endswith': case 'finit':
        return cellStr.endsWith(valStr);
      case 'in': {
        const list = Array.isArray(val) ? val : [val];
        return list.some(v => {
          const vn = this.toNum(v);
          return (!isNaN(cellNum) && !isNaN(vn)) ? Math.abs(cellNum - vn) < 1e-9 : cellStr === this.norm(v);
        });
      }
      case 'not_in': {
        const list = Array.isArray(val) ? val : [val];
        return !list.some(v => {
          const vn = this.toNum(v);
          return (!isNaN(cellNum) && !isNaN(vn)) ? Math.abs(cellNum - vn) < 1e-9 : cellStr === this.norm(v);
        });
      }
      case 'between': {
        const [a, b] = Array.isArray(val) ? val.map(v => this.toNum(v)) : [NaN, NaN];
        return !isNaN(cellNum) && cellNum >= Math.min(a, b) - 1e-9 && cellNum <= Math.max(a, b) + 1e-9;
      }
      case 'empty':
        return cellStr === '';
      case 'not_empty': case 'notempty':
        return cellStr !== '';
      default:
        throw new Error(`Opérateur inconnu : ${op}`);
    }
  },

  applyTake(str, take) {
    const s = String(str ?? '');
    if (!take) return s;
    if (take === 'first_char') return s.trim().charAt(0);
    if (take === 'last_char') return s.trim().slice(-1);
    if (take === 'year' || take === 'annee') {
      const ym = s.match(/\b(19\d\d|20\d\d)\b/);
      if (ym) return ym[1];
    }
    const m = String(take).match(/^(first|last)_(\d+)$/);
    if (m) return m[1] === 'first' ? s.trim().slice(0, +m[2]) : s.trim().slice(-m[2]);
    if (take === 'upper') return s.toUpperCase();
    if (take === 'lower') return s.toLowerCase();
    return s;
  },

  /**
   * Exécute une requête et renvoie { ok, answers[], count, detail }
   */
  execute(tables, q) {
    try {
      if (!q || typeof q !== 'object') return { ok: false, error: 'Requête invalide' };
      const table = this.findTable(tables, q);
      if (!table) return { ok: false, error: 'Aucune table disponible' };

      let rows = table.rows.filter(r => r.cells && r.cells.some(c => c !== '' && c !== undefined));
      for (const f of (q.filters || [])) {
        rows = rows.filter(r => this.testFilter(table, r, f));
      }

      if (Array.isArray(q.sort) && q.sort.length > 0) {
        const sorters = q.sort.map(s => ({ idx: this.resolveCol(table, s.col), desc: /desc|d[eé]cr/i.test(s.dir || '') }));
        if (sorters.some(s => s.idx < 0)) throw new Error('Colonne de tri introuvable');
        rows = [...rows].sort((a, b) => {
          for (const s of sorters) {
            const va = this.cellValue(a, s.idx);
            const vb = this.cellValue(b, s.idx);
            const na = this.toNum(va.raw);
            const nb = this.toNum(vb.raw);
            let cmp = (!isNaN(na) && !isNaN(nb)) ? na - nb : this.norm(va.disp).localeCompare(this.norm(vb.disp), 'fr');
            if (s.desc) cmp = -cmp;
            if (cmp !== 0) return cmp;
          }
          return a.excelRow - b.excelRow;
        });
      }

      if (Number.isInteger(q.offset) && q.offset > 0) rows = rows.slice(q.offset);
      if (Number.isInteger(q.limit) && q.limit > 0) rows = rows.slice(0, q.limit);

      const out = q.output || {};
      const mode = String(out.mode || 'concat').toLowerCase();
      const count = rows.length;

      if (mode === 'count') {
        return { ok: true, answers: [String(count)], count, table, rows };
      }

      const colIdx = this.resolveCol(table, out.col);
      if (colIdx < 0) throw new Error(`Colonne de sortie introuvable : ${out.col}`);

      const values = rows.map(r => this.cellValue(r, colIdx));
      const nums = values.map(v => this.toNum(v.raw)).filter(n => !isNaN(n));
      const round = Number.isInteger(out.round) ? out.round : undefined;
      let answers;

      switch (mode) {
        case 'concat':
          answers = [values.map(v => this.applyTake(v.disp, out.take)).join(out.sep ?? '')];
          break;
        case 'list':
          answers = values.map(v => this.applyTake(v.disp, out.take)).filter(Boolean);
          break;
        case 'count_distinct':
          answers = [String(new Set(values.map(v => this.norm(v.disp)).filter(Boolean)).size)];
          break;
        case 'sum':
          answers = [this.formatNum(nums.reduce((a, b) => a + b, 0), round)];
          break;
        case 'avg': case 'mean': case 'moyenne':
          answers = [nums.length ? this.formatNum(nums.reduce((a, b) => a + b, 0) / nums.length, round) : ''];
          break;
        case 'min':
          answers = [nums.length ? this.formatNum(Math.min(...nums), round) : ''];
          break;
        case 'max':
          answers = [nums.length ? this.formatNum(Math.max(...nums), round) : ''];
          break;
        case 'sumproduct': {
          let c1 = -1, c2 = -1;
          if (Array.isArray(out.cols) && out.cols.length >= 2) {
            c1 = this.resolveCol(table, out.cols[0]);
            c2 = this.resolveCol(table, out.cols[1]);
          } else if (out.col && out.col2) {
            c1 = this.resolveCol(table, out.col);
            c2 = this.resolveCol(table, out.col2);
          } else if (table.detectedSumproduct) {
            answers = [String(table.detectedSumproduct)];
            break;
          }
          if (c1 < 0 || c2 < 0) throw new Error(`Colonnes sumproduct introuvables : ${out.cols || [out.col, out.col2]}`);
          let totalSP = 0;
          for (const r of rows) {
            const n1 = this.toNum(this.cellValue(r, c1).raw);
            const n2 = this.toNum(this.cellValue(r, c2).raw);
            if (!isNaN(n1) && !isNaN(n2)) totalSP += n1 * n2;
          }
          answers = [this.formatNum(totalSP, round)];
          break;
        }
        case 'first':
          answers = [values.length ? this.applyTake(values[0].disp, out.take) : ''];
          break;
        case 'last':
          answers = [values.length ? this.applyTake(values[values.length - 1].disp, out.take) : ''];
          break;
        default:
          answers = [values.map(v => this.applyTake(v.disp, out.take)).join(out.sep ?? '')];
      }

      if (!answers.length || answers.every(a => a === '')) {
        return { ok: false, error: `0 ligne correspondante (${count})`, count, table, rows };
      }
      return { ok: true, answers, count, table, rows };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }
};

if (typeof window !== 'undefined') {
  window.PixQueryEngine = PixQueryEngine;
}

