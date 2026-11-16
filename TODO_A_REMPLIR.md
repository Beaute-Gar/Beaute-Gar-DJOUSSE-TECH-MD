# TODO_A_REMPLIR — Durcissement du dépôt

Dépôt : **Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD** (branche `main`)

## Bloquant (outillage / accès)

- [ ] **Installer GitHub CLI** (si absent) : https://cli.github.com/
- [ ] **S’authentifier** : `gh auth login`
- [ ] **Vérifier les droits admin** : `gh repo view Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --json viewerPermission`
- [ ] **Relire chaque réglage appliqué** via `gh api`/`gh repo view` (ne pas supposer qu’il est actif)

## À compléter dans les fichiers

- [ ] **`SECURITY.md`** : remplacer `[A_REMPLIR]` par l’adresse e-mail de contact sécurité (canal secondaire au signalement privé GitHub)
- [ ] (Optionnel) Vérifier/ajuster le texte du README si vous souhaitez modifier le message d’étoile, le lien WhatsApp ou les badges

## Réglages GitHub à appliquer puis vérifier

### Discussions
- [ ] Activer les Discussions : `gh repo edit Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --enable-discussions`
- [ ] Vérifier : `gh repo view Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD --json hasDiscussionsEnabled`
- [ ] **Manuel (UI)** : créer/ajuster les catégories **Annonces**, **Idées**, **Q&R** (Discussions → Categories)

### Sécurité
- [ ] Activer le **signalement privé de vulnérabilités** (private vulnerability reporting) + relire
- [ ] Activer **Secret scanning** + relire
- [ ] Activer **Push protection** (secret scanning) + relire
- [ ] Activer les **alertes Dependabot** + relire
- [ ] **Ne pas** activer les mises à jour automatiques de version Dependabot (créent des PR)

### Protection de `main`
- [ ] Créer un **ruleset** ciblant `~DEFAULT_BRANCH` : règles `deletion` + `non_fast_forward`, enforcement `active`, bypass rôle Repository admin (permet au mainteneur de pousser) ; **sans** approbation obligatoire / **sans** require PR
- [ ] Relire le ruleset : `gh api repos/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/rulesets` puis détail du ruleset
- [ ] Si ruleset indisponible : appliquer la protection de branche classique (`allow_force_pushes=false`, `allow_deletions=false`, `enforce_admins=false`, pas de review/PR requise) ou config manuelle UI

### Pull Requests (à faire EN DERNIER)
- [ ] Désactiver entièrement les Pull Requests (chercher/appliquer le champ API documenté, ex. `has_pull_requests=false`, puis relire)
- [ ] Si l’API ne le permet pas : **désactiver via UI** (Settings → General → Features → décocher *Pull requests*)
- [ ] Vérifier que `.../pulls` ne permet plus d’ouvrir une PR
- [ ] (Alternative) Choisir “limiter aux collaborateurs” si vous souhaitez garder l’onglet PR ouvert pour vous/collaborateurs invités

### Options du dépôt
- [ ] Activer *Automatically delete head branches* (`--delete-branch-on-merge`)
- [ ] Désactiver **Wikis** et **Projects** si inutilisés
- [ ] Confirmer que les **forks restent autorisés** (dépôt public)

## Sécurité opérationnelle (urgent si applicable)

- [ ] **Révoquer/faire tourner** les clés/tokens API potentiellement exposés ou sensibles (IA, services tiers, tokens de jumelage, ngrok, etc.)
- [ ] **Déconnecter les appareils/sessions WhatsApp** liés aux credentials/sauvegardes exposées, puis réappairer proprement
- [ ] Examiner les sauvegardes `storage/backups/*.creds.enc` **précédemment suivies dans l’historique Git** : considérer un **nettoyage d’historique** (ex. `git filter-repo`) pour suppression définitive du remote/historique — **à demander explicitement avant toute réécriture d’historique**
- [ ] Après nettoyage d’historique (si fait) : rotation complète des sessions/clés concernées et invalidation des accès anciens

## Vérifications finales

- [ ] Checklist relue par API : PR, Discussions, ruleset/protection, signalement privé, secret scanning, push protection, alertes Dependabot
- [ ] Test sans risque : force-push refusé sur branche protégée / `main` protégé, suppression refusée, PR non ouvrable (si désactivées), issues vierges bloquées
- [ ] Mettre à jour `RAPPORT_FINAL.md` avec les résultats réels après application des réglages
