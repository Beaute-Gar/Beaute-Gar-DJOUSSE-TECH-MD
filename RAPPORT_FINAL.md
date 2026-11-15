# Rapport final — infrastructure (front Vercel + backend local + tunnel ngrok)

_Date : 2026-11-15 · Environnement : Windows 10/11 (build 26300), PowerShell 5.1, utilisateur `djousse-uriel\djousse uriel` (session **non administrateur**), Node v24.21.0/npm 11.19.0._

## 1. Objectif et périmètre
Mise en place de l’architecture : **front sur Vercel** → **backend/API local** (127.0.0.1) exposé en HTTPS via **tunnel ngrok** → appels front vers l’URL ngrok ; durcissement machine (API, SSH, pare-feu, équivalent fail2ban) adapté à Windows, avec scripts prêts à l’emploi et documentation.

## 2. Fait

### 2.1 Audit et documentation
- `AUDIT.md` (infra) : OS/services/ports/outils, front Vercel (`web/`), absence de backend HTTP dans le dépôt (bot Baileys worker uniquement), OpenSSH/ngrok/PM2 absents, pare-feu actif (profils), pas de Git, privilèges insuffisants, blocages/constats.
- `TODO_A_REMPLIR.md` (fusion web + infra) : placeholders `[A_REMPLIR]` (domaine(s), port backend, domaine ngrok, port/utilisateur/clé/IP SSH, e-mail alertes, identité/contact/RPRP), validation juridique, secrets/déploiement Vercel, actions admin, backend métier/auth, sauvegardes, Lighthouse, Git/CI.
- `deploy/README.md` : ordre d’exécution, règles anti-verrouillage, inventaire des scripts.
- `RAPPORT_FINAL.md` : présent document.

### 2.2 Backend local (squelette production-grade) — `backend/`
- `backend/package.json`, `backend/.env.example`, `backend/src/server.js`, `backend/src/security.js`, `backend/scripts/verify-setup.js`.
- Écoute **`127.0.0.1`** par défaut (`HOST`/`PORT`, défaut 3001) — non exposé directement.
- **CORS strict** : origines explicitement autorisées via `ALLOWED_ORIGINS` (jamais `*`), méthodes/en-têtes autorisés incluant `ngrok-skip-browser-warning` et `Authorization`, `credentials` géré ; rejet des origines non autorisées.
- **Sécurité** : `helmet`, limite corps requête (`100kb`), validation stricte (zod) sur routes d’exemple, rate limiting global + renforcé sur `/auth/login|register|reset`, gestion d’erreurs sans fuite de détails en production, journalisation structurée (pino) avec redaction, en-têtes de proxy (`trust proxy`).
- **Routes** : `GET /health` publique minimale (sans info sensible) ; squelettes `/auth/*` (501 tant que non câblés) ; exemples protégés `/api/me` (401), `/api/admin` (403) ; `GET /_traffic` local-only (127.0.0.1) pour suivi de volume.
- **Compteur de volume** : comptabilisation approximative entrées/sorties par requête + cumul exposé localement (`/_traffic`) pour aider au suivi du quota ngrok gratuit (~1 Go/mois sortant) et journalisé.
- **Helpers sécurité** (`security.js`) : hachage/vérification mots de passe `bcryptjs` (coût 12), comparaison temps constant, helpers JWT access/refresh, options cookie `HttpOnly/Secure/SameSite` configurables (cross-site ngrok prévu).
- **À compléter (métier)** : persistance utilisateurs/sessions/tokens (BDD), implémentation JWT+refresh/rotation/révocation, rôles/permissions effectifs, clés API hachées, CSRF si cookies, Turnstile côté serveur sur formulaires publics/login, routes métier (ex. pair/status) et câblage au service réel. Le squelette fournit la base conforme à câbler.

