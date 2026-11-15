# Audit — infrastructure (front Vercel + backend local + tunnel ngrok)

_Date : 2026-11-15 · Machine locale : Windows · Contexte dépôt : DJOUSSE TECH MD_

## 1. Environnement détecté
- **OS** : Microsoft Windows NT 10.0.26300.0 (PowerShell 5.1), hôte `DJOUSSE-URIEL`, session `djousse-uriel\djousse uriel`.
- **Privilèges** : session **non administrateur** (les actions système nécessitant l’élévation ne peuvent pas être appliquées directement ; des scripts prêts à exécuter sont fournis dans `./deploy/`).
- **Dépôt** : pas de `.git` à la racine (`git status` indisponible) → branche `infra-hardening` et commits atomiques **non réalisables** dans l’état actuel.
- **Runtimes/outils** : Node.js `v24.21.0`, npm `11.19.0`, Git `2.56.0.windows.1`. `pm2` absent du PATH, `ngrok` absent du PATH.
- **Gestionnaire de processus applicatif** : `ecosystem.config.cjs` présent (PM2, app `dte-bot` → `index.js`, worker bot) ; PM2 non installé globalement détecté.

## 2. Front-end (Vercel)
- **Type** : site statique multi-pages (`web/public`, HTML/CSS/JS vanilla) + fonctions serverless Vercel (`web/api/pair.js`, `web/api/status.js`).
- **Hébergement** : Vercel, projet lié `.vercel/project.json` (`projectName: djousse-tech-md`, domaine en production observé : `https://djousse-tech-md-web.vercel.app/`). Configuration : `web/vercel.json`.
- **Appels API actuels** : le client `web/public/js/api.js` appelle en **same-origin** les routes Vercel `/api/pair` et `/api/status`, qui proxient vers `PAIRING_API_URL` (Render, `https://djousse-tech-md.onrender.com`). **Aucune** variable `NEXT_PUBLIC_API_URL`/`VITE_API_URL` ni en-tête `ngrok-skip-browser-warning` n’étaient présents ; pas de client API unifié configurable vers un backend ngrok.
- **Formulaires** : jumelage téléphone (`connexion.html`) → `POST /api/pair`.

## 3. Backend / API
- **Code backend HTTP** : **aucun serveur HTTP** détecté dans le dépôt (`index.js` racine = bot WhatsApp/Baileys, worker sans port ; aucune occurrence `listen(` / `createServer` / framework Express-Fastify côté applicatif). Les « backends » de jumelage en production sont (a) fonctions Vercel `web/api/*` (proxy) et (b) service Render externe non présent dans ce dépôt.
- **Port local du backend** : non détectable → **[A_REMPLIR]** (valeur par défaut proposée : `3001`, à confirmer). Contrainte cible : écoute sur `127.0.0.1` uniquement, exposé à Internet via ngrok.
- **Implication** : pour l’architecture demandée (front Vercel → ngrok → backend local), un service API HTTP local doit exister/être implémenté et écouter sur le port choisi. Un squelette d’API locale durcie (`backend/`) et les configurations front/ngrok sont fournis pour permettre le câblage et la mise en conformité.

## 4. Réseau, ports et pare-feu
- **Ports en écoute (échantillon)** : services système/locaux variés (135, 445, 5357, 7680, 20271, nombreux ports éphémères/high ports, plusieurs liaisons `127.0.0.1`). Aucun port applicatif HTTP backend identifié.
- **Pare-feu Windows** : profils Domain/Private/Public **activés** ; `DefaultInboundAction` / `DefaultOutboundAction` non configurés explicitement (valeurs par défaut Windows effectives). Politique cible demandée : refus par défaut en entrée, autorisation en sortie, ouverture minimale (SSH personnalisé restreint si possible), backend non exposé directement (127.0.0.1).
- **Exposition** : aucun tunnel ngrok détecté ; pas de redirection de port SSH.

## 5. SSH
- **OpenSSH Server** : non installé/configuré (`C:\ProgramData\ssh\sshd_config` absent, service `sshd` absent, binaire non trouvé dans les chemins standards vérifiés).
- **Port personnalisé / durcissement / clés** : non appliqués (à mettre en place via scripts `deploy/` avec règles anti-verrouillage). SSH ne doit pas être exposé via ngrok ; accès prévu réseau local ou solution privée (Tailscale/WireGuard, documenté).

## 6. Protection anti-intrusion (équivalent fail2ban, Windows)
- **fail2ban** : non disponible nativement sur Windows.
- **État actuel** : aucune stratégie de verrouillage/bannissement automatisé spécifique constatée depuis la session non privilégiée. À mettre en place : stratégie de verrouillage de compte, journalisation/prise en charge de l’événement 4625, script PowerShell de bannissement Pare-feu Windows, scripts `check-bans`/déban.

## 7. Services, persistance et supervision
- **ngrok** : non installé, pas de service/tâche de tunnel.
- **Backend** : pas de service local persistant ; PM2 déclaré (`ecosystem.config.cjs`) pour le bot mais non présent.
- **Veille/hibernation, mises à jour, sauvegardes, supervision** : non vérifiables/appliquables sans privilèges ; scripts et procédures fournis dans `./deploy/` et la documentation.

## 8. Sécurité applicative & secrets
- **Front** : durci précédemment (CSP, en-têtes, consentement, formulaires) ; doit être adapté pour cibler l’API ngrok via variable d’environnement publique, ajouter `ngrok-skip-browser-warning`, gérer l’indisponibilité du tunnel.
- **Secrets** : `.env` racine présent localement (ignoré par `.gitignore`), `.env.example` présents (racine, `web/`). Pas d’historique Git auditable ; tout secret potentiellement exposé doit être considéré à révoquer/régénérer.
- **Audit dépendances (récent)** : `web/` 0 vulnérabilité ; racine 47 vulnérabilités résiduelles (dépendances bot) après correctifs sûrs.

## 9. Constats bloquants / points d’attention
1. **Absence de backend HTTP local** dans le dépôt (seul le bot worker existe) : l’architecture front→ngrok→backend local nécessite un service API à créer/câbler sur `[A_REMPLIR:PORT]`.
2. **Droits insuffisants** (non admin) : installation OpenSSH/ngrok en service, modification pare-feu/politiques/sshd, tâches planifiées système → via scripts `./deploy/`.
3. **Pas de Git** : pas de branche `infra-hardening` ni de commits.
4. **Informations manquantes** : domaine(s) Vercel/perso, port backend, domaine ngrok, port SSH, utilisateur admin, clé publique SSH, IP/plage SSH, e-mail alertes (tous `[A_REMPLIR]`).

## 10. Actions réalisées / fournies dans cette passe
- Audit infra (ce document), mise à jour `TODO_A_REMPLIR.md`, création du dossier `./deploy/` (scripts Windows/PowerShell et guides), squelette `backend/` (API locale, écoute 127.0.0.1, `/health`, CORS strict, sécurité de base, prêt pour ngrok), adaptation du front (client API configurable + en-tête `ngrok-skip-browser-warning` + gestion d’indisponibilité), configuration ngrok (`ngrok.yml` modèle), scripts de supervision/vérification (`check-tunnel`, `check-bans`, `verify-setup`) et `RAPPORT_FINAL.md`.
