# PixPilot - Assistant IA Épuré pour Pix (Manifest V3)

**PixPilot** est une extension de navigateur moderne, minimaliste et sans néon conçue pour vous accompagner avec fluidité et précision lors de vos épreuves et certifications **Pix** (`pix.fr`).

---

## ✨ Fonctionnalités Clés

1. **Bouton Flottant & Interface Épurée (Anti-Néon)** :
   - Design moderne et sobre inspiré des standards d'Apple et Linear (tons graphite/ardoise neutres, bordures subtiles translucides, zéro lueur néon agressive).
   - Déclencheur discret et élégant disponible en bas à droite de l'écran ou via le raccourci `Alt + P`.

2. **Propulsé par Google Gemini** :
   - Prise en charge native de **Gemini 2.5 Flash** (recommandé), **Gemini 2.0 Flash Lite**, **Gemini 3.1 Flash Lite** ou tout modèle personnalisé de votre choix.
   - Température et instructions calibrées spécifiquement pour la logique des tests Pix.

3. **Analyse Multimodale Complète de Fichiers** :
   - 📸 **Images & Captures d'écran** : PNG, JPG, WEBP, GIF.
   - 📄 **Documents PDF** : Analyse native directe via l'API Gemini.
   - 📊 **Feuilles Excel & Données** : `.xlsx`, `.xls`, `.ods`, `.csv` (conversion intelligente en tableaux Markdown pour une compréhension parfaite des formules et cellules par l'IA).
   - 📝 **Documents Word** : `.docx` (extraction automatique du texte et des structures de paragraphes).
   - 💻 **Fichiers Code & Texte** : `.txt`, `.py`, `.sql`, `.json`, `.html`.

4. **Scanner Automatique de Question Pix** :
   - 1 clic sur « **Scanner la question** » extrait instantanément l'énoncé, le type de question (choix unique ou choix multiple), les propositions et même les images incluses dans l'exercice.

5. **Détection Intelligente & Copie Instantanée** :
   - **Réponse unique** : Mise en valeur immédiate dans un encart clair avec bouton **« Copier »** (animation avec retour visuel "Copié ! ✓").
   - **Réponses multiples** : Détection automatique des questions à cases multiples avec affichage de chaque proposition sous forme de carte individuelle copiable d'un clic, ainsi qu'un bouton **« Copier tout »**.

6. **Animation d'Écriture Épurée** :
   - Rendu de l'explication et du raisonnement caractère par caractère avec curseur fluide et mise en forme markdown soignée (gras, blocs de code, listes).

7. **🛡️ Bouclier Anti-Détection & Protection de la Vie Privée (Anti-Espion Pix)** :
   - **Destruction préventive des écouteurs de Pix** : Injecté dès le démarrage de la page (`document_start`) en contexte principal (`world: "MAIN"`) pour désamorcer les mouchards avant l'exécution du code de Pix.
   - **Changement d'onglet indétectable** : Interception et blocage des écouteurs `visibilitychange`, `pagehide`, `blur` et `focusout` sur la fenêtre. Forçage de `document.hidden = false`, `document.visibilityState = 'visible'` et `document.hasFocus() = true`.
   - **Sortie de souris indétectable** : Interception et suppression des écouteurs `mouseleave`, `pointerleave` et filtrage de `mouseout` lorsque le curseur sort de l'écran.
   - **Préservation des épreuves** : Les champs de saisie (`<input>`, `<textarea>`) conservent leur comportement normal pour que la validation des réponses fonctionne parfaitement.

---

## 🚀 Installation dans le Navigateur (Chrome, Brave, Edge, Opera)

1. Ouvrez votre navigateur et accédez à la page des extensions :
   - **Google Chrome / Brave** : `chrome://extensions/`
   - **Microsoft Edge** : `edge://extensions/`
2. Activez le **Mode développeur** (interrupteur en haut à droite).
3. Cliquez sur le bouton **« Charger le dossier non empaqueté »** (ou *Load unpacked*).
4. Sélectionnez le dossier du projet :
   ```
   C:\Users\zakri\OneDrive\Bureau\pix
   ```
5. L'extension **PixPilot** apparaît maintenant dans votre barre d'extensions !

---

## 🔑 Configuration de la Clé API Gemini

Votre clé API a déjà été pré-configurée par défaut dans l'extension (`content.js`, `background.js` et `popup.js`).

Si vous souhaitez la modifier ou changer de modèle :
1. Cliquez sur l'icône de l'extension dans votre navigateur ou sur l'engrenage dans le volet PixPilot sur Pix.
2. Choisissez le modèle désiré (ex: **Gemini 2.5 Flash**, **Gemini 3.1 Flash Lite**, etc.).
3. Cliquez sur **Enregistrer**.

---

## 🧪 Test Immédiat (Fichier Démo Inclus)

Vous pouvez tester l'assistant immédiatement sans aller sur Pix :
1. Double-cliquez sur le fichier `demo.html` situé dans ce dossier pour l'ouvrir dans votre navigateur.
2. Le bouton flottant **PixPilot** apparaîtra en bas à droite.
3. Cliquez dessus ou faites `Alt + P`.
4. Cliquez sur **« Scanner la question »** ou glissez un fichier Excel/Word/PDF pour tester l'analyse et l'animation d'écriture !

