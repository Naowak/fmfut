# Changelog — moteur 0.2.0

## Changements de gameplay

- Vitesse globale de déplacement augmentée.
- Appels sans ballon persistants.
- Jusqu'à trois appels offensifs simultanés.
- Probabilité d'appel dépendante du poste, du rôle et de l'Intelligence.
- Les passes vers un joueur en appel gagnent de l'utility.
- Les passes immédiates après une réception sont légèrement découragées.
- La progression balle au pied est davantage valorisée.
- Les dribbles sont comptabilisés dans les statistiques.
- Les appels progressifs sont comptabilisés.
- Les duels gagnés sont comptabilisés.
- Le perdant d'un duel subit un court état de déséquilibre.
- Un joueur déséquilibré se déplace beaucoup plus lentement et ne peut pas
  immédiatement déclencher un nouveau duel.
- Les tirs restent en transit plus longtemps pour être visibles.
- Replay porté de 0,5 s à 0,2 s entre snapshots.
- Le gardien réagit spatialement au tir.
- Les arrêts peuvent être captés ou repoussés.
- Un arrêt repoussé génère un ballon libre.

## Analyse

- `simulateMatch({ recordReplay: false })`.
- Endpoint `POST /api/analytics/monte-carlo`.
- Page `/analytics`.
- Agrégation Monte-Carlo.
- Expériences appariées de sensibilité des six stats.
- Comparaison des rôles configurés contre tous les rôles sur `NORMAL`.

## Calibration rapide de développement

Sur 30 matchs de smoke test avec les deux équipes de démonstration :

- environ 4,2 buts par match ;
- environ 35,7 tirs par match ;
- environ 164,5 passes tentées par match ;
- environ 121 progressions/dribbles par match ;
- environ 150 appels progressifs déclenchés par match ;
- environ 17,4 duels gagnés par match.

Ces chiffres servent uniquement de contrôle de fonctionnement. Ils ne sont pas
considérés comme l'équilibrage cible.
