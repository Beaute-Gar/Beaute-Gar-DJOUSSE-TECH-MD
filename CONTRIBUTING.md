# 🤝 Contribuer à DJOUSSE TECH MD

Merci de votre intérêt pour **DJOUSSE TECH MD** — bot WhatsApp multi-device basé sur **Baileys**, développé par **DJOUSSE TECH** (Owner : **BeauteGar**).  
Vos contributions (corrections, idées, documentation, améliorations) sont les bienvenues.

---

## 📋 Avant de commencer

- Consultez le [README](./README.md) et les documents du dépôt pour comprendre le projet.
- Vérifiez les [Issues](https://github.com/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/issues) et [Discussions](https://github.com/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/discussions) pour éviter les doublons.
- Pour une faille de sécurité, **n’ouvrez pas d’issue publique** : suivez [SECURITY.md](./SECURITY.md).
- Respectez le [Code de conduite](./CODE_OF_CONDUCT.md).

---

## 🧰 Prérequis

- **Git**
- **Node.js ≥ 22** (recommandé, selon le projet)
- **npm**
- Un environnement de test adapté (sans exposer de données sensibles/sessions)

---

## 🚀 Installer et lancer en local

```bash
# 1) Cloner le dépôt
git clone https://github.com/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD.git
cd Beaute-Gar-DJOUSSE-TECH-MD

# 2) Installer les dépendances
npm install

# 3) Configurer l'environnement (ne jamais committer .env ni les sessions)
# Copier/adapter .env.example si présent, puis renseigner les variables nécessaires

# 4) Lancer le bot
node index.js
```

> ⚠️ Ne commitez jamais `.env`, tokens, clés API, sessions WhatsApp, sauvegardes ou données personnelles.

---

## 🌿 Créer une branche

Travaillez toujours sur une branche dédiée à partir de `main` :

```bash
git checkout main
git pull origin main
git checkout -b feat/ma-fonctionnalite
# ou fix/correction-bug, docs/mise-a-jour, chore/...
```

**Conventions suggérées :**
- `feat/...` nouvelle fonctionnalité
- `fix/...` correction de bug
- `docs/...` documentation
- `refactor/...` refactorisation sans changement fonctionnel
- `chore/...` maintenance/outillage

---

## ✅ Règles de contribution

- **Respect & bienveillance** : échanges constructifs, pas de harcèlement.
- **Code propre** : changements ciblés, lisibles, cohérents avec le style existant.
- **Pas de secrets** : aucun token, clé, numéro sensible ou session dans le code/commits.
- **Pas de régression** : ne cassez pas les fonctionnalités existantes (commandes, protections, appairage, web).
- **Documentation** : mettez à jour README/docs si le comportement ou la config change.
- **Tests/vérifications** : testez vos changements localement quand c’est possible (scénarios pertinents, commandes impactées).

---

## 🔁 Soumettre une Pull Request

1. **Commitez** des changements clairs et atomiques.
2. **Poussez** votre branche :
   ```bash
   git push origin feat/ma-fonctionnalite
   ```
3. **Ouvrez une Pull Request** vers `main` en remplissant le modèle fourni.
4. Décrivez : le problème, la solution, les impacts, et comment tester.
5. Répondez aux retours de revue si nécessaire.

### Checklist PR (recommandée)
- [ ] Le changement est testé localement
- [ ] Aucun secret / donnée sensible ajouté
- [ ] Le code respecte le style du projet
- [ ] La documentation est mise à jour si nécessaire
- [ ] Les cas limites pertinents sont pris en compte

---

## 🐞 Signaler un bug / proposer une idée

- **Bug** : ouvrez une [issue Bug](https://github.com/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/issues/new/choose)
- **Fonctionnalité** : ouvrez une [issue Feature](https://github.com/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/issues/new/choose)
- **Question / échange** : utilisez les [Discussions](https://github.com/Beaute-Gar/Beaute-Gar-DJOUSSE-TECH-MD/discussions)

---

Merci pour votre contribution à **DJOUSSE TECH MD** 🚀  
*Des solutions fiables pour un avenir sans limites.*
