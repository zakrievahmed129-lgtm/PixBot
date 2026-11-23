/**
 * PixPilot - File Parser & Spreadsheet/Archive Intelligence Engine
 * Analyse complète des fichiers pour Gemini API :
 * - Archives ZIP (.zip) : décompression récursive et analyse de tous les fichiers Excel, Calc, CSV, Word, Texte contenus dans l'archive
 * - Excel / Calc / CSV (.xlsx, .xls, .ods, .csv) :
 *   * Coordonnées Excel exactes (Colonnes A, B, C... et Lignes 1, 2, 3...)
 *   * Lecture intégrale jusqu'à 2500 lignes (aucune coupure à 250 lignes)
 *   * Extraction des formules avec traduction automatique en syntaxe Excel/Calc FR (; et noms FR : SOMME, MOYENNE, SI, NB.SI, RECHERCHEV...)
 *   * Pré-calculs JavaScript exacts : SOMME, MOYENNE, MIN, MAX, NB, NB.SI
 *   * Tri exact Croissant & Décroissant (Top 20) + concaténation automatique des colonnes de type "indice / lettre / code"
 *   * Comparaison automatique inter-feuilles et inter-fichiers (éléments présents/absents)
 * - Word / OpenDocument (.docx, .odt), PDF, Images et Code.
 */

