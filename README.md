# DJOUSSE TECH MD - APK Android autonome

Chaque telephone Android devient son propre serveur : le bot tourne en local
(Node.js embarque), sans hebergeur. Le jumelage (numero -> code WhatsApp) se
fait dans l'ecran de l'appli, derive du parcours du site (connexion.html).

## Ordre d'execution (PowerShell, dans ce dossier)

0. Pre-requis : Node.js 20+, JDK 21, Android Studio (SDK + build-tools).
1. Dans TON BOT (branche `mobile`), applique docs/PATCHES_A_FAIRE.md
   (tous les patchs sont proteges par `process.env.MOBILE === '1'`, donc
   le bot PC continue de fonctionner normalement).
2. `powershell -ExecutionPolicy Bypass -File scripts\01-installer.ps1`
3. `powershell -ExecutionPolicy Bypass -File scripts\02-preparer-bot.ps1 -BotPath "C:\...\DJOUSSE TECH MD"`
   -> copie le bot, retire ce qui ne marche pas sur Android, installe les
      dependances, genere `rapport-portage.txt` (a lire !).
4. (optionnel) `scripts\05-test-pc.ps1` : lance la version mobile sur le PC.
5. `powershell -ExecutionPolicy Bypass -File scripts\03-appliquer-android.ps1`
6. `powershell -ExecutionPolicy Bypass -File scripts\04-compiler.ps1`
   -> APK copie sur le Bureau. Ajoute `-Release` pour un APK signe.

Tout-en-un (apres les patchs) : `scripts\00-tout-en-un.ps1 -BotPath "..."`.

## Contenu
- CAHIER_DES_CHARGES.md : specification complete basee sur ton arborescence
- docs/PATCHES_A_FAIRE.md : modifications a faire dans le code du bot
- docs/FICHIERS_A_ENVOYER.md : fichiers a me transmettre pour finaliser
- www/ : interface de l'appli (jumelage, statut, logs, permissions)
- nodejs-overrides/ : main.cjs + mobile-runtime.cjs (copies dans www/nodejs)
- android-overrides/ : service Foreground, receiver boot, plugin, MainActivity
- config/mobile-profile.json : commandes et dependances retirees en mobile
- site-web/telecharger-apk.html : page de telechargement pour ton site Vercel
- scripts/ : installation, preparation, build, test

## A savoir
- APK distribue en direct (pas de Play Store : bot non officiel).
- Aucun secret (.env, cles API) dans l'APK : un APK se decompresse en secondes.
- Apres un redemarrage du telephone, l'utilisateur doit toucher la
  notification pour relancer le bot (limite Android, voir cahier des charges).