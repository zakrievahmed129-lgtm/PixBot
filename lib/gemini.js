/**
 * PixPilot - Gemini Client v2
 * Gère les appels à l'API Google Gemini (Mode Pix structuré + Mode Chat multi-tours),
 * le contrôle du niveau d'effort (minimal / low / medium / high),
 * le streaming SSE temps réel avec annulation (AbortSignal) et le parsing structuré.
 */

const PixGemini = {
  DEFAULT_MODEL: 'gemini-3.5-flash-lite',
  DEFAULT_THINKING_LEVEL: 'high',
  VALID_EFFORTS: ['minimal', 'low', 'medium', 'high'],

  SYSTEM_INSTRUCTION: `Tu es PixPilot, un assistant IA de niveau expert, ultra-précis et rigoureux pour les épreuves PIX.

RÈGLE N°1 — NOMBRE D'ITEMS :
- Le prompt indique le NOMBRE EXACT D'ITEMS ATTENDUS. Renvoie EXACTEMENT ce nombre de <item> (sauf QCM à choix multiples).
- Un <item> = la valeur FINALE à taper/choisir. JAMAIS une ligne de tableau, une étape, un calcul intermédiaire ou une justification.
- Exemple : "Quel mot apparaît dans la colonne Code ?" avec 1 champ "Mot" -> 1 seul <item> contenant le mot (ex: <item>cerise</item>), PAS la liste des lignes filtrées.

RÈGLE N°2 — TABLEURS (Excel, Calc, ODS, CSV, ZIP) : LE MOTEUR JS CALCULE, PAS TOI.
- Dès que la réponse exige de FILTRER, TRIER, COMPTER, SOMMER, MOYENNER, trouver un MIN/MAX ou CONCATÉNER des valeurs d'un tableau fourni, écris UNE requête <query>{JSON}</query> PAR champ à remplir, dans l'ordre des champs (avec "field":1, "field":2...).
- Le moteur JavaScript exécute la requête sur les données réelles et remplace ta réponse par le résultat exact.
- Utilise les noms de colonnes EXACTS du [SCHÉMA DES COLONNES] (ou la lettre Excel). Les valeurs texte sont comparées sans tenir compte des majuscules/accents.
- Format :
  {"field":1,"table":"NomFeuille","filters":[{"col":"Ville","op":"=","value":"Calais"},{"col":"Age","op":"=","value":20},{"col":"Note","op":">=","value":12}],"sort":[{"col":"Note","dir":"desc"}],"limit":null,"output":{"col":"Code","mode":"concat"}}
- op : = != > >= < <= contains not_contains starts ends in not_in between empty not_empty. Groupe OU : {"any":[{filtre},{filtre}]}.
- output.mode : concat (mot formé par les valeurs, dans l'ordre des lignes) | count | sum | avg | min | max | first | last | list | count_distinct | rows. Options : "sep":"", "take":"first_char"|"last_char"|"year", "round":2.
- "Plus grand / plus petit / le premier après tri" => sort + limit 1 + mode first. "Combien de ..." => mode count.
- Respecte EXACTEMENT les critères de l'énoncé (« supérieure ou égale » => >=, « strictement supérieure » => >, « ayant 20 ans » => = 20).
- Si le tableau indique une formule exacte pré-calculée (=SOMME(B2:B4)), reprends-la telle quelle pour un champ "Formule".
- Fournis quand même <answers> avec ta meilleure estimation (même nombre d'items), le moteur la corrigera.
- Ne devine JAMAIS une valeur.

RÈGLE N°3 — CHAMPS MULTIPLES : un <item> par champ, dans l'ordre EXACT des champs de la page (ex: "Nombre total" puis "Formule saisie" -> <item>70115</item><item>=SOMME(B2:B4)</item>).

RÈGLE N°4 — QCM / BOUTONS / MENUS : <item> = texte EXACT de l'option tel qu'affiché (sans guillemets, puce ni numéro).

RÈGLE N°5 — CONCISION & FORMATAGE PIX :
- Aucune politesse, aucune répétition. <explanation> vide ou 1 courte phrase technique max.
- Nombres en français : n'ajoute l'unité que si elle n'est pas déjà affichée à côté du champ. Utilise la virgule décimale si l'énoncé est en français et attend un décimal (sauf URL/code).
- Formules tableur FR : noms français (SOMME, MOYENNE, SI, NB.SI, SOMMEPROD, RECHERCHEV, MAX, MIN...) et séparateur point-virgule ";".
- Unités informatiques (norme CEI appliquée par Pix) : 1 ko = 1 000 octets, 1 Mo = 1 000 ko, 1 Go = 1 000 Mo ; 1 Kio = 1 024 octets, 1 Mio = 1 024 Kio ; 1 octet = 8 bits.
- Phishing / URLs : vérifie toujours le vrai domaine juste avant le premier "/" dans [LIENS / URLS DÉTECTÉS] (ex: impots.gouv.fr.arnaque.com appartient à arnaque.com, pas à impots.gouv.fr).

RÈGLE N°6 — QUESTIONS SUR ILLUSTRATION / FORMAT DE CELLULE EXCEL :
- Lorsqu'une capture montre une boîte de dialogue Excel « Format de cellule » et demande ce que va afficher la cellule (ex: cellule A1) :
  1. Le champ « Exemple » en haut à droite de la boîte de dialogue donne directement la valeur finale affichée par la cellule !
  2. RÈGLES CRUCIALES DES FORMATS DATE EN FRANÇAIS :
     - Type "14 mars 2012" ou "14-mars-2012" (avec l'année sur 4 chiffres 2012) -> Le mois est TOUJOURS écrit EN TOUTES LETTRES minuscules : "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre".
     - Le mois n'est abrégé ("janv.") QUE si l'année dans le type est sur 2 chiffres (ex: "14-mars-12" -> "15-janv.-15") ou s'il y a un point explicite.
     - Respecte scrupuleusement les séparateurs : tirets "-", espaces " ", ou slashes "/". En français, les mois s'écrivent en minuscules.

RÈGLE N°7 — PUZZLES DE DIAGRAMMES / SILHOUETTES DE LETTRES :
- Lorsque l'énoncé dit « Observez que les barres forment la lettre... Quelles lettres s'affichent ? » ou « Réalisez le diagramme avec les données à télécharger » :
  1. Lis la section [DÉTECTION DES LETTRES PAR HISTOGRAMME / DIAGRAMME EN BARRES] pré-calculée dans le tableur.
  2. Renvoie le mot de 4 lettres en MAJUSCULES (ex: <item>JULI</item>), en 1 seul <item>, sans espaces.

RÈGLE N°8 — MONTANT TOTAL DES VENTES / CHIFFRE D'AFFAIRES (SOMMEPROD) :
- NE CALCULE JAMAIS DE TÊTE ET N'ESTIME JAMAIS UNE VALEUR ARRONDIE.
- Si c'est le total global de la feuille, lis la section [CALCUL DU MONTANT TOTAL DES VENTES / SOMMEPROD] ; si c'est filtré par catégorie/condition, utilise une <query> avec mode "sumproduct" ou "sum".

RÈGLE N°9 — ANNÉES ET DATES DE NAISSANCE DANS LES TABLEURS :
- Attention aux formats d'affichage Excel qui masquent l'année (ex: "4 janv."). Lis l'année à 4 chiffres dans [DATES & ANNÉES DE NAISSANCE DÉTECTÉES] ou entre parenthèses (ex: "1986-01-04 (4 janv.)"). Renvoie TOUJOURS l'année à 4 chiffres.

RÈGLE N°10 — QCM À CHOIX MULTIPLES (ANTI-SUR-SÉLECTION STRICTE) :
- Dans Pix, chaque mauvaise case cochée annule TOUS les points de la question (0/1).
- Ne coche QUE les faits incontestables et prouvés.
- NE COCHE JAMAIS de propositions punitives, catastrophistes ou spéculatives (bannissement de compte IA, arrêt forcé/crash de l'application sur question biaisée, sanctions pénales disproportionnées).

RÈGLE N°11 — QUESTIONS SUR L'IA, LES ALGORITHMES ET LE NUMÉRIQUE (CRCN / PIX) :
1. IA GÉNÉRATIVE & QUESTIONS ORIENTÉES / BIAISÉES : biais de complaisance (sycophancy) et biais de confirmation -> réponses orientées vers l'opinion de l'utilisateur et confirmation de croyances erronées. Jamais blocage ni plantage.
2. MACHINE LEARNING & BIAIS ALGORITHMIQUES : provient de l'absence/sous-représentation de certains profils dans les données d'entraînement.
3. OUVRIERS DU CLIC (MICRO-TRAVAILLEURS) : identification d'émotions sur photos, modération de contenus violents, transcription audio/vidéo, captchas. PAS création de prompts, ni dev mobile, ni montage vidéo.
4. CLASSIFICATION DES TECHNIQUES D'IA : TALN/NLP (chatbots, traduction, texte/parole) ; Vision par ordinateur (images médicales, détection d'obstacles/piétons, reconnaissance visuelle) ; Exploration de données (fraude financière, maintenance prédictive/capteurs, recommandation).
5. RECONSTITUTION D'ADRESSES E-MAIL : [identifiant] @ [fournisseur.extension].

FORMAT DE RÉPONSE STRICT :
<calcul>(optionnel, vérification interne courte)</calcul>
<query>{...}</query>            (uniquement si tableur + filtrage/tri/calcul, une par champ)
<answers>
<item>valeur finale 1</item>
</answers>
<explanation></explanation>`,

  CHAT_SYSTEM_INSTRUCTION: `Tu es un assistant IA moderne, clair, direct et utile pour une utilisation quotidienne sur le web.
- Réponds dans la langue de l'utilisateur (français par défaut).
- Sois concis, structuré et naturel : pas de formules creuses ni d'introductions inutiles.
- Utilise un Markdown propre (listes courtes, gras pour les points clés, blocs de code avec langage précisé \`\`\`js, \`\`\`python, etc.).
- Si un contexte de page web ou une sélection de texte est fourni, appuie-toi dessus fidèlement sans inventer d'informations absentes.
- N'utilise JAMAIS les balises XML <answers>, <item>, <calcul> ou <query> dans ce mode chat.`,

  normalizeEffort(effort) {
    const val = String(effort || this.DEFAULT_THINKING_LEVEL).toLowerCase().trim();
    return this.VALID_EFFORTS.includes(val) ? val : this.DEFAULT_THINKING_LEVEL;
  },

  /**
   * Construit thinkingConfig adapté à la génération du modèle (Gemini 3/3.5/4 -> thinkingLevel, Gemini 2.5 -> thinkingBudget)
   */
  buildThinkingConfig(model, effort) {
    const m = String(model || this.DEFAULT_MODEL).toLowerCase();
    const level = this.normalizeEffort(effort);

    // Modèles Gemini 3, 3.1, 3.5, 4+ : utiliser exclusivement thinkingLevel
    if (/gemini-(?:3|4)/i.test(m)) {
      return { thinkingLevel: level };
    }

    // Modèles Gemini 2.5 : mappage en thinkingBudget
    if (/gemini-2\.5/i.test(m)) {
      const budgets = {
        minimal: 0,
        low: 1024,
        medium: 4096,
        high: /pro/i.test(m) ? 8192 : 6144
      };
      return { thinkingBudget: budgets[level] };
    }

    // Autres modèles (2.0, 1.5...) : ne pas envoyer thinkingConfig
    return null;
  },

  /**
   * Appel bas niveau SSE streaming vers Gemini API avec retry automatique si thinkingConfig n'est pas supporté par un modèle personnalisé
   */
  async _streamRequest({ apiKey, model, thinkingLevel, contents, systemInstructionText, temperature = 0.2, maxOutputTokens = 16384, onStreamChunk = null, signal = null }) {
    if (!apiKey) {
      throw new Error("Clé API Gemini manquante. Ouvre la configuration pour la renseigner.");
    }

    const selectedModel = model || this.DEFAULT_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:streamGenerateContent?alt=sse`;

    const doFetch = async (thinkingCfg) => {
      const generationConfig = {
        temperature,
        maxOutputTokens
      };
      if (thinkingCfg) {
        generationConfig.thinkingConfig = thinkingCfg;
      }

      const requestBody = {
        contents,
        systemInstruction: {
          parts: [{ text: systemInstructionText }]
        },
        generationConfig
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify(requestBody),
        signal
      });

      if (!response.ok) {
        const errText = await response.text();
        let message = `Erreur API Gemini (${response.status})`;
        try {
          const errObj = JSON.parse(errText);
          if (errObj.error && errObj.error.message) {
            message = `Gemini: ${errObj.error.message}`;
          }
        } catch (_) {}
        const err = new Error(message);
        err.status = response.status;
        err.rawError = errText;
        throw err;
      }

      return response;
    };

    const initialThinking = this.buildThinkingConfig(selectedModel, thinkingLevel);
    let response;
    try {
      response = await doFetch(initialThinking);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      const isThinkingRejection = err.status === 400 && /thinking|budget|level/i.test(`${err.message} ${err.rawError || ''}`);
      if (isThinkingRejection && initialThinking) {
        console.warn('[PixPilot] thinkingConfig non supporté par ce modèle, nouvelle tentative adaptée:', err.message);
        const fallbackCfg = initialThinking.thinkingLevel === 'minimal' ? { thinkingLevel: 'low' } : null;
        try {
          response = await doFetch(fallbackCfg);
        } catch (err2) {
          if (err2.name === 'AbortError') throw err2;
          if (fallbackCfg) {
            response = await doFetch(null);
          } else {
            throw err2;
          }
        }
      } else {
        throw err;
      }
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullRawText = '';
    let buffer = '';

    const processSseLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) return;
      const jsonStr = trimmed.slice(6);
      if (jsonStr === '[DONE]') return;
      try {
        const data = JSON.parse(jsonStr);
        const chunkParts = data.candidates?.[0]?.content?.parts || [];
        const chunk = chunkParts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
        if (chunk) {
          fullRawText += chunk;
          if (onStreamChunk) {
            onStreamChunk(fullRawText, chunk);
          }
        }
      } catch (e) {
        console.warn('[PixPilot] SSE JSON parse warning:', e);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          processSseLine(line);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        for (const line of buffer.split('\n')) {
          processSseLine(line);
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        try { await reader.cancel(); } catch (_) {}
        throw err;
      }
      throw err;
    }

    return fullRawText;
  },

  /**
   * Mode Pix : envoie une requête structurée à Gemini API
   */
  async generateAnswer({ apiKey, model, thinkingLevel, userPrompt, files = [], images = [], onStreamChunk = null, signal = null }) {
    const parts = [];

    for (const f of files) {
      if (f.geminiPart) parts.push(f.geminiPart);
    }

    for (const img of images) {
      if (img.inlineData) {
        parts.push({ inlineData: img.inlineData });
      }
    }

    parts.push({ text: userPrompt });

    try {
      const fullRawText = await this._streamRequest({
        apiKey,
        model,
        thinkingLevel: thinkingLevel || this.DEFAULT_THINKING_LEVEL,
        contents: [{ role: 'user', parts }],
        systemInstructionText: this.SYSTEM_INSTRUCTION,
        temperature: 0.0,
        maxOutputTokens: 16384,
        onStreamChunk,
        signal
      });
      return this.parseGeminiResponse(fullRawText);
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Erreur appel Gemini (Pix):', err);
      }
      throw err;
    }
  },

  /**
   * Mode Chat libre : conversation multi-tours avec streaming en temps réel et contexte page optionnel
   */
  async streamChat({ apiKey, model, thinkingLevel, messages = [], pageContext = null, onStreamChunk = null, signal = null }) {
    const contents = messages
      .filter(m => m && (m.role === 'user' || m.role === 'model'))
      .slice(-20)
      .map((m, idx, arr) => {
        const parts = [];
        const isLastUser = idx === arr.length - 1 && m.role === 'user';

        if (isLastUser && pageContext) {
          let ctxBlock = `[CONTEXTE PAGE ACTIVE]\nTitre : ${pageContext.title || 'Sans titre'}\nURL : ${pageContext.url || ''}\n`;
          if (pageContext.selection) {
            ctxBlock += `\nTexte sélectionné par l'utilisateur :\n"""\n${pageContext.selection}\n"""\n`;
          }
          if (pageContext.text) {
            ctxBlock += `\nContenu principal de la page :\n"""\n${pageContext.text}\n"""\n`;
          }
          parts.push({ text: ctxBlock });
        }

        if (Array.isArray(m.files)) {
          for (const f of m.files) {
            if (f.geminiPart) parts.push(f.geminiPart);
          }
        }

        if (m.text) {
          parts.push({ text: m.text });
        } else if (parts.length === 0) {
          parts.push({ text: 'Analyse ce contenu.' });
        }

        return { role: m.role, parts };
      });

    try {
      return await this._streamRequest({
        apiKey,
        model,
        thinkingLevel: thinkingLevel || this.DEFAULT_THINKING_LEVEL,
        contents,
        systemInstructionText: this.CHAT_SYSTEM_INSTRUCTION,
        temperature: 0.5,
        maxOutputTokens: 16384,
        onStreamChunk,
        signal
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Erreur appel Gemini (Chat):', err);
      }
      throw err;
    }
  },

  /**
   * Nettoie une réponse unitaire extraite
   */
  cleanAnswerItem(str) {
    if (!str) return '';
    let s = str.trim();
    s = s.replace(/<\/?(item|answers|explanation|calcul|query)>/gi, '').trim();
    s = s.replace(/^\*\*(.+)\*\*$/, '$1').replace(/^`(.+)`$/, '$1').trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('«') && s.endsWith('»'))) {
      s = s.slice(1, -1).trim();
    }
    return s;
  },

  /**
   * Analyse et sépare la réponse brute en réponses détectées et explication (en masquant <calcul>)
   */
  parseGeminiResponse(rawText) {
    let answers = [];
    let explanation = '';

    const textWithoutCalcul = rawText
      .replace(/<calcul>[\s\S]*?<\/calcul>/gi, '')
      .replace(/<query>[\s\S]*?<\/query>/gi, '')
      .trim();

    // 1. Détection via <item>...</item>
    const itemMatches = textWithoutCalcul.matchAll(/<item>([\s\S]*?)<\/item>/gi);
    for (const m of itemMatches) {
      const val = this.cleanAnswerItem(m[1]);
      if (val) answers.push(val);
    }

    // 2. Si <answers> présent mais sans <item>
    if (answers.length === 0) {
      const answersMatch = textWithoutCalcul.match(/<answers>([\s\S]*?)(?:<\/answers>|<explanation>|$)/i);
      if (answersMatch) {
        answers = answersMatch[1]
          .split('\n')
          .map(l => this.cleanAnswerItem(l.replace(/^[-*•\d.)\]\s]+/, '')))
          .filter(Boolean);
      }
    }

    // Extraction de <explanation>
    const explanationMatch = textWithoutCalcul.match(/<explanation>([\s\S]*?)(?:<\/explanation>|$)/i);
    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    } else if (!textWithoutCalcul.includes('<answers>')) {
      explanation = '';
    } else {
      explanation = textWithoutCalcul
        .replace(/<answers>[\s\S]*?<\/answers>/gi, '')
        .replace(/<item>[\s\S]*?<\/item>/gi, '')
        .trim();
    }

    explanation = explanation
      .replace(/<\/?(explanation|answers|item|calcul)>/gi, '')
      .trim();

    // 3. Fallback si le modèle n'a pas utilisé les balises XML
    if (answers.length === 0) {
      const answerHeaderMatch = textWithoutCalcul.match(/(?:réponse|réponses|résultat|solution)\s*(?:attendue|directe|exacte)?\s*:\s*([\s\S]+?)(?=\n\n(?:explication|détails|justification|note)|$)/i);
      if (answerHeaderMatch) {
        const potentialAnswers = answerHeaderMatch[1].trim();
        const lines = potentialAnswers
          .split('\n')
          .map(l => this.cleanAnswerItem(l.replace(/^[-*•\d.)\]\s]+/, '')))
          .filter(Boolean);
        answers = lines.length > 0 ? lines : [this.cleanAnswerItem(potentialAnswers)];
      } else {
        const nonEmptyLines = textWithoutCalcul
          .replace(/<\/?(explanation|answers|item|calcul)>/gi, '')
          .split('\n')
          .map(l => l.trim())
          .filter(Boolean);

        const bulletLines = nonEmptyLines.filter(l => /^[-*•]\s+/.test(l));
        if (bulletLines.length > 0) {
          answers = bulletLines.map(l => this.cleanAnswerItem(l.replace(/^[-*•]\s+/, ''))).filter(Boolean);
        } else if (nonEmptyLines[0] && nonEmptyLines[0].length < 180) {
          answers = [this.cleanAnswerItem(nonEmptyLines[0].replace(/^[*_`#]+|[*_`#]+$/g, ''))];
        }
      }
    }

    const queries = (typeof window !== 'undefined' && window.PixQueryEngine)
      ? window.PixQueryEngine.extractQueries(rawText)
      : [];

    return {
      rawText,
      answers,
      queries,
      isMultiple: answers.length > 1,
      explanation
    };
  }
};

if (typeof window !== 'undefined') {
  window.PixGemini = PixGemini;
}
