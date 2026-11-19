# Cahier des charges - DJOUSSE TECH MD Mobile (APK Android autonome)

Version 1.0 - 16/11/2026 - Djousse Tech Evolution
Base : arborescence du bot DJOUSSE TECH MD (12 categories de commandes,
handlers, jeux modulaires, backend de securite, site web).
Statut : les sections "A confirmer" demandent le contenu reel des fichiers
(voir docs/FICHIERS_A_ENVOYER.md).

## 1. Objectif
Livrer un fichier APK que l'utilisateur installe, ouvre, saisit son numero,
recoit un code de jumelage, le tape dans WhatsApp, puis le bot tourne en
local sur son telephone, 24h/24, sans serveur cloud.

## 2. Perimetre
Inclus : moteur Node.js embarque, bot (commandes compatibles), interface de
jumelage et de statut, service Android permanent, guide batterie/demarrage
auto, page de telechargement sur le site, build debug et release signe.
Exclu (v1) : Play Store, iOS, commandes ffmpeg/canvas, multi-sessions,
backend cloud, dashboard d'administration distant.

## 3. Architecture
```
 Telephone Android
 +--------------------------------------------------------------+
 | APK (Capacitor)                                              |
 |  WebView  www/index.html + js/app.js   (jumelage, statut)    |
 |     |  capacitor-nodejs : canal de messages                  |
 |     v                                                        |
 |  Node.js Mobile (thread)  www/nodejs/main.cjs                |
 |     -> mobile-runtime.cjs (pont jumelage/statut)             |
 |     -> index.js + src/ (bot, version allegee)                |
 |     -> Baileys <----------- Internet ------> WhatsApp        |
 |  BotService (Foreground Service) : garde le processus vivant |
 |  Donnees : dossier prive de l'appli (BOT_DATA_DIR)           |
 +--------------------------------------------------------------+
 Site Vercel (web/) : vitrine, FAQ, installation, telechargement APK.
 N'est PLUS dans la boucle de jumelage.
```

## 4. Role du site web
Le site actuel sert a saisir le numero et recuperer le code (connexion.html,
connexion.js, api.js, countries.js, appel /api/pair vers backend/). Sur
mobile ce parcours est reproduit localement :

| Site (PC / cloud) | Version APK |
|---|---|
| connexion.html : choix du pays + numero | www/index.html, section Jumelage |
| connexion.js : validation du numero | www/js/app.js (buildNumber, controle 8-15 chiffres) |
| api.js : fetch('/api/pair') | canal capacitor-nodejs : evenement `pair:request` |
| web/api/pair.js + backend/ : appelle Baileys | mobile-runtime.cjs : `sock.requestPairingCode(numero)` |
| Affichage du code | evenement `pair:code`, bouton Copier, consignes WhatsApp |
| status.js / config.js | evenement `bot:status` |
| commandes.html, faq, installation, legal | restent sur le site Vercel |

Ajout cote site : page `site-web/telecharger-apk.html` (lien de telechargement
de l'APK, avertissements, procedure "sources inconnues"). L'APK doit etre
heberge sur GitHub Releases (taille trop grande pour Vercel).

## 5. Exigences fonctionnelles
- EF-01 Premier lancement : ecran d'avertissement (bot non officiel, risque
  de bannissement du numero) avec acceptation obligatoire.
- EF-02 Demande des autorisations : notifications (Android 13+), exemption
  d'optimisation batterie, acces aux reglages de demarrage automatique.
- EF-03 Jumelage : choix du pays, saisie du numero, generation du code a 8
  caracteres (format XXXX-XXXX), bouton Copier, consignes pas a pas.
- EF-04 Persistance : session conservee dans le stockage prive ; au
  relancement l'appli se reconnecte seule.
- EF-05 Statut en direct : starting, needs_pairing, awaiting_link,
  connecting, connected, disconnected, logged_out, crashed.