const PixFileParser = {
  /**
   * Point d'entrée : analyse le fichier et attache les tables structurées (pour PixQueryEngine)
   */
  async processFile(file) {
    const collectedTables = [];
    const result = await this._processFileInner(file, collectedTables);
    if (result && collectedTables.length > 0) {
      result.tables = collectedTables.map(t => ({ ...t, source: t.source || file.name }));
    }
    return result;
  },

  async _processFileInner(file, collectedTables = []) {
    const ext = file.name.split('.').pop().toLowerCase();
    const mime = (file.type || '').toLowerCase();

    // 1. EXCEL / CALC / CSV (.xlsx, .xls, .ods, .csv) — tester l'extension AVANT zip car .xlsx/.ods sont des conteneurs zip
    if (['xlsx', 'xls', 'ods', 'csv'].includes(ext)) {
      try {
        const textContent = await this.parseSpreadsheet(file, ext, file.name, collectedTables);
        return {
          name: file.name,
          type: 'spreadsheet',
          size: file.size,
          textContent: textContent,
          geminiPart: {
            text: `\n=== FICHIER TABLEUR : ${file.name} ===\n${textContent}\n=== FIN DU FICHIER TABLEUR ===\n`
          }
        };
      } catch (err) {
        console.warn('Erreur parsing SheetJS:', err);
        if (ext !== 'csv') {
          throw new Error(`Impossible de lire le tableur ${file.name} : ${err.message}`);
        }
        const rawText = await this.readAsText(file);
        return {
          name: file.name,
          type: 'spreadsheet',
          size: file.size,
          textContent: rawText,
          geminiPart: {
            text: `\n=== CONTENU BRUT DU FICHIER CSV : ${file.name} ===\n${rawText}\n`
          }
        };
      }
    }

    // 2. WORD & WRITER (.docx, .odt)
    if (['docx', 'odt'].includes(ext)) {
      try {
        const docText = ext === 'odt' ? await this.parseOdt(file) : await this.parseDocx(file);
        return {
          name: file.name,
          type: 'word',
          size: file.size,
          textContent: docText,
          geminiPart: {
            text: `\n=== DOCUMENT TEXTE (${ext.toUpperCase()}) : ${file.name} ===\n${docText}\n=== FIN DU DOCUMENT ===\n`
          }
        };
      } catch (err) {
        console.warn('Erreur lecture document:', err);
        throw new Error(`Impossible de lire le document ${file.name} : ${err.message}`);
      }
    }

    // 3. ARCHIVES ZIP (.zip) — très fréquent sur Pix ("fichiers de calcul déposés dans un dossier")
    if (ext === 'zip' || mime.includes('zip')) {
      try {
        const zipContent = await this.parseZip(file, collectedTables);
        return {
          name: file.name,
          type: 'archive',
          size: file.size,
          textContent: zipContent,
          geminiPart: {
            text: `\n=== ARCHIVE / FICHIER : ${file.name} ===\n${zipContent}\n=== FIN DU FICHIER ===\n`
          }
        };
      } catch (err) {
        console.warn('Erreur lecture ZIP:', err);
        throw new Error(`Impossible de lire l'archive ${file.name} : ${err.message}`);
      }
    }

    // 4. IMAGES
    if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
      const base64 = await this.readAsBase64(file);
      const mimeType = mime || (ext === 'png' ? 'image/png' : 'image/jpeg');
      return {
        name: file.name,
        type: 'image',
        size: file.size,
        mimeType: mimeType,
        previewUrl: `data:${mimeType};base64,${base64}`,
        geminiPart: {
          inlineData: {
            mimeType: mimeType,
            data: base64
          }
        }
      };
    }

    // 5. PDF
    if (mime === 'application/pdf' || ext === 'pdf') {
      const base64 = await this.readAsBase64(file);
      return {
        name: file.name,
        type: 'pdf',
        size: file.size,
        mimeType: 'application/pdf',
        geminiPart: {
          inlineData: {
            mimeType: 'application/pdf',
            data: base64
          }
        }
      };
    }

    // 6. TEXTE BRUT & CODE
    const text = await this.readAsText(file);
    return {
      name: file.name,
      type: 'text',
      size: file.size,
      textContent: text,
      geminiPart: {
        text: `\n=== FICHIER TEXTE : ${file.name} ===\n${text}\n=== FIN DU FICHIER ===\n`
      }
    };
  },

  readAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64Index = result.indexOf('base64,');
        resolve(base64Index !== -1 ? result.substring(base64Index + 7) : result);
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  },

  readAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file, 'UTF-8');
    });
  },

  readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(file);
    });
  },

  colIndexToLetter(colIdx) {
    let letter = '';
    let temp = colIdx;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  },

  toNumber(val) {
    if (typeof val === 'number') return Number.isFinite(val) ? val : NaN;
    if (typeof val !== 'string') return NaN;
    // Supprimer les espaces (ex: "41 365") et remplacer la virgule décimale par un point
    const cleaned = val.replace(/[\s\u00A0\u202F]+/g, '').replace(',', '.');
    if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
      return parseFloat(cleaned);
    }
    return NaN;
  },

  toNum(val) {
    return this.toNumber(val);
  },

  /**
   * Analyse et extrait une date complète (Année, Mois, Jour, ISO) même si le format Excel la masque (ex: "4 janv.")
   */
  parseCellDate(cell) {
    if (!cell) return null;

    // 1. Objet Date natif (cell.t === 'd' ou cell.v instanceof Date)
    if (cell.v instanceof Date && !isNaN(cell.v.getTime())) {
      const y = cell.v.getUTCFullYear();
      const m = String(cell.v.getUTCMonth() + 1).padStart(2, '0');
      const d = String(cell.v.getUTCDate()).padStart(2, '0');
      return { year: y, month: m, day: d, iso: `${y}-${m}-${d}` };
    }

    // 2. Numéro de série de date Excel (ex: 31416 -> 1986-01-04)
    if (typeof cell.v === 'number' && Number.isFinite(cell.v) && cell.v >= 1000 && cell.v <= 80000) {
      const isDateFmt = cell.z && /[dmyhsa]|mmm/i.test(cell.z);
      const isDateText = cell.w && /(janv|f[eé]vr|mars|avr|mai|juin|juil|ao[uû]t|sept|oct|nov|d[eé]c|\b\d{1,2}\/\d{1,2}\b)/i.test(cell.w);
      if (isDateFmt || isDateText || cell.t === 'd') {
        const excelEpoch = Date.UTC(1899, 11, 30);
        const msPerDay = 86400000;
        const totalMs = excelEpoch + Math.round(cell.v * msPerDay);
        const dt = new Date(totalMs);
        if (!isNaN(dt.getTime())) {
          const y = dt.getUTCFullYear();
          const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
          const d = String(dt.getUTCDate()).padStart(2, '0');
          return { year: y, month: m, day: d, iso: `${y}-${m}-${d}` };
        }
      }
    }

    // 3. Date stockée en texte (ex: "1986-01-04" ou "04/01/1986")
    if (typeof cell.v === 'string') {
      const isoMatch = cell.v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (isoMatch) {
        return { year: parseInt(isoMatch[1], 10), month: isoMatch[2].padStart(2, '0'), day: isoMatch[3].padStart(2, '0'), iso: cell.v };
      }
      const frMatch = cell.v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (frMatch) {
        const iso = `${frMatch[3]}-${frMatch[2].padStart(2, '0')}-${frMatch[1].padStart(2, '0')}`;
        return { year: parseInt(frMatch[3], 10), month: frMatch[2].padStart(2, '0'), day: frMatch[1].padStart(2, '0'), iso };
      }
    }

    return null;
  },

  /**
   * Traduit une formule Excel anglaise extraite par SheetJS en formule Excel/Calc française
   */
  toFrenchFormula(enFormula) {
    if (!enFormula) return '';
    let f = enFormula.replace(/^of:=/i, '').replace(/^=/, '');
    // Nettoyer la notation OpenFormula [.B2:.B31] -> B2:B31
    f = f.replace(/\[\.([A-Z]+\d+):\.([A-Z]+\d+)\]/gi, '$1:$2').replace(/\[\.([A-Z]+\d+)\]/gi, '$1');

    const dict = {
      'AVERAGEIF': 'MOYENNE.SI',
      'AVERAGEIFS': 'MOYENNE.SI.ENS',
      'AVERAGE': 'MOYENNE',
      'SUMIFS': 'SOMME.SI.ENS',
      'SUMIF': 'SOMME.SI',
      'SUMPRODUCT': 'SOMMEPROD',
      'SUM': 'SOMME',
      'COUNTIFS': 'NB.SI.ENS',
      'COUNTIF': 'NB.SI',
      'COUNTA': 'NBVAL',
      'COUNTBLANK': 'NB.VIDE',
      'COUNT': 'NB',
      'IFERROR': 'SIERREUR',
      'IF': 'SI',
      'AND': 'ET',
      'OR': 'OU',
      'NOT': 'NON',
      'VLOOKUP': 'RECHERCHEV',
      'HLOOKUP': 'RECHERCHEH',
      'XLOOKUP': 'RECHERCHEX',
      'INDEX': 'INDEX',
      'MATCH': 'EQUIV',
      'LEFT': 'GAUCHE',
      'RIGHT': 'DROITE',
      'MID': 'STXT',
      'LEN': 'NBCAR',
      'CONCATENATE': 'CONCATENER',
      'UPPER': 'MAJUSCULE',
      'LOWER': 'MINUSCULE',
      'PROPER': 'NOMPROPRE',
      'ROUNDUP': 'ARRONDI.SUP',
      'ROUNDDOWN': 'ARRONDI.INF',
      'ROUND': 'ARRONDI',
      'TODAY': 'AUJOURDHUI',
      'NOW': 'MAINTENANT',
      'YEAR': 'ANNEE',
      'MONTH': 'MOIS',
      'DAY': 'JOUR'
    };

    for (const [en, fr] of Object.entries(dict)) {
      const reg = new RegExp(`\\b${en}\\s*\\(`, 'gi');
      f = f.replace(reg, `${fr}(`);
    }

    // Convertir les virgules séparatrices d'arguments en points-virgules (hors chaînes entre guillemets)
    f = f.replace(/"(?:[^"\\]|\\.)*"|,/g, (m) => (m === ',' ? ';' : m));
    return `=${f}`;
  },

  /**
   * Analyse complète d'un fichier ou ArrayBuffer tableur
   */
  async parseSpreadsheet(fileOrBuffer, ext = '', customLabel = '', collectedTables = []) {
    if (typeof XLSX === 'undefined') {
      if (fileOrBuffer instanceof ArrayBuffer || ArrayBuffer.isView(fileOrBuffer)) {
        return new TextDecoder('utf-8').decode(fileOrBuffer);
      }
      return typeof fileOrBuffer.text === 'function' ? await fileOrBuffer.text() : '';
    }

    let workbook;
    if (ext === 'csv') {
      const csvText = (fileOrBuffer instanceof ArrayBuffer || ArrayBuffer.isView(fileOrBuffer))
        ? new TextDecoder('utf-8').decode(fileOrBuffer)
        : await this.readAsText(fileOrBuffer);
      workbook = XLSX.read(csvText, { type: 'string', raw: false });
    } else {
      const data = fileOrBuffer instanceof ArrayBuffer ? fileOrBuffer : await this.readAsArrayBuffer(fileOrBuffer);
      workbook = XLSX.read(data, {
        type: 'array',
        cellFormula: true,
        cellNF: true,
        cellDates: true
      });
    }

    return this.formatWorkbookAnalysis(workbook, customLabel, collectedTables);
  },

  formatWorkbookAnalysis(workbook, customLabel = '', collectedTables = []) {
    let output = `${customLabel ? `[Fichier: ${customLabel}] ` : ''}Nombre de feuilles : ${workbook.SheetNames.length} (${workbook.SheetNames.join(', ')})\n`;
    const allSheetDistinctStrings = {};

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet || !sheet['!ref']) return;

      const range = XLSX.utils.decode_range(sheet['!ref']);
      const totalRows = range.e.r - range.s.r + 1;
      const totalCols = Math.min(range.e.c - range.s.c + 1, 50);
      const maxRowsToRender = Math.min(range.e.r + 1, 2500);

      output += `\n==========================================================\n`;
      output += `FEUILLE : "${sheetName}" (Plage : ${sheet['!ref']}, ${totalRows} lignes)\n`;
      output += `==========================================================\n`;

      const formulasList = [];
      const errorsList = [];
      const matrix = [];
      const distinctTextSet = new Set();

      for (let r = range.s.r; r <= range.e.r; r++) {
        const rowCells = [];
        const rawRow = [];
        let hasContent = false;

        for (let c = range.s.c; c < range.s.c + totalCols; c++) {
          const colLetter = this.colIndexToLetter(c);
          const cellAddress = `${colLetter}${r + 1}`;
          const cell = sheet[cellAddress];

          if (!cell) {
            rowCells.push('');
            rawRow.push('');
            continue;
          }

          hasContent = true;
          let displayVal = cell.w !== undefined ? String(cell.w) : (cell.v !== undefined ? String(cell.v) : '');
          displayVal = displayVal.replace(/\r?\n/g, ' ').trim();

          const dateInfo = this.parseCellDate(cell);
          if (dateInfo) {
            // Si la valeur affichée masque l'année (ex: "4 janv." masquant 1986)
            if (!/\b(19\d\d|20\d\d)\b/.test(displayVal)) {
              displayVal = `${dateInfo.iso} (${displayVal || dateInfo.year})`;
            }
          }

          if (cell.f) {
            const frForm = this.toFrenchFormula(cell.f);
            formulasList.push(`${cellAddress} -> Formule FR : ${frForm} (EN: =${cell.f}) | Valeur affichée : "${displayVal}"`);
          }
          if (cell.t === 'e' || /^#(NOM\?|NAME\?|REF!|DIV\/0!|VALEUR!|VALUE!|N\/A|NUM!|NULL!|ERR)/i.test(displayVal)) {
            errorsList.push(`${cellAddress} affiche l'erreur "${displayVal}"${cell.f ? ` (formule: ${this.toFrenchFormula(cell.f)})` : ''}`);
          }

          if (displayVal && isNaN(this.toNumber(displayVal)) && displayVal.length > 1 && displayVal.length < 80) {
            distinctTextSet.add(displayVal);
          }

          rowCells.push(displayVal);
          rawRow.push(dateInfo ? dateInfo.iso : (cell.v !== undefined ? cell.v : displayVal));
        }

        if (hasContent || r <= 25) {
          matrix.push({
            excelRow: r + 1,
            cells: rowCells,
            raw: rawRow
          });
        }
      }

      allSheetDistinctStrings[sheetName] = distinctTextSet;

      // 1. Formules et erreurs détectées
      if (formulasList.length > 0) {
        output += `\n[FORMULES DÉTECTÉES DANS "${sheetName}" (${formulasList.length} formules)] :\n`;
        formulasList.slice(0, 80).forEach(f => {
          output += `  • ${f}\n`;
        });
        if (formulasList.length > 80) {
          output += `  • ... (${formulasList.length - 80} autres formules)\n`;
        }
      }

      if (errorsList.length > 0) {
        output += `\n[ERREURS DÉTECTÉES DANS "${sheetName}"] :\n`;
        errorsList.forEach(e => {
          output += `  • ${e}\n`;
        });
      }

      // 2. Détection intelligente de la vraie ligne d'en-tête (sans confondre une ligne de données "Gare | 25000" avec un en-tête !)
      const maxNonEmptyCols = Math.max(1, ...matrix.slice(0, 20).map(r => r.cells.filter(Boolean).length));
      let headerRowIndex = matrix.slice(0, 15).findIndex((row, idx) => {
        const nonEmpty = row.cells.filter(Boolean);
        if (nonEmpty.length < Math.max(1, Math.floor(maxNonEmptyCols * 0.6))) return false;
        const textCount = nonEmpty.filter(v => isNaN(this.toNumber(v))).length;
        // Une vraie ligne d'en-tête est composée exclusivement de texte (ou d'années à 4 chiffres comme 2016, 2020)
        const nonHeaderNums = nonEmpty.filter(v => {
          const n = this.toNumber(v);
          return !isNaN(n) && !(Number.isInteger(n) && n >= 1900 && n <= 2100);
        });
        if (nonHeaderNums.length > 0) return false;
        return textCount >= 1 && idx < matrix.length - 1;
      });

      const headerRow = headerRowIndex >= 0 ? matrix[headerRowIndex] : null;
      const dataRows = (headerRowIndex >= 0 ? matrix.slice(headerRowIndex + 1) : matrix).filter(r => r.cells.some(c => c !== ''));

      // Table structurée conservée pour le moteur de requêtes local (PixQueryEngine)
      const tableLetters = Array.from({ length: totalCols }, (_, i) => this.colIndexToLetter(range.s.c + i));
      const tableHeaders = tableLetters.map((l, i) => (headerRow?.cells?.[i] || '').trim() || l);
      collectedTables.push({
        source: customLabel || '',
        sheet: sheetName,
        headers: tableHeaders,
        letters: tableLetters,
        headerExcelRow: headerRow ? headerRow.excelRow : null,
        rows: dataRows
      });

      // Schéma exact des colonnes (noms à réutiliser tels quels dans <query>)
      if (dataRows.length >= 1) {
        output += `\n[SCHÉMA DES COLONNES de "${sheetName}" — ${dataRows.length} lignes de données${headerRow ? `, en-têtes ligne ${headerRow.excelRow}` : ''}] :\n`;
        tableLetters.forEach((l, i) => {
          const vals = dataRows.map(r => r.cells[i]).filter(v => v !== '' && v !== undefined);
          if (vals.length === 0) return;
          const distinct = Array.from(new Set(vals));
          const numCount = vals.filter(v => !isNaN(this.toNum(v))).length;
          const kind = numCount >= vals.length * 0.8 ? 'nombre' : 'texte';
          const sample = distinct.slice(0, 8).join(' | ');
          output += `  • Colonne ${l} = "${tableHeaders[i]}" (${kind}, ${distinct.length} valeurs distinctes) ex: ${sample}${distinct.length > 8 ? ' | …' : ''}\n`;
        });
      }

      if (dataRows.length >= 1) {
        const colNames = Array.from({ length: totalCols }, (_, i) => {
          const letter = this.colIndexToLetter(range.s.c + i);
          const h = headerRow?.cells?.[i];
          return h ? `${letter} (${h})` : `Col_${letter}`;
        });

        // Identifier les colonnes de type "indice / lettre / code" (1 caractère par ligne)
        const singleCharCols = [];
        for (let c = 0; c < totalCols; c++) {
          const nonEmptyVals = dataRows.map(r => r.cells[c]).filter(Boolean);
          if (nonEmptyVals.length >= 5) {
            const oneCharCount = nonEmptyVals.filter(v => v.length === 1).length;
            if (oneCharCount >= nonEmptyVals.length * 0.7) {
              singleCharCols.push({ colIndex: c, label: colNames[c] });
            }
          }
        }

        const statsOutput = [];
        const sortOutput = [];
        const freqOutput = [];

        for (let c = 0; c < totalCols; c++) {
          const colLetter = this.colIndexToLetter(range.s.c + c);
          const colLabel = colNames[c];
          const numEntries = [];
          const textFreq = {};

          for (const dRow of dataRows) {
            const val = dRow.raw[c];
            const strVal = dRow.cells[c];
            if (strVal === '' || strVal === undefined) continue;

            const num = this.toNumber(val !== '' ? val : strVal);
            if (!isNaN(num)) {
              numEntries.push({ num, row: dRow });
            } else {
              textFreq[strVal] = (textFreq[strVal] || 0) + 1;
            }
          }

          if (numEntries.length >= 2) {
            const nums = numEntries.map(e => e.num);
            const sum = nums.reduce((a, b) => a + b, 0);
            const avg = sum / nums.length;
            const minEntry = numEntries.reduce((a, b) => (b.num < a.num ? b : a), numEntries[0]);
            const maxEntry = numEntries.reduce((a, b) => (b.num > a.num ? b : a), numEntries[0]);
            const firstExcelRow = numEntries[0].row.excelRow;
            const lastExcelRow = numEntries[numEntries.length - 1].row.excelRow;
            const rangeStr = `${colLetter}${firstExcelRow}:${colLetter}${lastExcelRow}`;

            const fmt = (n) => Number.isInteger(n) ? String(n) : n.toFixed(4).replace(/\.?0+$/, '');
            statsOutput.push(
              `  • ${colLabel} [Plage ${rangeStr}] -> NB=${nums.length} | SOMME=${fmt(sum)} (Formule exacte : =SOMME(${rangeStr})) | MOYENNE=${fmt(avg)} (Formule : =MOYENNE(${rangeStr})) | MIN=${fmt(minEntry.num)} (Ligne ${minEntry.row.excelRow}: ${minEntry.row.cells.filter(Boolean).join(' / ')}) | MAX=${fmt(maxEntry.num)} (Ligne ${maxEntry.row.excelRow}: ${maxEntry.row.cells.filter(Boolean).join(' / ')})`
            );

            if (numEntries.length >= 5) {
              const sortedDesc = [...numEntries].sort((a, b) => b.num - a.num).slice(0, 20);
              const sortedAsc = [...numEntries].sort((a, b) => a.num - b.num).slice(0, 20);

              let descBlock = `  [Tri EXACT par ${colLabel} DÉCROISSANT (Top 20)] :\n` +
                sortedDesc.map((e, idx) => `    #${idx + 1} (Ligne ${e.row.excelRow}) : ${e.row.cells.map((cellVal, ci) => `${headerRow?.cells?.[ci] || this.colIndexToLetter(range.s.c + ci)}=${cellVal}`).filter(s => !s.endsWith('=')).join(' | ')}`).join('\n');

              let ascBlock = `  [Tri EXACT par ${colLabel} CROISSANT (Top 20)] :\n` +
                sortedAsc.map((e, idx) => `    #${idx + 1} (Ligne ${e.row.excelRow}) : ${e.row.cells.map((cellVal, ci) => `${headerRow?.cells?.[ci] || this.colIndexToLetter(range.s.c + ci)}=${cellVal}`).filter(s => !s.endsWith('=')).join(' | ')}`).join('\n');

              // Si le tableau possède une colonne de lettres/indices (ex: les 419 communes de l'Ain), pré-concaténer les lettres !
              for (const sc of singleCharCols) {
                const charsDesc = sortedDesc.map(e => e.row.cells[sc.colIndex] || '').join('');
                const charsAsc = sortedAsc.map(e => e.row.cells[sc.colIndex] || '').join('');
                descBlock += `\n    >>> CONCATÉNATION EXACTE de "${sc.label}" (ordre décroissant) : ` +
                  `[5 lettres]="${charsDesc.slice(0, 5)}" | [6]="${charsDesc.slice(0, 6)}" | [7]="${charsDesc.slice(0, 7)}" | [8]="${charsDesc.slice(0, 8)}" | [9 lettres]="${charsDesc.slice(0, 9)}" | [10]="${charsDesc.slice(0, 10)}" | [12]="${charsDesc.slice(0, 12)}" | [15]="${charsDesc.slice(0, 15)}"`;
                ascBlock += `\n    >>> CONCATÉNATION EXACTE de "${sc.label}" (ordre croissant) : ` +
                  `[5 lettres]="${charsAsc.slice(0, 5)}" | [6]="${charsAsc.slice(0, 6)}" | [7]="${charsAsc.slice(0, 7)}" | [8]="${charsAsc.slice(0, 8)}" | [9 lettres]="${charsAsc.slice(0, 9)}" | [10]="${charsAsc.slice(0, 10)}" | [12]="${charsAsc.slice(0, 12)}" | [15]="${charsAsc.slice(0, 15)}"`;
              }

              sortOutput.push(descBlock);
              sortOutput.push(ascBlock);
            }
          } else {
            const distinctKeys = Object.keys(textFreq);
            if (distinctKeys.length >= 2 && distinctKeys.length <= 30 && dataRows.length >= 5) {
              const sortedCounts = distinctKeys.map(k => `${k}: ${textFreq[k]}`).join(' | ');
              freqOutput.push(`  • ${colLabel} (Effectifs NB.SI) -> ${sortedCounts}`);
            }
          }
        }

        if (statsOutput.length > 0) {
          output += `\n[STATISTIQUES EXACTES PRÉ-CALCULÉES] :\n${statsOutput.join('\n')}\n`;
        }
        if (freqOutput.length > 0) {
          output += `\n[COMPTAGES PAR CATÉGORIE (NB.SI)] :\n${freqOutput.join('\n')}\n`;
        }
        if (sortOutput.length > 0) {
          output += `\n[TRIS EXACTS & CONCATÉNATIONS PRÉ-CALCULÉS] :\n${sortOutput.join('\n')}\n`;
        }

        const dateAnalysis = this.detectDatesAnalysis(dataRows, headerRow, totalCols, collectedTables);
        if (dateAnalysis) {
          output += dateAnalysis;
        }

        const barLetterAnalysis = this.detectBarChartLetters(dataRows, headerRow, totalCols, collectedTables);
        if (barLetterAnalysis) {
          output += barLetterAnalysis;
        }

        const sumprodAnalysis = this.detectSumProducts(dataRows, headerRow, totalCols, range, collectedTables);
        if (sumprodAnalysis) {
          output += sumprodAnalysis;
        }
      }

      // 3. Tableau complet avec coordonnées Excel
      output += `\n[DONNÉES DE LA FEUILLE "${sheetName}"] :\n`;
      if (matrix.length > 0) {
        const colHeaders = [];
        for (let c = 0; c < totalCols; c++) {
          colHeaders.push(this.colIndexToLetter(range.s.c + c));
        }
        output += `| Ligne | ${colHeaders.join(' | ')} |\n`;
        output += `| --- | ${colHeaders.map(() => '---').join(' | ')} |\n`;

        const rowsToPrint = matrix.slice(0, maxRowsToRender);
        for (const rObj of rowsToPrint) {
          const escaped = rObj.cells.map(v => String(v ?? '').replace(/\|/g, '\\|'));
          output += `| ${rObj.excelRow} | ${escaped.join(' | ')} |\n`;
        }

        if (matrix.length > maxRowsToRender) {
          output += `\n*(... ${matrix.length - maxRowsToRender} lignes supplémentaires)*\n`;
        }
      }
    });

    // 4. Comparaison inter-feuilles
    const sheetNames = Object.keys(allSheetDistinctStrings);
    if (sheetNames.length >= 2) {
      let diffReport = '';
      for (let i = 0; i < sheetNames.length; i++) {
        for (let j = 0; j < sheetNames.length; j++) {
          if (i === j) continue;
          const sA = sheetNames[i];
          const sB = sheetNames[j];
          const onlyInA = Array.from(allSheetDistinctStrings[sA]).filter(val => !allSheetDistinctStrings[sB].has(val));
          if (onlyInA.length > 0 && onlyInA.length <= 25) {
            diffReport += `  • Présent dans "${sA}" mais ABSENT de "${sB}" : ${onlyInA.join(', ')}\n`;
          }
        }
      }
      if (diffReport) {
        output += `\n==========================================================\n`;
        output += `[COMPARAISON AUTOMATIQUE INTER-FEUILLES]\n${diffReport}`;
        output += `==========================================================\n`;
      }
    }

    return output || 'Tableau vide ou illisible.';
  },

  /**
   * Analyse complète d'une archive .zip (ou d'un fichier Office/OpenDocument servi avec le type MIME application/zip)
   */
  async parseZip(file, collectedTables = []) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip non disponible');
    }

    const arrayBuffer = await this.readAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(arrayBuffer);
    const entries = Object.keys(zip.files);

    // Si le conteneur ZIP est en réalité directement un fichier .xlsx, .ods, .docx ou .odt :
    if (zip.file('xl/workbook.xml')) {
      return await this.parseSpreadsheet(arrayBuffer, 'xlsx', file.name, collectedTables);
    }
    if (zip.file('word/document.xml')) {
      return await this.parseDocx(file);
    }
    if (zip.file('content.xml') && zip.file('meta.xml')) {
      try {
        return await this.parseSpreadsheet(arrayBuffer, 'ods', file.name, collectedTables);
      } catch (_) {
        return await this.parseOdt(file);
      }
    }

    let output = `Arborescence de l'archive ZIP (${entries.length} entrées) :\n`;
    entries.forEach(path => {
      const f = zip.files[path];
      output += `  - ${path}${f.dir ? ' (Dossier)' : ''}\n`;
    });

    for (const path of entries) {
      const zipEntry = zip.files[path];
      if (zipEntry.dir || path.includes('__MACOSX') || path.startsWith('.')) continue;

      const ext = path.split('.').pop().toLowerCase();
      if (['xlsx', 'xls', 'ods', 'csv'].includes(ext)) {
        try {
          const buf = await zipEntry.async('arraybuffer');
          const sheetAnalysis = await this.parseSpreadsheet(buf, ext, path, collectedTables);
          output += `\n--- CONTENU DU TABLEUR DANS LE ZIP : ${path} ---\n${sheetAnalysis}\n`;
        } catch (e) {
          console.warn(`Erreur lecture tableur ZIP ${path}:`, e);
          output += `\n[Erreur lecture tableur ${path}: ${e.message}]\n`;
        }
      } else if (['docx', 'odt'].includes(ext)) {
        try {
          const blob = await zipEntry.async('blob');
          const subFile = new File([blob], path);
          const docText = ext === 'odt' ? await this.parseOdt(subFile) : await this.parseDocx(subFile);
          output += `\n--- CONTENU DU DOCUMENT DANS LE ZIP : ${path} ---\n${docText}\n`;
        } catch (e) {
          console.warn(`Erreur lecture document ZIP ${path}:`, e);
          output += `\n[Erreur lecture document ${path}: ${e.message}]\n`;
        }
      } else if (['txt', 'json', 'md', 'html', 'xml', 'py', 'sql', 'js', 'css'].includes(ext)) {
        try {
          const txt = await zipEntry.async('string');
          output += `\n--- CONTENU DU FICHIER TEXTE DANS LE ZIP : ${path} ---\n${txt.slice(0, 10000)}\n`;
        } catch (e) {
          console.warn(`Erreur lecture texte ZIP ${path}:`, e);
          output += `\n[Erreur lecture texte ${path}: ${e.message}]\n`;
        }
      }
    }

    return output;
  },

  /**
   * Analyse et décode automatiquement les diagrammes en barres formant des lettres (cas classique Pix "ventes selon la saison")
   */
  detectBarChartLetters(dataRows, headerRow, totalCols, collectedTables = []) {
    if (!dataRows || dataRows.length < 2 || dataRows.length > 20) return null;

    let labelColIdx = -1;
    const numColIndices = [];

    for (let c = 0; c < totalCols; c++) {
      const vals = dataRows.map(r => r.cells[c]).filter(v => v !== '' && v !== undefined);
      const numCount = vals.filter(v => !isNaN(this.toNumber(v))).length;
      if (numCount >= vals.length * 0.8 && vals.length >= 2) {
        numColIndices.push(c);
      } else if (labelColIdx === -1 && vals.length >= 2) {
        labelColIdx = c;
      }
    }

    if (numColIndices.length < 3 || numColIndices.length > 10) return null;

    const rowLetters = [];
    const asciiLines = [];

    for (let rIdx = 0; rIdx < dataRows.length; rIdx++) {
      const row = dataRows[rIdx];
      const rowLabel = labelColIdx >= 0 ? (row.cells[labelColIdx] || `Ligne ${rIdx + 1}`) : `Ligne ${rIdx + 1}`;
      const vals = numColIndices.map(c => this.toNumber(row.raw[c] !== '' && row.raw[c] !== undefined ? row.raw[c] : row.cells[c]));
      if (vals.some(v => isNaN(v))) continue;

      const max = Math.max(...vals);
      const min = Math.min(...vals);
      const n = vals.length;
      const last = n - 1;
      let letter = '?';

      const range = (max - min) || 1;
      const norm = vals.map(v => (v - min) / range);

      // Règle 1 : Lettre "I" (une seule colonne très haute au milieu ou 1 seule valeur non nulle)
      const nonZero = vals.filter(v => v > 0);
      if (nonZero.length <= 2 && max > 0 && (vals[1] === max || vals[2] === max || (n >= 4 && vals[n - 2] === max))) {
        letter = 'I';
      } else if (norm.every(v => v >= 0.85)) {
        letter = 'I';
      }
      // Règle 2 : Lettre "L" (la 1ère barre est haute, toutes les barres suivantes sont basses)
      else if (norm[0] >= 0.8 && norm.slice(1).every(v => v <= 0.35)) {
        letter = 'L';
      }
      // Règle 3 : Lettre "U" (la 1ère et la dernière barre sont hautes, le milieu est bas)
      else if (norm[0] >= 0.75 && norm[last] >= 0.75 && norm.slice(1, last).every(v => v <= 0.35)) {
        letter = 'U';
      }
      // Règle 4 : Lettre "J" (la dernière barre est la plus haute, le milieu est bas, la 1ère barre a un petit crochet)
      else if (norm[last] >= 0.8 && norm.slice(1, last).every(v => v <= 0.35) && norm[0] > 0.05 && norm[0] < norm[last]) {
        letter = 'J';
      } else if (norm[last] >= 0.8 && norm.slice(0, last).every(v => v <= 0.35)) {
        letter = 'J';
      }
      // Règle 5 : Lettre "P" ou "F" (deux premières barres hautes, dernières basses)
      else if (norm[0] >= 0.75 && norm[1] >= 0.75 && norm[last] <= 0.35) {
        letter = 'P';
      }
      // Règle 6 : Lettre "N" (première et dernière hautes, descente au milieu)
      else if (norm[0] >= 0.75 && norm[last] >= 0.75 && norm[1] > norm[2]) {
        letter = 'N';
      }
      // Règle 7 : Lettre "O" ou "C"
      else if (norm[0] >= 0.75 && norm[last] >= 0.75) {
        letter = 'O';
      }

      rowLetters.push({ label: rowLabel, letter, vals });

      const barVisual = vals.map((v, i) => {
        const colHead = headerRow?.cells?.[numColIndices[i]] || `Col${i + 1}`;
        const shortHead = colHead.slice(0, 3);
        const bars = '█'.repeat(Math.max(1, Math.round((v / (max || 1)) * 5)));
        return `${shortHead}:${v} [${bars}]`;
      }).join(' | ');

      asciiLines.push(`  • ${rowLabel} (${vals.join(', ')}) -> ${barVisual} => Forme la lettre : ${letter}`);
    }

    if (rowLetters.length >= 2 && rowLetters.some(r => r.letter !== '?')) {
      const word = rowLetters.map(r => r.letter).join('');
      if (Array.isArray(collectedTables) && collectedTables.length > 0) {
        collectedTables[collectedTables.length - 1].detectedBarWord = word;
      }
      let report = `\n==========================================================\n`;
      report += `[DÉTECTION DES LETTRES PAR HISTOGRAMME / DIAGRAMME EN BARRES] :\n`;
      report += `Pix utilise régulièrement des diagrammes où les hauteurs des barres par catégorie/saison dessinent des lettres.\n`;
      report += asciiLines.join('\n') + '\n';
      report += `>>> MOT COMPLET FORMÉ PAR LES SILHOUETTES DE BARRES : "${word}"\n`;
      report += `==========================================================\n`;
      return report;
    }

    return null;
  },

  /**
   * Détecte les colonnes de dates et associe chaque personne à sa date complète et son année de naissance
   */
  detectDatesAnalysis(dataRows, headerRow, totalCols, collectedTables = []) {
    if (!dataRows || dataRows.length === 0) return null;

    // Identifier les colonnes contenant des dates (ISO YYYY-MM-DD ou années à 4 chiffres)
    const dateCols = [];
    for (let c = 0; c < totalCols; c++) {
      const h = (headerRow?.cells?.[c] || '').toLowerCase();
      let matchCount = 0;
      for (const r of dataRows) {
        const str = String(r.raw ? r.raw[c] : r.cells[c] || '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(str) || /\b(19\d\d|20\d\d)-\d{2}-\d{2}\b/.test(str) || /\b(19\d\d|20\d\d)\b/.test(str)) {
          matchCount++;
        }
      }
      if (matchCount >= Math.min(2, dataRows.length) || /date|naissance|anniv|embauche|jour/i.test(h)) {
        dateCols.push({ colIndex: c, header: headerRow?.cells?.[c] || `Col_${c}` });
      }
    }

    if (dateCols.length === 0) return null;

    // Trouver la colonne "nom / prénom / personne"
    let nameColIndex = 0;
    if (headerRow?.cells) {
      const idx = headerRow.cells.findIndex(h => /pr[eé]nom|nom|personne|identit[eé]|[eé]l[eè]ve|individu|client/i.test(h || ''));
      if (idx >= 0) nameColIndex = idx;
    }

    const lines = [];
    const personDates = {};

    for (const r of dataRows) {
      const personName = String(r.cells[nameColIndex] || '').trim();
      for (const dc of dateCols) {
        const rawVal = String(r.raw ? r.raw[dc.colIndex] : r.cells[dc.colIndex] || '');
        const dispVal = String(r.cells[dc.colIndex] || '');
        const yearMatch = rawVal.match(/\b(19\d\d|20\d\d)\b/) || dispVal.match(/\b(19\d\d|20\d\d)\b/);
        const isoMatch = rawVal.match(/\b(\d{4}-\d{2}-\d{2})\b/) || dispVal.match(/\b(\d{4}-\d{2}-\d{2})\b/);

        if (yearMatch) {
          const year = parseInt(yearMatch[1], 10);
          const iso = isoMatch ? isoMatch[1] : rawVal;
          if (personName) {
            personDates[personName.toLowerCase()] = year;
            const normName = personName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            personDates[normName] = year;
          }
          lines.push(`  • Ligne ${r.excelRow} : ${personName || 'Personne'} -> ${dc.header} : Date = ${iso} | Année = ${year} (affichage original : "${dispVal}")`);
        }
      }
    }

    if (lines.length === 0) return null;

    if (Array.isArray(collectedTables) && collectedTables.length > 0) {
      const currentTable = collectedTables[collectedTables.length - 1];
      currentTable.personDates = personDates;
    }

    let report = `\n==========================================================\n`;
    report += `[DATES & ANNÉES DE NAISSANCE DÉTECTÉES DANS LE FICHIER] :\n`;
    report += `Dans les épreuves Pix demandant une date ou l'année de naissance d'une personne (ex: "Quelle est l'année de naissance d'Amadou ?") :\n`;
    report += lines.join('\n') + '\n';
    report += `>>> RÈGLE PIX STRICTE : l'année de naissance attendue est l'année à 4 chiffres listée ci-dessus (ex: pour Amadou -> 1986). Ne jamais répondre 0 !\n`;
    report += `==========================================================\n`;
    return report;
  },

  /**
   * Calcule le montant total des ventes (SOMMEPROD de Quantité × Prix unitaire)
   */
  detectSumProducts(dataRows, headerRow, totalCols, range, collectedTables = []) {
    if (!dataRows || dataRows.length < 2) return null;

    const numColIndices = [];
    for (let c = 0; c < totalCols; c++) {
      const vals = dataRows.map(r => this.toNumber(r.raw ? r.raw[c] : r.cells[c])).filter(n => !isNaN(n));
      if (vals.length >= dataRows.length * 0.8 && vals.length >= 2) {
        numColIndices.push(c);
      }
    }

    if (numColIndices.length < 2) return null;

    let bestPair = null;
    let bestScore = -1;

    for (let i = 0; i < numColIndices.length; i++) {
      for (let j = i + 1; j < numColIndices.length; j++) {
        const c1 = numColIndices[i];
        const c2 = numColIndices[j];
        const h1 = (headerRow?.cells?.[c1] || '').toLowerCase();
        const h2 = (headerRow?.cells?.[c2] || '').toLowerCase();

        let score = 0;
        const isQty1 = /quantit[eé]|qte|nombre|volume|nb|unit[eé]s?/i.test(h1);
        const isQty2 = /quantit[eé]|qte|nombre|volume|nb|unit[eé]s?/i.test(h2);
        const isPrice1 = /prix|tarif|montant|co[uû]t|valeur|pu\b|ttc|ht/i.test(h1);
        const isPrice2 = /prix|tarif|montant|co[uû]t|valeur|pu\b|ttc|ht/i.test(h2);

        if ((isQty1 && isPrice2) || (isQty2 && isPrice1)) score += 50;
        else if (isQty1 || isQty2 || isPrice1 || isPrice2) score += 20;
        else if (numColIndices.length === 2) score += 10;

        if (score > bestScore) {
          bestScore = score;
          bestPair = [c1, c2];
        }
      }
    }

    if (!bestPair || bestScore <= 0) return null;

    const [c1, c2] = bestPair;
    const colLetter1 = this.colIndexToLetter(range.s.c + c1);
    const colLetter2 = this.colIndexToLetter(range.s.c + c2);
    const h1 = headerRow?.cells?.[c1] || `Colonne ${colLetter1}`;
    const h2 = headerRow?.cells?.[c2] || `Colonne ${colLetter2}`;

    let sumProduct = 0;
    let validCount = 0;
    const firstExcelRow = dataRows[0].excelRow;
    const lastExcelRow = dataRows[dataRows.length - 1].excelRow;

    for (const r of dataRows) {
      const v1 = this.toNumber(r.raw ? r.raw[c1] : r.cells[c1]);
      const v2 = this.toNumber(r.raw ? r.raw[c2] : r.cells[c2]);
      if (!isNaN(v1) && !isNaN(v2)) {
        sumProduct += v1 * v2;
        validCount++;
      }
    }

    if (validCount === 0) return null;

    const sumProductFmt = Number.isInteger(sumProduct) ? String(sumProduct) : sumProduct.toFixed(2).replace(/\.?0+$/, '');
    const range1 = `${colLetter1}${firstExcelRow}:${colLetter1}${lastExcelRow}`;
    const range2 = `${colLetter2}${firstExcelRow}:${colLetter2}${lastExcelRow}`;
    const formulaStr = `=SOMMEPROD(${range1}; ${range2})`;

    if (Array.isArray(collectedTables) && collectedTables.length > 0) {
      const currentTable = collectedTables[collectedTables.length - 1];
      currentTable.detectedSumproduct = sumProductFmt;
      currentTable.detectedSumproductFormula = formulaStr;
    }

    let report = `\n==========================================================\n`;
    report += `[CALCUL DU MONTANT TOTAL DES VENTES / SOMMEPROD] :\n`;
    report += `Pour les questions demandant le « montant total des ventes » (quantité vendue × prix unitaire) ou le chiffre d'affaires :\n`;
    report += `  • Colonnes multipliées : "${h1}" (${colLetter1}) × "${h2}" (${colLetter2}) sur ${validCount} lignes\n`;
    report += `  • Formule Excel exacte : ${formulaStr}\n`;
    report += `  • MONTANT TOTAL EXACT = ${sumProductFmt}\n`;
    report += `==========================================================\n`;
    return report;
  },

  async parseDocx(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip non disponible pour analyser le .docx');
    }

    const arrayBuffer = await this.readAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXmlFile = zip.file('word/document.xml');

    if (!docXmlFile) {
      throw new Error('Fichier word/document.xml introuvable dans l\'archive .docx');
    }

    const xmlString = await docXmlFile.async('string');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'application/xml');

    let textParts = [];
    const paragraphs = xmlDoc.getElementsByTagName('w:p');
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      let pText = '';
      const textNodes = p.getElementsByTagName('w:t');
      for (let j = 0; j < textNodes.length; j++) {
        pText += textNodes[j].textContent;
      }
      if (pText.trim().length > 0) {
        textParts.push(pText.trim());
      }
    }

    return textParts.join('\n\n');
  },

  async parseOdt(file) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip non disponible pour analyser le .odt');
    }

    const arrayBuffer = await this.readAsArrayBuffer(file);
    const zip = await JSZip.loadAsync(arrayBuffer);
    const contentXml = zip.file('content.xml');
    if (!contentXml) {
      throw new Error('content.xml introuvable dans le fichier .odt');
    }

    const xmlString = await contentXml.async('string');
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, 'application/xml');
    return (xmlDoc.documentElement?.textContent || '').replace(/\s+/g, ' ').trim();
  }
};

if (typeof window !== 'undefined') {
  window.PixFileParser = PixFileParser;
}
