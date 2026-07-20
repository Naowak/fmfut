# V0.4 — Bloc dynamique, viewer responsive et analytics spatiales

## Moteur

- La possession devient un état d'équipe persistant pendant les passes physiques et les ballons en transit.
- Le bloc de formation est désormais transformable : avance/recul longitudinal, largeur, profondeur et suivi latéral du ballon.
- Transition progressive après perte/récupération : le bloc ne se replie pas instantanément, ce qui laisse des fenêtres de contre-attaque.
- Hors-jeu simplifié basé sur le ballon et le deuxième dernier adversaire.
- Les appels sont ajustés à la ligne de hors-jeu selon l'Intelligence, avec possibilité d'erreur.
- Trois fenêtres de rotation automatiques par défaut (62e, 72e, 82e), en plus des blessures et fatigues critiques.
- Statistiques ajoutées : hors-jeu, changements, tirs en transition rapide, récupérations de possession.
- Rééquilibrage des six statistiques : les six boosts +10 ont un effet positif sur le différentiel de buts lors du run de contrôle final ; Intelligence reste la plus influente.
- La stat Physique n'augmente plus artificiellement la probabilité de faute.

## Viewer

- Score déplacé au-dessus du terrain pour ne plus masquer le but adverse.
- Taille maximale du terrain réglable de 400 à 760 px depuis la toolbar.
- Pause visuelle de 2,6 secondes et animation centrale lors d'un but.
- Les notifications de remplacement restent visibles plusieurs secondes.
- Palette de couleurs d'équipes conservée, bleu/rouge par défaut.
- Layout vertical conservé : équipe HOME en bas, attaque vers le haut, commentaires à droite, statistiques en dessous.

## Balance Lab

- Heatmaps 8 × 12 de tous les joueurs ou filtrées par poste.
- Heatmaps dans un repère commun : notre but en bas, but adverse en haut.
- Mesures spatiales : centre du bloc, profondeur, largeur, hauteur de la ligne défensive, joueurs dans la moitié adverse.
- Séparation largeur/centre avec possession et sans possession.
- Amplitude et volatilité du centre de bloc.
- Réussite des passes et conversion des tirs.
- Tirs en transition rapide et récupérations de possession.
- Nombre moyen de remplacements et de hors-jeu.

## Contrôle final effectué

- `npm run typecheck` : OK
- `npm run build` : OK
- Monte-Carlo 100 matchs, run de contrôle avant dernier micro-ajustement : environ 2,25 buts/match, 3 changements par équipe et 57% d'énergie moyenne restante chez les titulaires.
- Sensibilité +10 sur 100 matchs : les six statistiques ressortent positives ; Intelligence reste volontairement la statistique signature.
