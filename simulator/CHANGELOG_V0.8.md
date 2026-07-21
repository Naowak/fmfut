# V0.8

## Correctifs moteur

- Correction d'un deadlock de balle libre près des lignes : les joueurs peuvent désormais rejoindre physiquement une balle arrêtée jusque très près de la touche/ligne de but.
- Rayon d'engagement des duels réduit à `0.020`.
- Lors d'un tacle gagné, la balle conserve son point de contact physique au lieu de sauter au centre du défenseur.
- Vitesse des joueurs augmentée de 20 % supplémentaires.
- Coût énergétique légèrement réduit pour compenser l'augmentation de distance parcourue.
- Rotations et changements automatiques planifiés uniquement pendant un arrêt de jeu.
- Les remplacements pour blessure sont mis en attente jusqu'au prochain arrêt quand l'action continue.

## Replay / UX

- Vitesses renommées :
  - ancien ×1 -> ×0.5
  - ancien ×2 -> ×1
  - ancien ×4 -> ×2
  - nouveau ×4
- Boutons `-1s`, `-2s`, `-5s`, `-10s`.
- Conservation des boutons `+1s`, `+2s`, `+5s`, `+10s`.
- Les commentaires du fil de match sont cliquables pour revenir directement à leur timestamp.
- Les overlays d'événements peuvent être rejoués après un seek manuel.

## Balance Lab

- Ajout d'un badge de confiance sur les sensibilités globales :
  - `signal global net`
  - `signal global bruité`
- Le badge utilise approximativement le seuil 95 % (`|delta| >= 1.96 × erreur standard`).
- Les micro-benchmarks restent la référence pour vérifier la monotonie directe de chaque statistique.
