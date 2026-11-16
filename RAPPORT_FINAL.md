# RAPPORT_FINAL — Durcissement du dépôt Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD

**Dépôt cible :** `Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD` (owner: `Beaute-Gar`, branche par défaut: `main`)  
**Date :** 2026-11-15  
**Branche de travail utilisée :** `repo-hardening` (commits atomiques), fusionnée puis poussée sur `main`

## 1) Prérequis et blocage `gh`

| Vérification | Résultat |
|---|---|
| `gh --version` | ❌ Non disponible (`gh` introuvable dans le PATH) |
| `gh auth status` | ❌ Impossible (CLI absente) |
| `gh repo view Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --json viewerPermission` | ❌ Impossible (CLI absente) |

**Action requise (blocage pour les réglages GitHub via API/CLI) :**
1. Installer GitHub CLI si nécessaire : https://cli.github.com/
2. S’authentifier :  
   ```bash
   gh auth login
   ```
3. Vérifier les droits admin :
   ```bash
   gh auth status
   gh repo view Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --json viewerPermission,name,defaultBranchRef
   ```
   > Les réglages de sécurité/branches/règles ci-dessous nécessitent des droits **admin** sur le dépôt.

## 2) Analyse de sécurité (secrets / sessions) — réalisée localement

### Méthode (sans réécriture d’historique)
- Inspection des fichiers suivis : `git ls-files` (recherche de motifs `creds`, `auth_info`, `session`, `baileys`, `.env`, etc.)
- Inspection de l’arborescence locale (hors `node_modules` / objets git) pour fichiers sensibles
- Vérification `.gitignore` / `git check-ignore`
- Échantillon d’historique : `git log --name-only --all` pour détecter des noms de fichiers sensibles déjà commités
- Vérification locale de `.env` (sans afficher les valeurs) : détection de variables sensibles renseignées

> `gitleaks` n’a pas été exécuté (non disponible dans l’environnement). Aucune réécriture d’historique Git n’a été effectuée.

### Constats

#### Exposé dans le dépôt / historique Git (à traiter)
- **Sauvegardes de sessions WhatsApp suivies puis retirées de l’index** : `storage/backups/**/*.creds.enc`
  - Ces fichiers étaient **suivis par Git** (présents dans l’historique et potentiellement sur le remote).
  - Action réalisée : suppression du suivi (`git rm --cached`) + renforcement de `.gitignore` + commit/push sur `main` (les fichiers ne seront plus suivis à l’avenir).
  - **Risque** : même chiffrés (`.creds.enc`), ces artefacts de session/credentials ne doivent pas être versionnés. Leur présence passée dans l’historique reste une exposition tant que l’historique n’est pas nettoyé.

