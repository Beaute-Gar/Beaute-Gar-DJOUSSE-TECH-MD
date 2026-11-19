# Patchs a appliquer dans le code du BOT (branche `mobile`)

Regle : tout est protege par `process.env.MOBILE === '1'`. Le bot PC reste
inchange. Applique-les dans ton depot, puis relance scripts\02-preparer-bot.ps1
(il re-copie le bot a chaque fois : ne modifie jamais www\nodejs a la main).

## P1 - Chemins (src/config/paths.js)
```js
import path from 'node:path';
// BOT_DATA_DIR est fourni par l'appli Android (dossier prive)
export const STORAGE_DIR = process.env.BOT_DATA_DIR || path.join(process.cwd(), 'storage');
```
Adapte au nom reel de tes exports. Verifie qu'aucun fichier n'ecrit en dur
dans `storage/` ou `auth_info_baileys` (le rapport de portage les liste).

## P2 - Brancher le jumelage (la ou makeWASocket est appele)
```js
const sock = makeWASocket({ /* ... */, printQRInTerminal: false });
globalThis.__DJOUSSE_MOBILE__?.attach(sock);   // a ajouter apres chaque creation de socket
```
A faire a CHAQUE creation de socket (reconnexions comprises).

## P3 - Ne pas demander le code ailleurs
Si le bot demande deja un code (variable d'environnement, saisie console,
appel depuis /api/pair), le desactiver quand MOBILE=1 :
`if (process.env.MOBILE !== '1') { /* ancien flux requestPairingCode */ }`

## P4 - Processus, verrou, supervision
- supervisor.js, PM2, ngrok, serveur Express/HTTP : `if (process.env.MOBILE === '1') return;`
- Remplacer `process.exit(...)` par un throw/return si possible (main.cjs
  neutralise process.exit, mais le comportement doit etre propre).
- bot.lock : supprime au demarrage par main.cjs.

## P5 - Chiffrement des sessions (src/core/authSafe.js)
Remplacer la cle venant du .env par :
`const KEY = process.env.MOBILE === '1' ? process.env.MOBILE_SECRET : process.env.<TA_CLE_ACTUELLE>;`
MOBILE_SECRET est genere au 1er lancement (aleatoire, dossier prive).

## P6 - Proprietaire (config.js)
En mobile, proprietaire = numero jumele :
`owner = process.env.MOBILE === '1' ? globalThis.__DJOUSSE_MOBILE__?.ownerNumber() : <valeur actuelle>`
Si config.js est lu avant la connexion, lire le proprietaire a la demande
(fonction) plutot qu'a l'import.

## P7 - Drapeau MOBILE
`export const MOBILE = process.env.MOBILE === '1';` dans config.js ; desactiver
quand MOBILE : adultGen.js, eval/exec/shutdown/restart/sessions, commandes ffmpeg.

## P8 - Imports des modules retires
Tout fichier restant qui importe canvas, sharp, ffmpeg-static, fluent-ffmpeg,
@distube/ytdl-core, ngrok, pm2 plante au demarrage. Le rapport (section
IMPORTS ORPHELINS) les liste : passer en import dynamique dans un try/catch,
ou retirer la commande concernee (config/mobile-profile.json).

## P9 - handler.js : 4 imports non resolus
../lib/sender, ../lib/group-cache, ../lib/dedupe, ../command-loader :
verifier s'ils sont dans un try/catch ; sinon creer les fichiers ou retirer
les appels. Un import statique absent plante tout le bot au demarrage.

## P10 - Compatibilite Node 18
Remplacer toSorted/toReversed/toSpliced par sort/reverse sur copie ;
import.meta.dirname par path.dirname(fileURLToPath(import.meta.url)) ;
Object.groupBy par reduce ; Promise.withResolvers par un helper.

## Clefs API
Aucune cle dans l'APK. Les appels IA (OpenRouter, Groq...) passent par un
endpoint proxy sur ton backend (Render/Vercel) protege par un jeton propre a
l'installation, avec limitation de debit.