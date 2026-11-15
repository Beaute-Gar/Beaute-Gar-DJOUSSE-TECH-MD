# web/ — site et fonctions Vercel de DJOUSSE-TECH-MD

```text
web/
├── public/        site statique (pages, css, js, assets, data)
├── api/           fonctions Vercel : /api/pair et /api/status (proxy vers le bot sur Render)
├── scripts/       outils locaux (non déployés)
├── vercel.json    configuration (dossier de sortie, en-têtes, durée des fonctions)
├── package.json   Node 22.x pour les fonctions
└── .env.example   variables à créer dans Vercel
```

## Mettre les données du site à jour

Le catalogue et les compteurs viennent du **registre réellement chargé par le bot**.
Après toute commande ajoutée, renommée ou supprimée :

```bash
node scripts/export-site-data.js          # écrit public/data/commands.json + site-data.json
node scripts/export-site-data.js --check  # rapport seul, aucun fichier modifié
node scripts/export-site-data.js --list   # ajoute les descriptions finales au rapport
```

Le script lit `src/commandes`, déduit le niveau d'accès (`public`, `admin`, `owner`),
rétablit les accents des descriptions et met à jour les compteurs de catégories.
Il ne modifie jamais le code du bot.

Autres outils (facultatifs, jamais déployés) :

```bash
node web/scripts/site-icons.js   # régénère les 5 icônes PWA depuis assets/logo.svg
node web/scripts/test-api.js     # teste /api/pair et /api/status hors réseau
```

## Réglages Vercel (une seule fois)

| Réglage (Project → Settings) | Valeur |
|---|---|
| General → **Root Directory** | `web` |
| Build & Development → Framework Preset | **Other** |
| Build Command / Install Command | vides (déjà forcés par `vercel.json`) |
| Output Directory | `public` (déjà forcé par `vercel.json`) |
| General → Node.js Version | `22.x` |
| Environment Variables | voir `.env.example` : `PAIRING_API_URL`, `PAIRING_API_TOKEN` |

Puis **Deployments → Redeploy** (les variables ne s'appliquent qu'aux nouveaux déploiements).

## Fonctionnement

1. Le visiteur saisit son numéro sur `connexion.html`.
2. Le navigateur appelle `/api/pair` (même domaine, pas de CORS).
3. La fonction vérifie l'origine, valide le numéro, limite à 5 demandes / 10 min / IP,
   puis appelle `POST {PAIRING_API_URL}/pair` avec l'en-tête `x-api-token`.
4. Le bot (Render) demande le code à WhatsApp ; il revient au navigateur (8 caractères, valable environ 60 s).
5. Si le bot a déjà une session, il répond 409 : « session déjà enregistrée ».

Le jeton `PAIRING_API_TOKEN` n'existe que côté serveur (Vercel et Render) : il n'est jamais envoyé au navigateur.

`/api/status` ne relaie que l'état : `connected`, `connection`, `sessions`, `active`.
Aucun identifiant de session ni numéro de téléphone n'est exposé (ce proxy est public).
`/api/pair` n'accepte que l'origine du site : une origine inconnue reçoit `403`.

## Tests après déploiement

- `https://<site>.vercel.app/` charge le site ;
- `https://<site>.vercel.app/data/commands.json` → le nombre de commandes doit être
  égal à `registry` et aux compteurs de `site-data.json` ;
- `https://<site>.vercel.app/api/status` → `{"ok":true,"connected":...}` (503 = Render injoignable ou variables manquantes) ;
- `https://<service>.onrender.com/status` → `{"ok":true,...}` ;
- sur `/connexion.html`, un numéro valide affiche un code de 8 caractères (si le bot n'est pas encore jumelé).

### Si `/api/status` répond 503

1. Ouvrir directement `https://<service>.onrender.com/status` : si cette URL répond aussi 503,
   le problème vient du service Render (endormi, planté ou supprimé), pas de Vercel ;
2. Vérifier dans Vercel → Settings → Environment Variables que `PAIRING_API_URL`
   (sans slash final) et `PAIRING_API_TOKEN` existent pour **Production** et **Preview** ;
3. Après toute modification de variable : **Deployments → Redeploy** ;
4. Le jeton doit être identique côté Render ; un jeton différent renvoie `401`.