#### Présent localement (non suivi par Git) — sensible
- `.env` local contient des valeurs renseignées pour des variables sensibles (ex. `SESSION_BACKUP_KEY`, `GEMINI_KEY`, `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, `AUDD_API_KEY`, `REMOVEBG_API_KEY`, `OMDB_API_KEY`, `GNEWS_API_KEY`, `SERPER_API_KEY`, etc.). **Non commité**.
- `storage/sessions/**/creds.json`, `storage/sessions/**/creds.json.bak`, `storage/sessions/**/session-*.json` présents localement (sessions Baileys/WhatsApp). **Non suivis**.
- `storage/backups/**` contient des fichiers locaux de sauvegarde (ignorés désormais).

#### Fichiers exemples/attendus (non sensibles en soi)
- `.env.example`, `backend/.env.example`, `web/.env.example` suivis (modèles) — OK.

### Actions de remédiation réalisées
- `.gitignore` renforcé (sessions, `auth_info*`, `baileys_auth`, `storage/backups/`, `creds*`, clés/certificats, `.env*`, logs/temp, etc.)
- Retrait du suivi des sauvegardes `storage/backups/**/*.creds.enc` (suppression de l’index, fichiers locaux conservés)

### Actions recommandées (à faire par le mainteneur)
- **Révoquer/faire tourner les clés et tokens** potentiellement exposés ou utilisés sur des environnements compromis (clés IA/API tierces, tokens de jumelage/ngrok, etc.).
- **Déconnecter/révoquer les sessions WhatsApp** associées aux credentials/sauvegardes exposées dans l’historique (appareils liés WhatsApp), puis régénérer de nouvelles sessions propres.
- **Nettoyage de l’historique Git (optionnel mais recommandé)** pour supprimer définitivement les `storage/backups/*.creds.enc` de l’historique/remote (ex. `git filter-repo`) — **non effectué** (demande explicite requise avant toute réécriture d’historique).
- Après nettoyage d’historique (si effectué), forcer la rotation de toutes les sessions/clés concernées.

## 3) Fichiers du dépôt créés/mis à jour (commits atomiques, poussés sur `main`)

| Fichier | État | Commit |
|---|---|---|
| `.gitignore` (+ retrait suivi `storage/backups/*.creds.enc`) | Mis à jour / appliqué | `46e8ecd` |
| `LICENSE` | Mis à jour (MIT standard exact, `Copyright (c) 2026 DJOUSSE TECH MD`) | `ac004e7` |
| `SECURITY.md` | Mis à jour (versions supportées, signalement privé prioritaire, email `[A_REMPLIR]`, délais 72h/7j, confidentialité/divulgation coordonnée) | `928132f` |
| `README.md` | Mis à jour (en-tête centré ajouté en tête, contenu existant conservé : bannière, badges étoiles/forks/licence MIT/Node, demande d’étoile, lien dépôt + indication bouton Star, rappel PR désactivées, lien WhatsApp) | `6537739` |
| `CONTRIBUTING.md` | Mis à jour (fork, PR désactivées, contributions via Discussions, étoile encouragée, règles de respect/usage WhatsApp, synchro fork) | `1e2e8e8` |
| `.github/ISSUE_TEMPLATE/config.yml` | Mis à jour (`blank_issues_enabled: false`, contact links Discussions + signalement privé) | `e195d33` |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Créé (formulaire bug, label `bug`, case duplication cochable) | `09fdb5b` |
| `.github/CODEOWNERS` | Créé (`* @Beaute-Gar`) | `dcd27b8` |

**Merge/push :** `49ae8d0` — *chore(repo): appliquer le durcissement du dépôt (fichiers)* sur `main`.

## 4) Réglages GitHub à appliquer (manuels / via `gh` après authentification)

> Les commandes ci-dessous doivent être exécutées après `gh auth login` avec des droits admin, puis **relues** via `gh api` pour confirmer l’état réel. Si une commande échoue (droits/plan/champ), appliquer les étapes manuelles indiquées.

### a. Discussions (activer)
**CLI :**
```bash
gh repo edit Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --enable-discussions
gh repo view Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --json hasDiscussionsEnabled
```
**Manuel (UI) :** Settings → General → Features → cocher **Discussions**.

**Catégories Discussions (non créables via CLI) — étapes manuelles :**
1. Onglet **Discussions** → icône engrenage **Categories** (ou *Edit categories*)
2. Créer/ajuster :
   - **Annonces** (Announcements)
   - **Idées** (Ideas)
   - **Q&R** (Q&A / Questions & Answers)
3. (Optionnel) conserver Général/Showcase selon besoin.

### b. Sécurité : signalement privé, secret scanning, push protection, Dependabot
**Signalement privé de vulnérabilités :**
```bash
gh api -X PUT repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/private-vulnerability-reporting
gh api repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/private-vulnerability-reporting
```
**Secret scanning + push protection (security_and_analysis) :**
```bash
gh api -X PATCH repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD -H "Accept: application/vnd.github+json" --input - <<'JSON'
{
  "security_and_analysis": {
    "secret_scanning": {"status": "enabled"},
    "secret_scanning_push_protection": {"status": "enabled"}
  }
}
JSON
gh api repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --jq '.security_and_analysis'
```
**Alertes Dependabot (sans mises à jour automatiques de version) :**
```bash
gh api -X PUT repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/vulnerability-alerts
gh api -X DELETE repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/automated-security-fixes
gh api -i repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/vulnerability-alerts
gh api repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --jq '.security_and_analysis.dependabot_security_updates'
```
> **Ne pas activer** les mises à jour automatiques de version Dependabot (elles créent des PR, incompatibles avec la désactivation des PR).

**Manuel (UI) :** Settings → Code security and analysis → activer **Private vulnerability reporting**, **Secret scanning**, **Push protection**, **Dependabot alerts** ; laisser **Dependabot version updates** désactivé.

### c. Protection de `main` (ruleset recommandé)

**Objectif :** interdire suppression et réécriture d’historique de `main`, tout en permettant au mainteneur admin de continuer à pousser (PR désactivées + mainteneur unique).

**Règles incluses :** `deletion`, `non_fast_forward` (enforcement `active`, bypass rôle Repository admin).  
**Règles volontairement exclues :** pas de règle d’approbation obligatoire et pas de `require pull request` — avec PR désactivées et un seul mainteneur, ces règles bloqueraient les pushes (y compris ceux du mainteneur).

**Exemple (ruleset) :**
```bash
gh api -X POST repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/rulesets \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [
    {
      "actor_id": 5,
      "actor_type": "RepositoryRole",
      "bypass_mode": "always"
    }
  ],
  "conditions": {
    "ref_name": {
      "include": ["~DEFAULT_BRANCH"],
      "exclude": []
    }
  },
  "rules": [
    {"type": "deletion"},
    {"type": "non_fast_forward"}
  ]
}
JSON

gh api repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/rulesets
```
> Si l’`actor_id` du rôle Repository admin diffère selon contexte, lister les rôles/rulesets ou ajuster via l’UI. Après création, relire le ruleset créé (`gh api repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/rulesets/<id>`).

**Repli si rulesets indisponibles (plan/droits) — ancienne protection de branche :**
```bash
gh api -X PUT repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

gh api repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/branches/main/protection
```
**Manuel (UI) :** Settings → Rules → Rulesets (ou Branches → Branch protection rules) → protéger `main` : interdire force push et suppression, ne pas exiger de PR/review.

### d. Désactiver les Pull Requests (EN DERNIER)
**CLI (champ à vérifier selon API actuelle, souvent `has_pull_requests` dans « Update a repository ») :**
```bash
gh api -X PATCH repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD -f has_pull_requests=false
gh api repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --jq '{has_pull_requests, has_issues, has_discussions}'
```
> Si le champ est absent/inconnu ou échoue, ne pas forcer : appliquer la méthode manuelle.

**Manuel (UI) — désactivation complète :**
1. Settings → General → **Features**
2. Décocher **Pull requests**
3. Enregistrer/vérifier que l’onglet PR n’est plus utilisable pour en ouvrir

**Alternative « limiter aux collaborateurs » (garde l’onglet visible) :**
- Settings → General → Features → **Pull requests** → menu déroulant/options → restreindre aux collaborateurs (si disponible). Permet au mainteneur/collaborateurs invités d’utiliser des PR, tout en bloquant les contributions PR externes.

### e. Options utiles du dépôt
```bash
gh repo edit Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --delete-branch-on-merge
gh repo edit Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --enable-wiki=false
gh repo edit Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --enable-projects=false
gh api repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --jq '{delete_branch_on_merge,has_wiki,has_projects,has_discussions,has_issues,has_pull_requests}'
```
**Manuel (UI) :** Settings → General → activer *Automatically delete head branches* ; désactiver **Wikis** et **Projects** si inutilisés. **Les forks restent autorisés** (dépôt public).

## 5) Vérification finale (état réel)

| Élément | État relu par API | Commentaire |
|---|---|---|
| PR désactivées | ⏳ Non vérifié | `gh` absent ; appliquer et relire après auth |
| Discussions activées | ⏳ Non vérifié | `gh` absent ; activer via `gh repo edit --enable-discussions` ou UI puis relire |
| Ruleset/protection `main` actif | ⏳ Non vérifié | À créer (ruleset ou branch protection) puis relire |
| Signalement privé de vulnérabilités actif | ⏳ Non vérifié | À activer puis relire endpoint dédié |
| Secret scanning actif | ⏳ Non vérifié | À activer via `security_and_analysis` puis relire |
| Push protection secret scanning active | ⏳ Non vérifié | À activer puis relire |
| Alertes Dependabot actives | ⏳ Non vérifié | À activer (sans version updates) puis relire |
| Fichiers de durcissement présents sur `main` | ✅ Vérifié localement/git | Commités et poussés (`49ae8d0`) |
| Sauvegardes creds retirées du suivi | ✅ Vérifié localement/git | Retirées de l’index et ignorées à l’avenir (historique non réécrit) |

### Tests recommandés (sans risque)
- **Force-push sur `main` (après protection/ruleset)** : depuis une branche de test, tenter `git push --force-with-lease origin HEAD:main` → doit être refusé si `non_fast_forward`/force-push interdit est actif. (Ne pas tester sur la branche de production sans protection en place.)
- **Suppression de branche protégée** : tenter de supprimer `main` via UI/API → doit être refusée.
- **PR** : vérifier `https://github.com/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/pulls` ; après désactivation complète, l’ouverture d’une nouvelle PR ne doit plus être possible (l’UI ne doit plus proposer le flux de création).
- **Issue vierge** : création d’issue sans template doit être bloquée (`blank_issues_enabled: false`) et rediriger vers Discussions/Sécurité.
- **Push protection** : tenter de pousser un faux secret connu (dans une branche de test) pour valider le blocage (après activation).

## 6) Limites (à connaître)

- **On ne peut pas obliger quelqu’un à mettre une étoile avant de cloner** : le README ne fait que le demander (invitation, pas obligation).
- **Licence MIT** : n’importe qui peut forker et réutiliser le code selon les termes de la licence. Les protections empêchent de modifier **ce** dépôt, pas d’en faire une copie.
- **PR désactivées** : les forks ne peuvent plus envoyer de PR vers ce dépôt ; les contributions passent par les **Discussions** (et invitation éventuelle en collaborateur).
- **Historique Git** : les sauvegardes de sessions précédemment suivies restent dans l’historique tant qu’il n’est pas réécrit ; le retrait du suivi ne supprime pas les copies déjà clonées/poussées.
- **Protection parfaite impossible** : le durcissement réduit fortement les risques, mais ne remplace pas la rotation des secrets/sessions exposés et les bonnes pratiques opérationnelles.
