# V0.6 — Construction basse & viewer d'événements

## Moteur

- Les passes très en retrait sont fortement pénalisées sauf sous pression réelle.
- Les passes au gardien deviennent une soupape de sécurité, pas une option de circulation normale.
- Une remise au gardien vise un point sûr devant lui, côté terrain, avec moins d'erreur de direction et de dosage.
- Le gardien anticipant une back-pass dispose d'un rayon de contrôle au pied spécifique.
- Ajout des métriques `backwardPasses`, `goalkeeperBackPasses` et `ownGoals`.
- Un CSC statistique n'est compté que pour une vraie passe de sa propre équipe finissant dans le but, pas pour une parade/déviation sur un tir adverse.
- Dispersion des tirs légèrement augmentée et intervention physique des gardiens recalibrée.

## Viewer

- Vitesse de lecture par défaut : ×2.
- Les gardiens sont affichés en losange avec une double bordure dorée tout en conservant la couleur de leur équipe.
- Nouveau bandeau compact pour les événements ordinaires.
- Nouveau traitement iconique dédié aux buts.
- Typographie responsive et centrage fiable sur petits écrans.
- Les overlays sont déclenchés avec un léger retard visuel pour ne plus annoncer l'événement avant que l'action correspondante soit visible.
- Les coups de pied arrêtés n'ajoutent plus un freeze artificiel au moment de la frappe : leur arrêt de jeu est déjà présent dans le replay moteur.

## Balance Lab

Nouvelles métriques :

- passes arrière ;
- remises au gardien ;
- buts contre son camp.

Contrôle interne sur 80 matchs :

- environ 5,7 passes arrière par équipe/match ;
- environ 0,1 remise au gardien par équipe/match ;
- aucun CSC issu d'une back-pass observé ;
- conversion des tirs autour de 20–22 % avec les deux onze d'élite de démonstration.
