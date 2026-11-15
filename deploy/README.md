# Déploiement & durcissement (Windows) — dossier `deploy/`

Ce dossier contient des scripts **prêts à exécuter** pour mettre en place l’architecture (backend local 127.0.0.1, tunnel ngrok, front Vercel) et durcir la machine Windows. La session d’audit n’était **pas administrateur** : les scripts système doivent être lancés dans **PowerShell en tant qu’administrateur** après relecture.

## Règles de sécurité
- **Aucun secret dans le dépôt.** Renseigner les placeholders `[A_REMPLIR]` localement, utiliser `.env` (hors git) et les variables d’environnement / coffres Vercel-ngrok.
- **Sauvegardes** : chaque script crée une copie `.bak.<horodatage>` avant modification de configuration.
- **Anti-verrouillage SSH** (obligatoire) : nouveau port ouvert au pare-feu → ajouté à sshd → rechargement sans fermer l’ancien → test sur le nouveau port → suppression de l’ancien **uniquement après validation**, session actuelle maintenue, rollback automatique planifié (5 min) annulé après confirmation. Voir `setup-ssh.ps1`.
- Ne jamais exposer SSH via ngrok ni via redirection box. Backend en écoute `127.0.0.1` uniquement.

## Scripts
| Script | Rôle | Privilèges |
|---|---|---|
| `setup-ssh.ps1` | Installation/config OpenSSH Server, port personnalisé, clés, durcissement, rollback anti-verrouillage | Admin |
| `setup-firewall.ps1` | Pare-feu (refus entrant par défaut, ouvertures minimales, restriction SSH, backend non exposé) | Admin |
| `setup-fail2ban.ps1` | Équivalent Windows : stratégie de verrouillage + bannissement IP sur événement 4625 | Admin |
| `setup-ngrok.ps1` | Installation/config ngrok, tâche planifiée/service de persistance | Admin (service/tâche) / User |
| `setup-services.ps1` | Démarrage auto backend/ngrok (tâches planifiées) | Admin/User selon choix |
| `check-tunnel.ps1` | Vérifie le tunnel et l’atteignabilité du backend via URL publique | User |
| `check-bans.ps1` | Liste/débannit les IP bloquées (pare-feu/stratégie) | Admin pour débannir |
| `verify-setup.ps1` | Vérifications globales (tunnel, CORS, ports, services, secrets) | Mixte |

## Ordre recommandé
1. Renseigner placeholders dans `backend/.env`, `ngrok.yml`, `web/public/js/config.js` (ou var Vercel `PUBLIC_API_URL`), et variables Vercel.
2. `setup-firewall.ps1` (revoir règles existantes) → `setup-ssh.ps1` (si SSH requis) → `setup-fail2ban.ps1`.
3. Installer/démarrer le backend local (`backend/`) puis `setup-ngrok.ps1` / `setup-services.ps1`.
4. Lancer `check-tunnel.ps1`, `check-bans.ps1`, `verify-setup.ps1` et compléter `RAPPORT_FINAL.md`.

## Limites connues
- fail2ban natif absent sous Windows : équivalent fourni (verrouillage de compte + bannissement sur 4625), à tester en environnement réel.
- Sans backend HTTP métier réel sur le port choisi, le tunnel ne peut exposer qu’un service minimal (`/health`).
- ngrok plan gratuit : ~1 Go/mois sortant, page d’avertissement (contourner via `ngrok-skip-browser-warning`), domaine fixe unique, limites de session à vérifier dans le dashboard.