- EF-06 Logs en direct (300 dernieres lignes) + fichier logs/mobile.log
  (tronque a 2 Mo).
- EF-07 Service permanent : notification "DJOUSSE TECH MD actif", wake lock
  partiel, redemarrage automatique du service (START_STICKY).
- EF-08 Apres reboot : notification "Touchez pour relancer" (voir 6).
- EF-09 Reinitialisation de session (deconnexion + suppression des creds)
  avec confirmation.
- EF-10 Proprietaire du bot = numero jumele (un telephone = un proprietaire).
- EF-11 Commandes conservees : categories 01, 02, 03, 05, 06, 07, 08, 10
  et jeux texte ; commandes retirees listees en section 7.
- EF-12 Commandes retirees : message "Indisponible sur la version mobile"
  si le gestionnaire le permet (a confirmer avec command-handler.js).
- EF-13 Une seule session WhatsApp (pas de multi-comptes) en v1.
- EF-14 Mise a jour : nouvel APK installe par-dessus ; les donnees (dossier
  prive hors du projet Node) sont conservees.

## 6. Exigences non fonctionnelles
- Android 7.0+ (API 24), architectures arm64-v8a et armeabi-v7a en priorite.
- Node.js Mobile = Node 18 : code compatible Node 18 (pas de toSorted,
  import.meta.dirname, Object.groupBy...). Le rapport de portage les detecte.
- Aucun binaire externe (ffmpeg), aucun module natif C++ (canvas, sharp).
- Fiabilite : reconnexion automatique ; process.exit() neutralise ;
  erreurs non gerees journalisees sans arreter le bot ; bot.lock supprime
  au demarrage (un kill laisse un verrou perime).
- Batterie : Tecno, Infinix, itel, Xiaomi, Samsung tuent les applis en
  arriere-plan : guide integre dans l'appli, a tester sur ces marques.
- Android 15 : le service est de type specialUse ; apres redemarrage,
  Android n'autorise pas a relancer une activite depuis le fond : d'ou la
  notification a toucher (limite connue, non contournable proprement).
- Confidentialite : donnees uniquement sur le telephone ; creds chiffres
  avec une cle aleatoire generee au premier lancement (.secret, dossier
  prive) a la place de la cle du .env.
- Securite : pas de .env, pas de cle API dans l'APK ; appels necessitant une
  cle via un proxy sur ton backend ; eval/exec/shutdown/restart retires.

## 7. Decisions module par module (a affiner avec le code)
| Element du bot | Decision | Raison |
|---|---|---|
| 01-general, 02-groupe, 03-protection | Garder | Coeur du bot, JS pur |
| 04-sticker-media : sticker, take, steal, toimg, toaudio, tovideo, voice, emojimix | Retirer (v1) | ffmpeg / binaires |
| 04-sticker-media : blur, readqr, wallpaper, removebg, remini, viewonce | Tester | Depend de jimp/API (rapport) |
| 05-outils, 08-recherche, 07-fun | Garder | JS pur / API publiques |
| 06-ia (ai, gpt, gpt4, imagine, vision...) | Garder, fusionner | Cles API via proxy backend |
| 09-owner : eval, exec, shutdown, restart, sessions | Retirer | Execution distante, inutile en local |
| 09-owner : self, public, setowner, setprefix, health, reload | Garder | Gestion du mode du bot |
| 10-divers : backup, note, todo, remind, afk... | Garder | Chemins vers BOT_DATA_DIR |
| 11-telechargement : ytmp3, ytmp4, play, gitclone | Retirer (v1) | ytdl + ffmpeg + git |
| 11-telechargement : tiktok, instagram, facebook, twitter, mediafire, spotify, lyrics, shazam | Tester | API externes |
| 12-jeux : actionverite, loupgarou, quiz, tictactoe, modenuit | Garder | Texte ; adultGen desactive |
| Jeux a images (Otaku/guilde, Ragnarok, Ludo) | v2 | canvas -> jimp ou FFmpegKit |
| src/core/supervisor.js, PM2, ecosystem.config.cjs | Non embarques | Le service Android remplace |
| src/core/authSafe.js | Adapter | Cle de chiffrement locale |
| src/config/paths.js | Adapter | BOT_DATA_DIR |
| src/config/config.js | Adapter | Drapeau MOBILE, owner = numero jumele |
| src/handlers/handler.js | Adapter | 4 imports non resolus a regler |
| src/lib/yt-download.js, sticker.js | Retirer/neutraliser | Dependent des modules retires |
| backend/, web/api, deploy/, deployment/, .github, ngrok.yml, *.bat | Non embarques | Cloud/PC uniquement |
| web/public (site) | Reste sur Vercel | Remplace dans l'APK par www/ |

