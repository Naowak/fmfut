# FUT Manager Simulator — V0.3

## Moteur

- Les passes ne donnent plus automatiquement la possession au receveur ou à un intercepteur prédéterminé.
- Une passe crée désormais une balle libre avec :
  - position ;
  - vélocité ;
  - décélération ;
  - erreur de direction ;
  - erreur de dosage.
- Le ballon continue sa course jusqu'à être contrôlé ou jusqu'à s'arrêter.
- Les joueurs les plus proches courent vers le point d'arrêt prédit.
- La prise de contrôle n'est possible qu'à courte distance réelle de la trajectoire.
- Un mauvais contrôle ralentit et dévie légèrement la balle au lieu de téléporter la possession.
- Les rebonds de gardien produisent également une balle libre en mouvement.
- Les gardiens ne peuvent plus être sélectionnés automatiquement pour remplacer un joueur de champ.

## Équilibrage

- Réduction forte de la fatigue : coût de déplacement 8.5 -> 3.5.
- Seuil de remplacement automatique conservateur : 42 d'énergie après la 65e minute affichée.
- Réduction de l'influence de l'Intelligence sur la température de décision.
- Tir : influence principalement l'exécution et beaucoup moins la décision de tenter un tir.
- Passe : influence directement précision, dosage et première touche.
- Technique : poids réduit dans le choix de dribbler ; reste importante pour contrôle et résistance au duel.
- Vitesse : impact supplémentaire dans les duels de poursuite/échappée.
- Physique : poids renforcé dans les duels et conserve son effet sur la fatigue.
- Rôles individuels atténués afin d'éviter qu'ils dominent les statistiques individuelles.

## Viewer

- Terrain affiché verticalement dans une mise en page horizontale.
- L'équipe HOME, représentant le joueur, est toujours affichée en bas et attaque vers le haut.
- Commentaires du match dans une colonne à droite.
- Statistiques complètes sous le match.
- Bleu pour l'équipe du joueur et rouge pour l'adversaire par défaut.
- Huit couleurs sélectionnables indépendamment pour les deux équipes.
- Notifications de remplacement visibles plusieurs secondes en haut à gauche/droite du terrain.
- Balle toujours blanche.

## Analytics

- Ajout de l'énergie moyenne finale des titulaires au dashboard Monte-Carlo.
- Cette métrique sert à calibrer quantitativement la fatigue.