### 2.3 Front (Vercel) — adaptation ngrok/API
- `web/public/js/config.js` : `window.DJS_API_BASE` (URL HTTPS de l’API, vide = mode same-origin `/api/*` Vercel/proxy), timeouts/retries configurables.
- `web/public/js/api.js` (client unique) : cible `DJS_API_BASE` ou same-origin, **ajoute `ngrok-skip-browser-warning: 1`** sur chaque appel, refuse les URL `http` non locales, `credentials: include` en cross-origin, **résilience** (timeout, nouvelles tentatives avec backoff sur erreurs réseau/5xx), messages clairs « Service momentanément indisponible… (tunnel peut être hors ligne) », compatibilité avec le flux de jumelage existant.
- `web/public/js/connexion.js` : utilise le client, états chargement/erreur/succès, validation/consentement/honeypot côté client.
- `web/api/config.js` (Vercel) : expose `apiBase` depuis `PUBLIC_API_URL` / `NEXT_PUBLIC_API_URL` / `VITE_API_URL` (aucun secret).
- `web/.env.example` : ajout `PUBLIC_API_URL`, `SITE_ORIGIN`, `TURNSTILE_SECRET_KEY`.
- `web/vercel.json` : CSP mise à jour (`connect-src 'self' https://[A_REMPLIR].ngrok-free.app` — **à remplacer** par le domaine ngrok réel) ; en-têtes sécurité/HSTS conservés.
- Inclusion de `config.js` ajoutée aux pages HTML publiques/légales.

### 2.4 Tunnel ngrok
- `ngrok.yml` : tunnel `backend` → `127.0.0.1:3001`, domaine fixe `[A_REMPLIR].ngrok-free.app`, `inspect: false`, auth via `NGROK_AUTHTOKEN` (env/config hors dépôt).
- `deploy/setup-ngrok.ps1` : vérifications, rappel `ngrok config add-authtoken` (jamais commité), création tâche planifiée (logon/startup, redémarrage) ; instructions si ngrok absent.
- `deploy/check-tunnel.ps1`, `scripts/check-tunnel.ps1`, `scripts/check-tunnel.js` : test HTTPS public `/health` avec en-tête `ngrok-skip-browser-warning`.
- Contraintes plan gratuit (à documenter/surveiller) : ~1 Go trafic sortant/mois, page d’avertissement contournée par `ngrok-skip-browser-warning`, domaine fixe unique, limites de session à vérifier dans le **dashboard ngrok** (non vérifiables ici) et à consigner.

