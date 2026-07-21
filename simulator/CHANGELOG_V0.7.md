# V0.7 — Viewer final, vitesse et diagnostic statistique

## Viewer

- Ajout de boutons `+1s`, `+2s`, `+5s`, `+10s` pour avancer directement dans le replay.
- Lecture toujours à ×2 par défaut, avec ×1 et ×4 disponibles.
- Refonte du bloc de contrôles et de la timeline.
- Scoreboard enrichi avec pastilles de couleur des équipes.
- Fil d’événements enrichi avec icônes contextuelles.
- Panneau de configuration plus propre avec statut du moteur.

## Vitesse des joueurs

- Vitesse minimale de déplacement : `0.022 -> 0.0264`.
- Vitesse maximale de déplacement : `0.055 -> 0.066`.
- Soit +20 % de vitesse joueur, sans modifier la vitesse du ballon.

## Penalties

- Correction du gardien de l’équipe qui tire le penalty : il n’est plus inclus dans le repositionnement collectif hors surface.
- Les deux gardiens sont explicitement replacés devant leur propre but avant le penalty.

## Balance Lab

- Ajout de l’erreur standard appariée sur les deltas de différentiel de buts.
- Ajout de micro-benchmarks isolés, 10 000 situations par statistique :
  - Vitesse : courses gagnées face à une référence Vitesse 75.
  - Tir : tirs cadrés.
  - Passe : passes contrôlables.
  - Physique : duels défensifs gagnés.
  - Technique : premiers contrôles réussis.
  - Intelligence : sélection de la meilleure décision.
- Objectif : distinguer le fonctionnement direct d’une statistique de son impact global, beaucoup plus chaotique, sur un match complet.

## Validation

- `npm run typecheck` OK.
- `npm run build` OK.
- Smoke test API match : engineVersion `0.7.0`.
- Smoke test Analytics : micro-benchmarks tous positifs lors d’un boost +10.
