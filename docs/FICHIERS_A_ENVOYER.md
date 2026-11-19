# Fichiers a m'envoyer pour finaliser le portage

Par ordre de priorite (colle le contenu, un message par groupe) :

1. rapport-portage.txt (genere par scripts\02-preparer-bot.ps1) et package.json
2. index.js, src/config/paths.js, src/config/config.js, src/config/disabled-commands.js
3. Creation du socket et jumelage : le fichier qui appelle makeWASocket
   (probablement src/lib/auth.js ou src/core/*), src/core/authSafe.js,
   src/core/supervisor.js, src/core/group-owner.js
4. src/handlers/handler.js, command-handler.js, group-handler.js
5. Site : web/public/connexion.html, js/connexion.js, js/api.js, js/config.js,
   js/countries.js, css/tokens.css, web/api/pair.js, web/api/status.js,
   backend/src/server.js
6. src/lib/database.js, gate.js, media-download.js, sticker.js, yt-download.js,
   interactive.js, menu-ui.js, auto-status-poster.js
7. src/jeux/index.js et src/jeux/commun/*
8. .env.example (jamais le vrai .env)
9. Trois commandes exemples : 02-groupe/kick.js, 04-sticker-media/sticker.js,
   11-telechargement/play.js (pour le format cmd())

Avec ces fichiers je peux ecrire les patchs exacts (P1 a P10), remplacer
le stub de commandes retirees et aligner l'interface sur ton site.