/**
 * PixPilot - File Parser
 * Gère l'analyse et la préparation des fichiers multimédias et bureautiques pour Gemini API :
 * - Images : PNG, JPEG, WEBP, GIF (conversion Base64 inlineData)
 * - Documents PDF : PDF natif (conversion Base64 inlineData)
 * - Fichiers Excel : .xlsx, .xls, .csv, .ods (extraction tabulaire en Markdown via SheetJS)
 * - Fichiers Word : .docx (extraction structurée des paragraphes et tableaux via JSZip)
 * - Fichiers Texte : .txt, .py, .sql, .json, .html, .csv
 */

const PixFileParser = {
  /**
   * Analyse un fichier et retourne un objet prêt pour Gemini API ou le prompt textuel
   * @param {File} file 
   * @returns {Promise<{ name: string, type: string, size: number, geminiPart?: object, textContent?: string, previewUrl?: string }>}
   */
  async processFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    const mime = file.type || '';

    // 1. IMAGES
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

    // 2. PDF (Gemini gère nativement le PDF via inlineData)
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

    // 3. EXCEL (.xlsx, .xls, .ods, .csv)
    if (['xlsx', 'xls', 'ods', 'csv'].includes(ext)) {
      try {
        const textContent = await this.parseSpreadsheet(file);
        return {
          name: file.name,
          type: 'spreadsheet',
          size: file.size,
          textContent: textContent,
          geminiPart: {
            text: `\n--- CONTENU DU FICHIER EXCEL : ${file.name} ---\n${textContent}\n--- FIN DU FICHIER EXCEL ---\n`
          }
        };
      } catch (err) {
        console.warn('Erreur parsing SheetJS, repli en texte brut:', err);
        const rawText = await this.readAsText(file);
        return {
          name: file.name,
          type: 'spreadsheet',
          size: file.size,
          textContent: rawText,
          geminiPart: {
            text: `\n--- CONTENU BRUT DU FICHIER : ${file.name} ---\n${rawText}\n`
          }
        };
      }
    }

    // 4. WORD (.docx)
    if (ext === 'docx') {
      try {
        const docxText = await this.parseDocx(file);
        return {
          name: file.name,
          type: 'word',
          size: file.size,
          textContent: docxText,
          geminiPart: {
            text: `\n--- CONTENU DU DOCUMENT WORD : ${file.name} ---\n${docxText}\n--- FIN DU DOCUMENT WORD ---\n`
          }
        };
      } catch (err) {
        console.warn('Erreur lecture Docx:', err);
        return {
          name: file.name,
          type: 'word',
          size: file.size,
          textContent: `[Impossible d'extraire le document Word: ${err.message}]`,
          geminiPart: {
            text: `[Erreur lors de la lecture du fichier Word ${file.name}]`
          }
        };
      }
    }

    // 5. TEXTE BRUT & CODE (.txt, .py, .json, .html, .sql, .js, etc.)
    const text = await this.readAsText(file);
    return {
      name: file.name,
      type: 'text',
      size: file.size,
      textContent: text,
      geminiPart: {
        text: `\n--- FICHIER TEXTE ATTACHÉ : ${file.name} ---\n${text}\n--- FIN DU FICHIER ---\n`
      }
    };
  },

  /**
   * Lit un fichier en Base64 pur (sans le préfixe data:...)
   */
  readAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64Index = result.indexOf('base64,');
        if (base64Index !== -1) {
          resolve(result.substring(base64Index + 7));
        } else {
          resolve(result);
        }
      };
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  },

  /**
   * Lit un fichier en tant que chaîne texte UTF-8
   */
  readAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (e) => reject(e);
      reader.readAsText(file);
    });
  },

  /**
   * Lit un ArrayBuffer
   */
  readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (e) => reject(e);
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * Parse un fichier tableur (XLSX, XLS, CSV) en Markdown propre
   */
  async parseSpreadsheet(file) {
    if (typeof XLSX === 'undefined') {
      return await this.readAsText(file);
    }

    const data = await this.readAsArrayBuffer(file);
    const workbook = XLSX.read(data, { type: 'array' });
    let output = '';

    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (!json || json.length === 0) return;

      output += `\n### Feuille : ${sheetName}\n\n`;

      // Conversion en format Markdown pour une compréhension optimale par Gemini
      const maxRows = Math.min(json.length, 250); // Évite de dépasser la mémoire
      const maxCols = Math.min(Math.max(...json.map(r => r.length)), 40);

      if (maxRows > 0) {
        // En-têtes
        const headerRow = json[0] || [];
        const headers = [];
        for (let c = 0; c < maxCols; c++) {
          headers.push(String(headerRow[c] ?? `Col_${c + 1}`).replace(/\|/g, '\\|').trim());
        }
        output += `| ${headers.join(' | ')} |\n`;
        output += `| ${headers.map(() => '---').join(' | ')} |\n`;

        // Lignes de données
        for (let r = 1; r < maxRows; r++) {
          const row = json[r] || [];
          const cells = [];
          for (let c = 0; c < maxCols; c++) {
            cells.push(String(row[c] ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim());
          }
          output += `| ${cells.join(' | ')} |\n`;
        }

        if (json.length > maxRows) {
          output += `\n*(... ${json.length - maxRows} lignes supplémentaires tronquées pour concision ...)*\n`;
        }
      }
    });

    return output || 'Tableau vide ou illisible.';
  },

  /**
   * Parse un document Word (.docx) via JSZip
   */
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

    // Extraction des paragraphes et des tableaux
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
  }
};

// Export pour contextes navigateur & scripts de contenu
if (typeof window !== 'undefined') {
  window.PixFileParser = PixFileParser;
}

