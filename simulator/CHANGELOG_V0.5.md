# V0.5 — Règles physiques, sorties de balle et coups de pied arrêtés

## Objectif

Cette version remplace plusieurs résolutions probabilistes abstraites par des règles basées sur la position réelle du ballon.

## Ballon et prises de possession

- La balle libre est intégrée avec des sous-pas physiques (`ballSubstep`) plus fins que le pas principal du moteur.
- Un joueur ne peut contrôler la balle que si elle est réellement dans son rayon de contrôle au sous-pas courant.
- La détection par segment qui pouvait attribuer une balle encore visuellement éloignée a été supprimée.
- Lors d'une première touche, la balle conserve brièvement son point de contact relatif au joueur puis se rapproche progressivement de ses pieds : disparition du petit « snap » visuel vers le centre du joueur.
- Une passe part désormais de la position réelle de la balle contrôlée, et non systématiquement du centre géométrique du joueur.

## Tirs et buts

- Suppression du résultat pré-calculé `GOAL / SAVE / MISS` au déclenchement du tir.
- Un tir définit uniquement :
  - une direction ;
  - une dispersion liée à Tir + Technique ;
  - une vitesse initiale ;
  - une décélération.
- Un but n'est validé que si la trajectoire physique du ballon traverse une ligne de but entre les deux poteaux.
- Un tir qui traverse la ligne hors des poteaux produit un six mètres ou un corner selon le dernier joueur ayant touché le ballon.
- Un gardien ne peut arrêter le ballon que s'il atteint réellement la trajectoire.
- Le gardien reçoit une accélération contextuelle pendant un tir, représentant réflexes et détente, mais aucun arrêt n'est téléporté ou décidé à distance.
- Le gardien peut capter ou repousser selon sa position, sa qualité et la vitesse de la balle.
- Les défenseurs placés sur la trajectoire peuvent contrer physiquement un tir.

## Sorties de balle

Ajout des limites réelles du terrain :

- touche ;
- corner ;
- six mètres ;
- but uniquement entre les poteaux.

La balle n'est plus renvoyée artificiellement à l'intérieur du terrain lorsqu'elle franchit une ligne.

## Coups de pied arrêtés

Ajout des restarts :

- touche ;
- corner ;
- six mètres ;
- coup franc ;
- penalty ;
- coup d'envoi après but.

À chaque arrêt :

1. le ballon devient mort ;
2. le jeu actif s'arrête ;
3. les joueurs peuvent être totalement repositionnés ;
4. un tireur est sélectionné ;
5. le restart est exécuté physiquement.

### Coup franc

Un coup franc proche du but peut être joué directement.

La défense forme alors un mur de 3 à 5 joueurs entre le ballon et le but. Le mur est constitué de vrais joueurs : un tir peut réellement les toucher et être dévié.

### Penalty

- tireur choisi parmi les meilleurs tireurs actifs ;
- gardien replacé sur sa ligne ;
- autres joueurs hors de la zone ;
- résolution par la même physique de tir que le jeu ouvert.

Aucun tirage direct de probabilité de but n'est effectué.

## Temps additionnel

- Le match est désormais composé de deux périodes logiques distinctes.
- Les arrêts de jeu alimentent un temps additionnel propre à chaque mi-temps.
- Le temps additionnel est annoncé par un événement `ADDED_TIME`.
- Le replay expose le temps additionnel moyen des deux périodes.
- L'horloge affiche `45+N` et `90+N` pendant les périodes additionnelles.

## Replay / UX

Le lecteur marque désormais explicitement et ralentit/pause brièvement, même en ×4, sur :

- but ;
- penalty ;
- corner ;
- coup franc ;
- touche ;
- six mètres ;
- hors-jeu ;
- changement ;
- blessure ;
- carton jaune ;
- carton rouge ;
- mi-temps ;
- annonce du temps additionnel.

Après un but, la scène du ballon ayant franchi la ligne est conservée pendant la célébration avant le repositionnement du coup d'envoi.

## Monte-Carlo

Nouvelles métriques :

- touches / match ;
- corners / match ;
- six mètres / match ;
- coups francs / match ;
- penalties / match ;
- arrêts gardien / match ;
- temps additionnel moyen par mi-temps.

La sensibilité des six stats affiche maintenant également un indicateur direct :

- Passe → variation du taux de passes réussies ;
- Tir → variation de conversion des tirs ;
- Vitesse → variation des tirs en transition ;
- Physique → variation des duels gagnés ;
- Technique → variation du taux de passes réussies ;
- Intelligence → variation des hors-jeu évités.

Cela évite de juger une stat uniquement sur le différentiel de buts, mesure très chaotique dans un moteur déterministe à embranchements.
