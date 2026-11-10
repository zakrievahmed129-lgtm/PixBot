/**
 * PixPilot - Gemini Client
 * Gère les appels à l'API Google Gemini, la préparation multimodale
 * (Images, PDF, Excel, Word), et le parsing structuré des réponses.
 */

const PixGemini = {
  DEFAULT_MODEL: 'gemini-2.5-flash',

  SYSTEM_INSTRUCTION: `Tu es PixPilot, un assistant d'élite ultra-performant et rigoureux spécialisé dans la réussite des épreuves et certifications PIX (numérique, informatique, bureautique, web, données, cybersécurité, algorithmique).

MISSION & DIRECTIVES STRICTES :
1. ANALYSE IMMÉDIATE : Analyse avec minutie la question Pix fournie, ainsi que les documents joints éventuels (images, tableurs Excel, fichiers Word, documents PDF).
2. EXTRACTION DE LA RÉPONSE DIRECTE : Trouve la réponse EXACTE attendue par Pix (terme exact, nombre précis, formule, ou ensemble des cases à cocher).
3. FORMAT STRUCTURÉ OBLIGATOIRE :
Tu DOIS impérativement encadrer tes réponses avec les balises suivantes :

<answers>
<item>Première réponse exacte ou case exacte à cocher</item>
<item>Deuxième réponse exacte (si la question a plusieurs réponses correctes)</item>
</answers>

<explanation>
Explication limpide, concise et méthodique (2 à 5 lignes max) de la démarche ou du calcul pour comprendre la réponse.
</explanation>

RÈGLES CRUCIALES :
- S'il y a une seule réponse, mets un seul <item> dans <answers>.
- S'il y a PLUSIEURS réponses (ex: QCM à choix multiples, plusieurs cases à cocher), mets chaque option exacte dans un <item> séparé.
- Sois direct : pas de blabla d'introduction inutile type "Bonjour ! Voici la réponse".
- Dans <answers>, ne mets QUE la valeur ou le libellé exact à copier/sélectionner, sans puces ni préfixes.`,

  /**
   * Envoie une requête à Gemini API
   * @param {Object} params
   * @param {string} params.apiKey - Clé d'API Google AI Studio
   * @param {string} [params.model] - Nom du modèle (défaut gemini-2.5-flash)
   * @param {string} params.userPrompt - Question ou instruction de l'utilisateur
   * @param {Array} [params.files] - Fichiers traités (avec geminiPart)
   * @param {Array} [params.images] - Images extraites du DOM
   * @param {Function} [params.onStreamChunk] - Callback pour le streaming en direct
   */
  async generateAnswer({ apiKey, model, userPrompt, files = [], images = [], onStreamChunk = null }) {
    if (!apiKey) {
      throw new Error("Clé API Gemini manquante. Clique sur l'icône d'engrenage pour la renseigner.");
    }

    const selectedModel = model || this.DEFAULT_MODEL;
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(selectedModel)}:streamGenerateContent?key=${apiKey}&alt=sse`;

    // Assemblage des parties de contenu (multimodal)
    const parts = [];

    // 1. Pièces jointes (images & pdf en inlineData, ou texte de tableurs / docx)
    for (const f of files) {
      if (f.geminiPart) {
        parts.push(f.geminiPart);
      }
    }

    // 2. Images détectées dans le DOM de Pix
    for (const img of images) {
      if (img.inlineData) {
        parts.push({
          inlineData: img.inlineData
        });
      }
    }

    // 3. Prompt textuel principal
    parts.push({
      text: userPrompt
    });

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
      generationConfig: {
        temperature: 0.1, // Température basse pour une précision maximale sur les quiz
        maxOutputTokens: 2048
      }
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

      // Traitement SSE du flux de données
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullRawText = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Conserve le fragment incomplet

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6);
            if (jsonStr === '[DONE]') continue;
            try {
              const data = JSON.parse(jsonStr);
              const chunk = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
              if (chunk) {
                fullRawText += chunk;
                if (onStreamChunk) {
                  onStreamChunk(fullRawText);
                }
              }
            } catch (e) {
              // Ignore les éventuels chunks JSON partiels
            }
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
   * Analyse et sépare la réponse brute en réponses détectées (unitaires ou multiples) et explication
   */
  parseGeminiResponse(rawText) {
    let answers = [];
    let explanation = '';
    let isMultiple = false;

    // 1. Détection via balises <answers> et <item>
    const answersMatch = rawText.match(/<answers>([\s\S]*?)<\/answers>/i);
    if (answersMatch) {
      const inner = answersMatch[1];
      const itemMatches = inner.matchAll(/<item>([\s\S]*?)<\/item>/gi);
      for (const m of itemMatches) {
        const val = m[1].trim();
        if (val) answers.push(val);
      }

      // Si pas de balise <item> à l'intérieur, découper par lignes
      if (answers.length === 0) {
        answers = inner
          .split('\n')
          .map(l => l.replace(/^[-*•\d.)\]\s]+/, '').trim())
          .filter(Boolean);
      }
    }

    // Extraction de <explanation>
    const explanationMatch = rawText.match(/<explanation>([\s\S]*?)<\/explanation>/i);
    if (explanationMatch) {
      explanation = explanationMatch[1].trim();
    } else {
      // Si pas de balise explication fermante, retire les balises answers et garde le reste
      explanation = rawText.replace(/<answers>[\s\S]*?<\/answers>/gi, '').trim();
    }

    // Nettoyage strict de toute balise XML résiduelle pour un rendu terminal impeccable
    explanation = explanation
      .replace(/<\/?(explanation|answers|item)>/gi, '')
      .trim();

    // 2. Fallback si le modèle n'a pas utilisé les balises exactes
    if (answers.length === 0) {
      // Cherche des formulations courantes de réponse
      const answerHeaderMatch = rawText.match(/(?:réponse|réponses|résultat|solution)\s*(?:attendue|directe)?\s*:\s*([\s\S]+?)(?=\n\n(?:explication|détails|justification)|$)/i);
      if (answerHeaderMatch) {
        const potentialAnswers = answerHeaderMatch[1].trim();
        const lines = potentialAnswers.split('\n').map(l => l.replace(/^[-*•\d.)\]\s]+/, '').trim()).filter(Boolean);
        answers = lines.length > 0 ? lines : [potentialAnswers];
      } else {
        // En dernier recours, premier paragraphe ou première ligne non vide
        const firstLine = rawText.split('\n').map(l => l.trim()).filter(Boolean)[0];
        if (firstLine && firstLine.length < 150) {
          answers = [firstLine.replace(/^[*_`#]+|[*_`#]+$/g, '').trim()];
        }
      }
    }

    isMultiple = answers.length > 1;

    return {
      rawText,
      answers,
      isMultiple,
      explanation
    };
  }
};

// Export
if (typeof window !== 'undefined') {
  window.PixGemini = PixGemini;
}