### 2.5 Durcissement machine (Windows) — scripts `deploy/` (exécution admin requise)
- **SSH** — `deploy/setup-ssh.ps1` : installe OpenSSH Server si besoin, sauvegarde `.bak.<horodatage>`, installe la clé publique + permissions (`.ssh`/`authorized_keys`), configuration durcie (port personnalisé, `PermitRootLogin no`, `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `PubkeyAuthentication yes`, `PermitEmptyPasswords no`, `AllowUsers`, `MaxAuthTries 3`, `LoginGraceTime 30`, sessions/keepalive, X11/agent/tcp forwarding désactivés, `PermitTunnel no`, algorithmes modernes Ed25519/prioritaires, bannière), validation `sshd -t`, ouverture du **nouveau port** au pare-feu avant rechargement, **conservation du port 22 pendant la phase de test**, **rollback automatique planifié (5 min, tâche planifiée)** annulable après validation, instructions de test/fermeture de l’ancien port et rollback manuel. 2FA (libpam-google-authenticator) non applicable nativement Windows → option documentée (non activée). SSH **non exposé** via ngrok/box.
- **Pare-feu** — `deploy/setup-firewall.ps1` : export/sauvegarde `.wfw`, profils activés, option refus entrant par défaut + sortie autorisée, règle SSH personnalisée (port/IP restreinte), rappel backend non exposé (127.0.0.1).
- **Équivalent fail2ban** — `deploy/setup-fail2ban.ps1`, `deploy/ban-4625.ps1` : stratégie de verrouillage de compte (`net accounts`), tâche planifiée de bannissement Pare-feu sur **Event ID 4625** (seuil/fenêtre/durée), ignore IP configurable ; `deploy/check-bans.ps1` & `scripts/check-bans.ps1` (liste/déban). Jail API (abus/429/logs applicatifs) et récidive/alertes e-mail : points d’extension documentés (à compléter selon logs backend et messagerie).
- **Services/persistance** — `deploy/setup-services.ps1` (tâche backend Node, redémarrage), `deploy/setup-ngrok.ps1` (tâche tunnel). Utilisateurs dédiés sans privilèges, permissions minimales, veille/hibernation à désactiver, Windows Update/mises à jour auto : consignés dans procédures (application admin).
- **Vérification** — `deploy/verify-setup.ps1`, `scripts/verify-setup.ps1`, `backend/scripts/verify-setup.js` : santé locale/publique, écoute 127.0.0.1, CORS basique, route protégée 401/403, scan simple de motifs de secrets, état sshd.

### 2.6 Fichiers/scripts livrés (principaux)
- Docs : `AUDIT.md`, `TODO_A_REMPLIR.md`, `RAPPORT_FINAL.md`, `deploy/README.md`.
- Backend : `backend/.env.example`, `backend/package.json`, `backend/src/server.js`, `backend/src/security.js`, `backend/scripts/verify-setup.js`.
- Front : `web/public/js/config.js`, `web/public/js/api.js` (modifié), `web/api/config.js`, `web/.env.example`, `web/vercel.json` (CSP connect-src à ajuster).
- Tunnel/ops : `ngrok.yml`, `deploy/*.ps1`, `scripts/check-tunnel.js`, `scripts/check-tunnel.ps1`, `scripts/check-bans.ps1`, `scripts/verify-setup.js`, `scripts/verify-setup.ps1`.

## 3. Ce qui reste à faire / blocages
- **Pas de dépôt Git** : branche `infra-hardening` et commits atomiques impossibles ; initialiser Git, créer la branche, commiter par thème (sans secrets) puis activer CI.
- **Privilèges** : aucune modification système appliquée (OpenSSH, pare-feu, politiques, tâches) — exécuter les scripts `deploy/` en administrateur après renseignement des placeholders.
- **Placeholders `[A_REMPLIR]`** : domaine(s) Vercel/perso, port backend, domaine ngrok, port/utilisateur/clé/IP SSH, e-mail alertes, identité/contact/RPRP/domaine de prod web, secrets applicatifs.
- **Backend métier** : implémenter auth complète (JWT access+refresh HttpOnly/Secure/SameSite, rotation/révocation, verrouillage échecs), rôles, persistance/BDD, clés API hachées, CSRF si requis, Turnstile serveur, routes fonctionnelles (pair/status ou équivalents), logs d’abus/429 dédiés, rotation logs.
- **Câblage production** : renseigner `ALLOWED_ORIGINS`, `PUBLIC_API_URL`/`DJS_API_BASE`, CSP `connect-src` avec le domaine ngrok réel, domaines Vercel/perso ; redéployer le front ; configurer variables Vercel/secrets.
- **ngrok** : installer, `add-authtoken` (hors dépôt), valider domaine fixe, démarrer service, vérifier limites session/trafic dashboard.
- **SSH** : installer/configurer via `setup-ssh.ps1` en suivant strictement la procédure anti-verrouillage ; ne pas exposer à Internet (LAN ou Tailscale/WireGuard).
- **Durcissement avancé** : Lynis/équivalent (avant/après) non exécuté (outil/OS), sysctl inapplicable Windows, auditd/logrotate → équivalents Windows à compléter, sauvegardes chiffrées + test de restauration, supervision/alertes (webhook/email) à brancher.
- **Tests** : tests automatisés complets auth/rôles/CSRF/upload non implémentés (dépendent du backend métier) ; Lighthouse non mesuré ; vérifier CORS/rate-limit en conditions réelles.

## 4. Commandes de test / vérification
```powershell
# Web (depuis la racine du dépôt)
node web\scripts\test-api.js
node web\scripts\check-links.js

# Backend (après npm install dans backend\ et configuration .env)
cd backend; npm install; node src\server.js
# dans un autre terminal :
node backend\scripts\verify-setup.js --url=http://127.0.0.1:3001 --origin=https://<DOMAINE_VERCEL>
Invoke-WebRequest -Uri http://127.0.0.1:3001/health -UseBasicParsing
Invoke-WebRequest -Uri http://127.0.0.1:3001/_traffic -UseBasicParsing   # local uniquement

# Tunnel (après démarrage ngrok et backend)
.\deploy\check-tunnel.ps1 -PublicUrl https://<DOMAINE_NGROK>.ngrok-free.app
node .\scripts\check-tunnel.js https://<DOMAINE_NGROK>.ngrok-free.app/health

# Vérifications globales / bannissements (selon privilèges)
.\deploy\verify-setup.ps1 -LocalBase http://127.0.0.1:3001 -PublicUrl https://<DOMAINE_NGROK>.ngrok-free.app -BackendPort 3001
.\deploy\check-bans.ps1
.\deploy\check-bans.ps1 -Unban <IP>

# Validation syntaxe
node --check backend\src\server.js
node --check backend\src\security.js
```

## 5. Retour arrière SSH (manuel)
- **Sauvegardes** : `C:\ProgramData\ssh\sshd_config.bak.<horodatage>` (et copies créées par le script).
- **Rollback automatique** : tâche planifiée `DJS-SSH-Rollback-<horodatage>` (5 min) restaurant la sauvegarde et redémarrant `sshd` ; **annuler après validation** : `Unregister-ScheduledTask -TaskName 'DJS-SSH-Rollback-<horodatage>' -Confirm:$false`.
- **Rollback manuel** :
  ```powershell
  Copy-Item 'C:\ProgramData\ssh\sshd_config.bak.<horodatage>' 'C:\ProgramData\ssh\sshd_config' -Force
  sshd -t -f C:\ProgramData\ssh\sshd_config
  Restart-Service sshd
  ```
- **Pare-feu** : restaurer l’export `deploy\firewall-backup-<horodatage>.wfw` via `netsh advfirewall import "..."` ; supprimer la règle du nouveau port si nécessaire.
- **Règle d’or** : ne retirer le port 22 / l’ancienne règle qu’après connexion confirmée sur le nouveau port, session maintenue ouverte.

## 6. Repli : Cloudflare Tunnel (documenté, non installé)
Si un **domaine** est disponible, **Cloudflare Tunnel** (`cloudflared`) est une alternative plus stable au plan gratuit ngrok (pas de page d’interposition, quotas/sessions plus prévisibles selon offre, intégration DNS/Zero Trust) :
- Installer `cloudflared`, authentifier (`cloudflared tunnel login`), créer un tunnel et un enregistrement DNS vers le tunnel.
- Configurer `config.yml` pour router `https://api.<domaine>` → `http://127.0.0.1:3001`, exécuter comme service Windows.
- Conserver CORS strict (origine front uniquement), backend en 127.0.0.1, et les mêmes contrôles d’auth/rate-limit. Ne pas exposer SSH via le tunnel.
- Migrer le front : `PUBLIC_API_URL`/`DJS_API_BASE` et `connect-src` CSP vers le domaine API.

## 7. Clés / secrets à révoquer ou régénérer
- **Immédiat si exposition suspectée ou historique Git distant existant** : `PAIRING_API_TOKEN`, `SESSION_BACKUP_KEY`, toutes clés API/IA (`ANTHROPIC_API_KEY`, `GEMINI_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, etc.), credentials/sessions WhatsApp (`storage/sessions`, creds), tout contenu de `.env` ayant pu quitter la machine.
- **À générer avant mise en service** : `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (forts, uniques), authtoken ngrok (stocké via config locale/env, hors dépôt), secrets Turnstile, clés SSH (Ed25519 recommandé, passphrase).
- **Vérification** : aucun secret commité dans l’état actuel (pas de `.git`) ; scans basiques fournis (`verify-setup.ps1`). Ré-auditer après init Git (`gitleaks`).

## 8. État des vérifications effectuées (cette passe)
- `node web/scripts/test-api.js` : **13/13 OK**.
- `node web/scripts/check-links.js` : **0 lien/ancre/ressource cassé** (avertissements placeholders domaine attendus).
- `node --check` : `backend/src/server.js`, `backend/src/security.js`, `backend/scripts/verify-setup.js`, `web/api/config.js`, `web/public/js/api.js` : **OK**.
- Non exécuté (privilèges/services/infra absents) : application réelle SSH/pare-feu/bannissement, démarrage ngrok/tunnel public, tests CORS/rate-limit bout-en-bout via ngrok, Lynis, Lighthouse, tests auth automatisés complets.
