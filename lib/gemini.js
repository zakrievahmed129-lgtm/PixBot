/**
 * PixPilot - Gemini Client
 * Gère les appels à l'API Google Gemini, la préparation multimodale
 * (Images, PDF, Excel, Word), et le parsing structuré des réponses.
 */

const PixGemini = {
  DEFAULT_MODEL: 'gemini-2.5-flash',

  SYSTEM_INSTRUCTION: `Tu es PixPilot, un assistant IA de niveau expert, ultra-précis et rigoureux pour les épreuves PIX.

RÈGLE N°1 — NOMBRE D'ITEMS :
- Le prompt indique le NOMBRE EXACT D'ITEMS ATTENDUS. Renvoie EXACTEMENT ce nombre de <item> (sauf QCM à choix multiples).
- Un <item> = la valeur FINALE à taper/choisir. JAMAIS une ligne de tableau, une étape, un calcul intermédiaire ou une justification.
- Exemple : "Quel mot apparaît dans la colonne Code ?" avec 1 champ "Mot" -> 1 seul <item> contenant le mot (ex: <item>cerise</item>), PAS la liste des lignes filtrées.

RÈGLE N°2 — TABLEURS (Excel, Calc, ODS, CSV, ZIP) : LE MOTEUR JS CALCULE, PAS TOI.
- Dès que la réponse exige de FILTRER, TRIER, COMPTER, SOMMER, MOYENNER, trouver un MIN/MAX ou CONCATÉNER des valeurs d'un tableau fourni, écris UNE requête <query>{JSON}</query> PAR champ à remplir, dans l'ordre des champs.
- Le moteur JavaScript exécute la requête sur les données réelles et remplace ta réponse par le résultat exact.
- Utilise les noms de colonnes EXACTS du [SCHÉMA DES COLONNES] (ou la lettre Excel). Les valeurs texte sont comparées sans tenir compte des majuscules/accents.
- Format :
  {"table":"NomFeuille","filters":[{"col":"Ville","op":"=","value":"Calais"},{"col":"Age","op":"=","value":20},{"col":"Note","op":">=","value":12}],"sort":[{"col":"Note","dir":"desc"}],"limit":null,"output":{"col":"Code","mode":"concat"}}
- op : = != > >= < <= contains not_contains starts ends in not_in between empty not_empty. Groupe OU : {"any":[{filtre},{filtre}]}.
- output.mode : concat (mot formé par les valeurs, dans l'ordre des lignes) | count | sum | avg | min | max | first | last | list | count_distinct. Options : "sep":"", "take":"first_char"|"last_char", "round":2.
- "Plus grand / plus petit / le premier après tri" => sort + limit 1 + mode first. "Combien de ..." => mode count.
- Respecte EXACTEMENT les critères de l'énoncé (« supérieure ou égale » => >=, « strictement supérieure » => >, « ayant 20 ans » => = 20).
- Si le tableau indique une formule exacte pré-calculée (=SOMME(B2:B4)), reprends-la telle quelle pour un champ "Formule".
- Fournis quand même <answers> avec ta meilleure estimation (même nombre d'items), le moteur la corrigera.
- Ne devine JAMAIS une valeur.

RÈGLE N°3 — CHAMPS MULTIPLES : un <item> par champ, dans l'ordre EXACT des champs de la page (ex: "Nombre total" puis "Formule saisie" -> <item>70115</item><item>=SOMME(B2:B4)</item>).

RÈGLE N°4 — QCM / BOUTONS / MENUS : <item> = texte EXACT de l'option tel qu'affiché (sans guillemets, puce ni numéro).

RÈGLE N°5 — CONCISION : aucune politesse, aucune répétition. <explanation> vide ou 1 courte phrase technique max.

RÈGLE N°6 — QUESTIONS SUR ILLUSTRATION / FORMAT DE CELLULE EXCEL :
- Lorsqu'une capture montre une boîte de dialogue Excel « Format de cellule » et demande ce que va afficher la cellule (ex: cellule A1) :
  1. Le champ « Exemple » en haut à droite de la boîte de dialogue donne directement la valeur finale affichée par la cellule !
  2. RÈGLES CRUCIALES DES FORMATS DATE EN FRANÇAIS :
     - Type "14 mars 2012" ou "14-mars-2012" (avec l'année sur 4 chiffres 2012) -> Le mois est TOUJOURS écrit EN TOUTES LETTRES minuscules : "janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre".
       Exemple : A1="15/01/2015" avec le type "14-mars-2012" donne EXACTEMENT : 15-janvier-2015 (et JAMAIS "15-janv-2015" ni "15-janv.-2015").
       Exemple : A1="15/01/2015" avec le type "14 mars 2012" donne EXACTEMENT : 15 janvier 2015.
     - Le mois n'est abrégé ("janv.") QUE si l'année dans le type est sur 2 chiffres (ex: "14-mars-12" -> "15-janv.-15") ou s'il y a un point explicite.
     - Respecte scrupuleusement les séparateurs : tirets "-", espaces " ", ou slashes "/".
     - En français, les mois s'écrivent obligatoirement en minuscules ("janvier", jamais "Janvier").

RÈGLE N°7 — PUZZLES DE DIAGRAMMES / SILHOUETTES DE LETTRES :
- Lorsque l'énoncé dit « Observez que les barres forment la lettre... Quelles lettres s'affichent ? » ou « Réalisez le diagramme avec les données à télécharger » :
  1. Chaque ligne de données (Printemps, Été, Automne, Hiver...) correspond à un groupe de barres verticales dont la silhouette dessine une lettre de l'alphabet (ex: J, U, L, I...).
  2. Lis la section [DÉTECTION DES LETTRES PAR HISTOGRAMME / DIAGRAMME EN BARRES] pré-calculée dans le tableur : elle donne le mot complet.
  3. Renvoie le mot de 4 lettres en MAJUSCULES (ex: <item>JULI</item>), en 1 seul <item>, sans espaces.

RÈGLE N°8 — MONTANT TOTAL DES VENTES / CHIFFRE D'AFFAIRES (SOMMEPROD) :
- Lorsque l'énoncé demande de calculer le « montant total des ventes » (quantité vendue × prix unitaire) ou le « chiffre d'affaires » :
  1. NE CALCULE JAMAIS DE TÊTE ET N'ESTIME JAMAIS UNE VALEUR ARRONDIE (ex: 250000.00 est strictement interdit).
  2. Lis directement le résultat exact dans la section [CALCUL DU MONTANT TOTAL DES VENTES / SOMMEPROD] pré-calculée dans le fichier tableur (ex: <item>231910</item>).
  3. Si une formule est demandée pour calculer le total se mettant à jour automatiquement, renvoie la formule exacte indiquée (ex: <item>=SOMMEPROD(B2:B78; C2:C78)</item>).

RÈGLE N°9 — ANNÉES ET DATES DE NAISSANCE DANS LES TABLEURS :
- Lorsque l'énoncé demande l'année de naissance d'une personne (ex: "Quelle est l'année de naissance d'Amadou ?") :
  1. Attention aux formats d'affichage Excel qui masquent l'année (ex: "4 janv." dans la cellule). L'année réelle à 4 chiffres est extraite dans la section [DATES & ANNÉES DE NAISSANCE DÉTECTÉES] ou entre parenthèses dans la table de données (ex: "1986-01-04 (4 janv.)").
  2. Renvoie TOUJOURS l'année exacte à 4 chiffres (ex: <item>1986</item>).
  3. Ne dis JAMAIS que l'année n'est pas spécifiée et ne renvoie JAMAIS 0.

RÈGLE N°10 — QCM À CHOIX MULTIPLES (ANTI-SUR-SÉLECTION STRICTE) :
- Dans Pix, chaque mauvaise case cochée annule TOUS les points de la question (0/1).
- Ne coche JAMAIS plus de 2 ou 3 réponses au total (sauf si la consigne demande explicitement plus).
- NE COCHE JAMAIS de propositions punitives, catastrophistes ou spéculatives :
  * Bannissement d'utilisateur ("l'utilisateur ne pourra plus utiliser cette IA") -> TOUJOURS FAUX dans Pix.
  * Blocage d'application ou arrêt forcé ("un message d'erreur pourrait apparaitre et mettre fin à la conversation") -> TOUJOURS FAUX.
  * Sanctions pénales ou judiciaires disproportionnées -> TOUJOURS FAUX.
- Ne coche QUE les faits incontestables et prouvés.

RÈGLE N°11 — QUESTIONS SUR L'IA, LES ALGORITHMES ET LE NUMÉRIQUE (CRCN / PIX) :
1. IA GÉNÉRATIVE & QUESTIONS ORIENTÉES / BIAISÉES (ex: questions avec stéréotypes, théories fausses ou croyances erronées) :
   - Conséquences réelles : l'IA souffre d'un biais de complaisance (sycophancy) et d'un biais de confirmation.
   - Les réponses valides sont : "Les réponses de l'IA pourraient être orientées vers des opinions compatibles avec celles de l'utilisateur" et "L'IA pourrait confirmer des croyances erronées présentes dans les questions au lieu de les corriger".
   - L'IA ne bloque JAMAIS le compte et ne plante JAMAIS.
2. MACHINE LEARNING & BIAIS ALGORITHMIQUES (ex: admissions, recrutement, crédit bancaire) :
   - L'origine d'un biais discriminatoire (selon le sexe, l'âge, la ville...) provient TOUJOURS de : "l'absence de certains profils dans les données d'entraînement" (sous-représentation ou échantillon d'apprentissage non représentatif).
   - Cela ne s'explique JAMAIS par "des préjugés des anciens recruteurs" ni par des intentions malveillantes des programmeurs.
3. LES « OUVRIERS DU CLIC » (MICRO-TRAVAILLEURS / CLICKWORKERS) :
   - TÂCHES RÉELLES (à cocher) : "l'identification d'émotions sur des photos de visage" (annotation d'images), "la modération de contenus violents sur les réseaux sociaux", "la transcription de documents audio et vidéo", résolution de captchas.
   - TÂCHES NON ASSURÉES (ne jamais cocher) : "la création de requêtes pour l'IA générative" (ce n'est pas du micro-travail), "le développement d'applications mobiles", "le montage de vidéos".
4. CLASSIFICATION DES TECHNIQUES D'IA :
   - "traitement automatique de la langue naturelle" (TALN / NLP) : agents conversationnels (chatbots), traduction automatique bilingue, analyse de texte/parole.
   - "vision par ordinateur" (Computer Vision) : traitement et analyse d'images médicales (radiographies, prévention cardiovasculaire), détection de piétons/obstacles par voitures autonomes, reconnaissance visuelle d'objets.
   - "exploration de données" (Data Mining / apprentissage tabulaire) : détection de fraudes financières/bancaires pour assureurs, maintenance prédictive dans les usines (analyse de capteurs/séries temporelles), moteurs de recommandation.
5. RECONSTITUTION D'ADRESSES E-MAIL :
   - Structure : [identifiant/nom_utilisateur] puis [@] puis [fournisseur.extension] (ex: laposte.net, julie380 et @ -> julie380 @ laposte.net).

FORMAT DE RÉPONSE STRICT :
<calcul>(optionnel, brouillon interne court)</calcul>
<query>{...}</query>            (uniquement si tableur + filtrage/tri/calcul, une par champ)
<answers>
<item>valeur finale 1</item>
</answers>
<explanation></explanation>`,

  /**
   * Envoie une requête à Gemini API
   */
  async generateAnswer({ apiKey, model, userPrompt, files = [], images = [], onStreamChunk = null }) {
    if (!apiKey) {
      throw new Error("Clé API Gemini manquante. Ouvre la configuration pour la renseigner.");
    }

    const selectedModel = model || this.DEFAULT_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:streamGenerateContent?key=${apiKey}&alt=sse`;

    const parts = [];

    for (const f of files) {
      if (f.geminiPart) {
        parts.push(f.geminiPart);
      }
    }

    for (const img of images) {
      if (img.inlineData) {
        parts.push({
          inlineData: img.inlineData
        });
      }
    }

    parts.push({
      text: userPrompt
    });

    const generationConfig = {
      temperature: 0.0,
      maxOutputTokens: 16384
    };
    // gemini-2.5 : la "réflexion" consomme le budget de sortie -> budget dédié pour éviter les réponses tronquées
    if (/2\.5/.test(selectedModel)) {
      generationConfig.thinkingConfig = { thinkingBudget: /pro/.test(selectedModel) ? 8192 : 6144 };
    }

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: parts
        }
      ],
      systemInstruction: {
        parts: [
          {
            text: this.SYSTEM_INSTRUCTION
          }
        ]
      },
      generationConfig
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
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
        throw new Error(message);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullRawText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
              const data = JSON.parse(jsonStr);
              const chunkParts = data.candidates?.[0]?.content?.parts || [];
              const chunk = chunkParts.filter(p => !p.thought && typeof p.text === 'string').map(p => p.text).join('');
              if (chunk) {
                fullRawText += chunk;
                if (onStreamChunk) {
                  onStreamChunk(fullRawText);
                }
              }
            } catch (e) {}
          }
        }
      }

      return this.parseGeminiResponse(fullRawText);
    } catch (err) {
      console.error('Erreur appel Gemini:', err);
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

    // Retirer le bloc interne <calcul>...</calcul> et les requêtes <query> pour qu'ils ne polluent jamais l'affichage
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