## 8. Contrat de messages (WebView <-> Node)
WebView -> Node : `pair:request {number}`, `bot:status:get`, `bot:logs:get`,
`session:reset`.
Node -> WebView : `node:ready {node,data}`, `bot:status {state,number,...}`,
`bot:log {line}`, `bot:logs {lines}`, `pair:code {code}`,
`pair:error {message}`, `session:reset:done`.
Plugin natif BotService : start, stop, requestNotifications,
isBatteryExempt, requestBatteryExemption, openAutoStartSettings,
setPaired, restartApp, deviceInfo.

## 9. Dependances
Retirees : canvas, catozolala-card-canvas, ffmpeg-static, fluent-ffmpeg,
@distube/ytdl-core, sharp, ngrok, pm2, nodemon (config/mobile-profile.json).
Ajoutee automatiquement : le paquet Baileys reellement importe par le code
(le script le detecte ; verifie le nom exact, souvent
@whiskeysockets/baileys). Les 17 dependances signalees par knip ne sont pas
toutes inutiles : tout paquet encore importe est conserve.

## 10. Changements de code
Voir docs/PATCHES_A_FAIRE.md (P1 a P10), tous proteges par MOBILE=1.

## 11. Conformite et risques
- Baileys est non officiel : risque de bannissement du numero de chaque
  utilisateur. Avertissement obligatoire (EF-01), aucune promesse contraire.
- Pas de Play Store. Distribution : site + GitHub Releases.
- Contenu adulte genere par IA : desactive en mobile.
- Risque majeur : le processus meurt en arriere-plan selon la marque.
  Mitigation : service, wake lock, exemption batterie, guide, test 24 h.
- Risque capacitor-nodejs : version beta possible ; verifier son README
  (API du canal, configuration Gradle, nodeDir, startMode).

## 12. Plan de test
- T0 (avant tout portage) : Baileys seul + jumelage, telephone verrouille
  24 h, sur au moins un Tecno/Infinix, un Xiaomi, un Samsung.
- T1 : `scripts\05-test-pc.ps1` (version mobile sur le PC, TEST_PAIR_NUMBER).
- T2 : chaque commande gardee, une par categorie, puis toutes.
- T3 : coupure reseau, mode avion, kill de l'appli, reboot.
- T4 : mise a jour de l'APK par-dessus, session conservee.
- T5 : APK release signe installe sur telephone vierge.

## 12 bis. Jalons
J0 test Baileys 24 h - J1 portage (scripts 02) - J2 interface jumelage -
J3 stabilite multi-marques - J4 release signe + page site - J5 v2 (medias
via FFmpegKit, jeux a images, Ludo/Ragnarok/Otaku).

## 13. Criteres d'acceptation
- Installation APK -> jumelage -> connecte en moins de 2 minutes.
- Bot connecte 24 h telephone verrouille sur 3 marques.
- Aucun secret dans l'APK (decompilation verifiee).
- Aucune commande retiree n'apparait dans le menu sans mention.
- Reinitialisation de session fonctionnelle.