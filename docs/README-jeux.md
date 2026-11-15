# DJOUSSE TECH MD — Quiz, Loup-Garou, Mode nuit

Trois modules intégrés au bot multi-session. Aucune dépendance externe
(Node 18+ et Baileys, comme le reste du projet).

## Contenu

```
src/jeux/index.js            dispatcheur des jeux (hors Action ou Vérité)
src/jeux/commun/             ids, texte, stockage JSON, IA, verrou entre jeux
src/jeux/quiz/               quiz (IA + 170 questions de secours)
src/jeux/loupgarou/          loup-garou complet (6 rôles)
src/groupe/modenuit.js       fermeture / ouverture automatique du groupe
scripts/test-*.js            simulations hors ligne (aucun WhatsApp nécessaire)
```

## Intégration dans ce bot

- `src/handlers/handler.js` appelle `jeux.handleMessage(sock, m)` **après**
  Action ou Vérité et **avant** les protections et les commandes.
- `index.js` appelle `jeux.start(sock)` à chaque ouverture de connexion.
- Action ou Vérité n'est **pas** dans le dispatcheur : il reste branché
  directement dans le handler pour éviter un double traitement.
- Le registre `src/core/group-owner.js` garantit qu'**une seule session**
  traite chaque groupe. Les autres sessions ignorent totalement le groupe,
  y compris les commandes de jeu.
- Les messages privés du Loup-Garou ne sont traités que par la session qui a
  ouvert la partie : une autre session du bot les ignore.
- Le mode nuit utilise le socket de la session propriétaire du groupe. Après
  un `.claim <numéro>`, la minuterie bascule automatiquement sur la nouvelle
  session.
- `.claim` est refusé tant qu'une partie (Action ou Vérité, Quiz ou
  Loup-Garou) est en cours dans le groupe.

## Commandes

| Module | Commandes |
|---|---|
| Quiz | `.quiz [nombre] [catégorie]`, `.quizstop`, `.quizscore`, `.quizcat` |
| Loup-Garou | `.lg`, `.lg join`, `.lg leave`, `.lg go`, `.lg stop`, `.lg status`, `.lg roles`, `.vote N` ; en privé : `role` |
| Mode nuit (admins) | `.modenuit 22:00 06:00 [fuseau]`, `.modenuit off`, `.modenuit on`, `.modenuit` |

Le bot doit être **admin** des groupes pour le mode nuit et pour fermer le
groupe la nuit au Loup-Garou. Le réglage global doit être en mode **public**
(`.mode public`) : en mode `self`, seuls les messages du bot lui-même sont
traités, donc aucun membre ne peut lancer un jeu.

## Style des messages

Tous les messages des trois modules passent par `src/config/style.js`
(`renderOutgoingText`, cadres `╭┄┄『 』┄❍`, libellés `INFO`, `SUCCÈS`,
`ERREUR`, word-wrap mobile). Un texte déjà encadré n'est jamais ré-encadré.

## Variables `.env` (toutes facultatives)

```
PREFIX=.
ANTHROPIC_API_KEY=         # questions IA de meilleure qualité
TEXT_ENDPOINT=             # sinon Pollinations ({prompt} et {seed} dans l'URL)
GAMES_AI=on                # off = tout en local, sans IA
QUIZ_SOURCE=auto           # auto | local | ia
QUIZ_TIME_MS=25000  QUIZ_PAUSE_MS=3500  QUIZ_COUNT=10  QUIZ_MAX=30
QUIZ_POINTS=10  QUIZ_BONUS=5  QUIZ_ADMIN_ONLY=off
LG_MIN=5  LG_MAX=24  LG_LOBBY_MS=120000  LG_STEP_MS=45000
LG_DAY_MS=90000  LG_VOTE_MS=45000  LG_HUNTER_MS=30000
LG_REVEAL=on  LG_MUTE=on
NIGHT_TZ=Africa/Douala  NIGHT_TICK_MS=30000
```

L'IA des jeux réutilise la passerelle du bot (`src/lib/ai-text.js`) :
Anthropic → Gemini → Groq → OpenRouter → Pollinations, puis banque locale.

## Tester sans WhatsApp

```
node scripts/test-quiz.js
node scripts/test-loupgarou.js
node scripts/test-modenuit.js
node scripts/test-dispatch.js
node scripts/test-jeux-multisession.js
```

Les quatre premiers scripts vérifient la logique des modules. Le dernier
vérifie qu'une seule session traite le groupe et que les messages privés
d'une partie ouverte par une autre session sont ignorés.
