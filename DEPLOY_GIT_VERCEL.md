# Déployer / pousser ce dossier (GitHub + Vercel)

> **Important (sécurité)** : le dépôt local a été initialisé et un commit a été créé **sans** fichiers sensibles (`.env`, sessions, credentials sont ignorés par `.gitignore`). **Ne jamais committer** `.env`, tokens, clés ou sessions. Avant tout push vers un dépôt public/partagé, revérifiez `git status` et l’absence de secrets.

## 1) GitHub — supprimer l’ancien dépôt distant (action manuelle, non automatisable ici)
Je ne peux pas supprimer un dépôt GitHub à votre place (aucun accès/authentification GitHub configuré sur cette machine, `gh` absent). À faire depuis votre compte GitHub :
1. Ouvrir le dépôt à supprimer → **Settings** → tout en bas **Danger Zone** → **Delete this repository** (confirmer le nom).
2. (Optionnel) Créer un nouveau dépôt vide sur GitHub (sans README/licence/gitignore si vous poussez ce dossier).

Alternative en ligne de commande si vous installez et authentifiez GitHub CLI :
```powershell
winget install --id GitHub.cli
gh auth login
gh repo delete <OWNER>/<REPO> --yes
```

## 2) Pousser ce dossier vers GitHub
Un dépôt Git local est prêt (`main`/branche courante avec commit initial). Ajoutez le distant puis poussez :
```powershell
cd "C:\Users\Djousse Uriel\Desktop\DJOUSSE TECH MD"
git remote add origin https://github.com/<OWNER>/<REPO>.git
git branch -M main
git push -u origin main
```
Si le dépôt distant contient déjà un historique et que vous voulez le remplacer entièrement : `git push -u origin main --force` (destructif pour l’historique distant).

## 3) Redéployer sur Vercel
Le projet Vercel est déjà lié localement (`.vercel/project.json` → `djousse-tech-md`). Deux options :

- **Via GitHub (recommandé)** : dans Vercel, importer/connecter le dépôt GitHub poussé. Régler **Root Directory = `web`** (le site et les fonctions sont dans `web/`, config `web/vercel.json`). Renseigner les variables d’environnement (Production/Preview) : `PAIRING_API_URL` (URL HTTPS ngrok du serveur local, pour `/api/pair` et `/api/status`) et/ou `PUBLIC_API_URL` (appel direct du front), `PAIRING_API_TOKEN` (même valeur que côté machine locale), `SITE_ORIGIN`, `TURNSTILE_SECRET_KEY` si utilisé. **Serveur = machine locale (ngrok), pas Render.**
- **Via CLI Vercel** (depuis `web/` ou selon config) : authentification requise.
  ```powershell
  vercel login
  cd web
  vercel --prod
  ```
  (CLI détecté : v62.1.0, non authentifié sur cette session.)

Après déploiement, vérifier `/data/commands.json` (catalogue à jour) et `/api/status`, et remplacer les placeholders `https://[A_REMPLIR]` (domaine, CSP `connect-src` ngrok) comme indiqué dans `TODO_A_REMPLIR.md` / `RAPPORT_FINAL.md`.

## 4) ngrok (installé)
`ngrok` a été installé via winget (v3.3.1). Ouvrez un **nouveau terminal** pour que le PATH soit pris en compte, puis :
```powershell
ngrok config add-authtoken <VOTRE_TOKEN>   # ne pas commiter le token
ngrok start --config=ngrok.yml backend
.\deploy\check-tunnel.ps1 -PublicUrl https://<DOMAINE_NGROK>.ngrok-free.app
```
Renseigner `ngrok.yml` (domaine fixe, port), `backend/.env` (`ALLOWED_ORIGINS`, `PORT`), et l’URL API publique côté front/Vercel. Voir `deploy/README.md` et `RAPPORT_FINAL.md`.
