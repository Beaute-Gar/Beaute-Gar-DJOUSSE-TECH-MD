# TODO — informations et actions à compléter

Les éléments ci-dessous n’ont pas pu être renseignés ou finalisés automatiquement sans information fournie, sans accès externe, sans privilèges administrateur ou sans dépôt Git. **Aucune donnée légale, réseau ou secrète n’a été inventée.**

## A. Informations obligatoires (placeholders `[A_REMPLIR]`)

### Site web & identité
- [ ] **Nom du site** : confirmer le libellé public exact (placeholder utilisé dans pages/manifest/JSON-LD).
- [ ] **Domaine de production (https)** : remplacer `https://[A_REMPLIR]` dans `web/public` (pages, `sitemap.xml`, `robots.txt`, canonical/OG/JSON-LD) une fois le domaine connu ; configurer la redirection canonique (apex/www) dans Vercel.
- [ ] **Email de contact** : remplacer `[A_REMPLIR]` / `[A_REMPLIR]@example.invalid` dans politique de confidentialité, CGU, mentions légales, JSON-LD.
- [ ] **Adresse / pays de l’éditeur** : compléter mentions légales et politique de confidentialité (DJOUSSE TECH EVOLUTION).
- [ ] **Responsable de la protection des renseignements personnels (Loi 25, Québec)** : nom, fonction, coordonnées.

### Infrastructure (mission front Vercel + backend local + ngrok)
- [ ] **Domaine Vercel du front** : `[A_REMPLIR]` (ex. `ton-site.vercel.app`) et **domaine personnel** éventuel `[A_REMPLIR]` — à renseigner dans `backend/.env` (`ALLOWED_ORIGINS`), `web` (config API publique) et CORS.
- [ ] **Port local du backend** : `[A_REMPLIR]` (non détecté ; défaut proposé `3001`) — aligner `backend/.env` (`PORT`), `ngrok.yml`, scripts `check-tunnel`/`verify-setup` et le service de démarrage.
- [ ] **Domaine ngrok attribué (compte gratuit)** : `[A_REMPLIR]` (ex. `nom.ngrok-free.app`) — renseigner `ngrok.yml` et la variable d’URL API publique côté Vercel.
- [ ] **Port SSH personnalisé** : `[A_REMPLIR]` (sinon choisir un port aléatoire 20000–60000 non utilisé) — `deploy/setup-ssh.ps1`, pare-feu, `sshd_config`.
- [ ] **Utilisateur d’administration non-root** : `[A_REMPLIR]` — `AllowUsers` SSH, propriétaire des services.
- [ ] **Clé publique SSH** : `[A_REMPLIR]` — à installer dans `authorized_keys` avant de désactiver les mots de passe.
- [ ] **IP ou plage autorisée pour SSH (optionnel)** : `[A_REMPLIR]` — restriction pare-feu/reseau si le port doit être filtré.
- [ ] **Email pour les alertes (fail2ban/équivalent, supervision)** : `[A_REMPLIR]` (optionnel).

## B. Validation juridique (obligatoire avant mise en ligne)
- [ ] Faire **valider par un juriste** : `politique-de-confidentialite.html`, `conditions-generales.html`, `mentions-legales.html` (modèles, non opposables en l’état).
- [ ] Vérifier adéquation Loi 25 (Québec), cadre camerounais/Afrique francophone et RGPD (UE) selon activité, transferts et sous-traitants réels.
- [ ] Confirmer durées de conservation, bases légales et procédures d’exercice des droits.

## C. Sécurité, secrets et déploiement (web)
- [ ] **Pas de dépôt Git** : impossible d’auditer l’historique. Si ce code a été poussé à distance, auditer l’historique complet (gitleaks/`git log -p`) et **révoquer/régénérer** tout secret potentiellement exposé (`PAIRING_API_TOKEN`, `SESSION_BACKUP_KEY`, clés IA/fournisseurs, sessions/credentials WhatsApp, etc.). `.env` racine présent localement : vérifier qu’il n’a jamais été publié.
- [ ] Configurer dans Vercel (Production/Preview) : `PAIRING_API_URL` **ou** la nouvelle URL API publique (`PUBLIC_API_URL`/équivalent selon câblage retenu), `PAIRING_API_TOKEN`, `SITE_ORIGIN` (= domaine de production), `TURNSTILE_SECRET_KEY` si anti-spam activé.
- [ ] **Cloudflare Turnstile** : créer site, renseigner clé publique côté front et `TURNSTILE_SECRET_KEY` côté serveur ; sans clés, protection partielle (honeypot + rate limiting).
- [ ] **Redéployer** le site `web/` (projet Vercel `djousse-tech-md`) : la prod servait des données catalogue obsolètes ; vérifier `/data/commands.json` et `/api/status` après déploiement.
- [ ] Restreindre l’indexation des **prévisualisations/staging** (noindex / `X-Robots-Tag` selon environnement).

## D. Infrastructure — actions manuelles/privilèges (Windows)
- [ ] Exécuter en **administrateur** les scripts `deploy/setup-ssh.ps1`, `deploy/setup-firewall.ps1`, `deploy/setup-fail2ban.ps1`, `deploy/setup-ngrok.ps1`, `deploy/setup-services.ps1` après avoir renseigné les placeholders et relu les instructions anti-verrouillage.
- [ ] Installer et authentifier **ngrok** (`ngrok config add-authtoken <TOKEN>` via variable d’environnement/saisie sécurisée, jamais dans le dépôt), configurer le domaine fixe du plan gratuit, et activer le service/tâche de persistance.
- [ ] **Backend local** : implémenter/câbler le service API réel sur `[A_REMPLIR:PORT]` (écoute `127.0.0.1`), compléter authentification JWT/sessions, rôles, base de données/utilisateurs et routes métier selon besoins ; le squelette `backend/` fournit la base sécurisée et `/health`.
- [ ] Vérifier dans le tableau de bord ngrok les limites de session/trafic actuelles du plan gratuit et consigner dans `RAPPORT_FINAL.md`.
- [ ] Sauvegardes automatiques chiffrées (données/config), rotation, **test de restauration** documenté, stockage hors machine.
- [ ] Mises à jour de sécurité automatiques (Windows Update) et supervision/alertes (backend, tunnel, disque, mémoire) via `deploy/` / tâches planifiées.

## E. Qualité, mesures et conformité continue
- [ ] Lancer **Lighthouse** mobile/desktop après déploiement et consigner scores (objectif ≥ 90, LCP < 2,5 s, CLS < 0,1).
- [ ] Exécuter `npm run check-links` (dans `web/`) et les tests `node web/scripts/test-api.js` ; exécuter `node backend/scripts/verify-setup.js` (ou équivalent) une fois l’infra en place.
- [ ] Vérifier manuellement : consentement (aucun traceur avant choix), clavier/lecteur d’écran, largeurs 320/375/768/1024/1440 px, CORS refusé pour origine inconnue.
- [ ] Initialiser Git, créer la branche demandée, commits atomiques, activer `.github/workflows/ci.yml`.
- [ ] Si envoi d’e-mails ajouté : configurer **SPF, DKIM, DMARC**.
- [ ] Traiter les vulnérabilités npm racine restantes sans casser le build (tests fonctionnels bot).
