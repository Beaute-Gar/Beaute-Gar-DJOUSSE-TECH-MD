# Site web (Vercel) — `web/`

Site vitrine statique + fonctions Vercel (`web/api/*`) pour le jumelage WhatsApp.

## Architecture (serveur local)
- **Front (Vercel)** : pages statiques dans `web/public/`, fonctions `web/api/pair`, `web/api/status`, `web/api/config`.
- **Serveur/appairage** : tourne sur **votre machine locale** (backend `backend/`, écoute `127.0.0.1`) et est exposé en HTTPS via **ngrok** (`ngrok.yml`, scripts `deploy/`).
- Le navigateur peut appeler le backend **directement** (URL ngrok configurée via `PUBLIC_API_URL` / `web/public/js/config.js`, en-tête `ngrok-skip-browser-warning`) ou passer par les relais Vercel `/api/*` qui proxient vers `PAIRING_API_URL` (URL ngrok). Aucun secret dans le front.

## Déploiement Vercel
1. Importer/connecter le dépôt, **Root Directory = `web`** (config `web/vercel.json`).
2. Variables d’environnement (Production/Preview) — voir `web/.env.example` :
   - `PAIRING_API_URL` : URL HTTPS du backend local exposé (ex. `https://<domaine>.ngrok-free.app`), sans slash final (utilisée par `/api/pair` et `/api/status`).
   - `PAIRING_API_TOKEN` : jeton partagé avec le backend local.
   - `SITE_ORIGIN` : origine du site en production (recommandé).
   - `PUBLIC_API_URL` (ou `NEXT_PUBLIC_API_URL`/`VITE_API_URL`) : URL publique API pour le front (mode appel direct).
   - `TURNSTILE_SECRET_KEY` : optionnel (anti-spam).
3. Déployer puis vérifier `/data/commands.json` et `/api/status`. Mettre à jour les placeholders de domaine/CSP (`connect-src` ngrok) dans `web/vercel.json` et les pages.

## Développement & scripts
```bash
# depuis web/
npm test          # tests des fonctions api (mocks, sans réseau)
npm run check-links
npm run data      # régénère public/data/*.json depuis le registre bot
npm run icons     # régénère les icônes PWA
```

## Notes
- **CORS/sécurité** : origines contrôlées côté fonctions et côté backend local (`ALLOWED_ORIGINS`). Le backend doit écouter sur `127.0.0.1` (ngrok se connecte en local).
- Si le tunnel/machine est hors ligne, le front affiche un état indisponible (pas de casse globale du site).
- Ancienne cible Render retirée : le serveur est la machine locale (ngrok). Voir `AUDIT.md`, `RAPPORT_FINAL.md`, `TODO_A_REMPLIR.md` à la racine.
