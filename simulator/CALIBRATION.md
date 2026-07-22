# Calibration Monte-Carlo et statistiques individuelles

Cette couche sert à détecter les régressions du moteur et à préparer des
indicateurs compréhensibles pour les futurs choix d'effectif. Les fourchettes
actuelles sont des objectifs internes de gameplay V1, pas des affirmations sur
les moyennes du football professionnel réel.

## Lancer une cohorte

```bash
npm run calibrate:match -- 500 --compact
```

`--summary` limite la sortie aux distributions et garde-fous. Sans option, le
rapport inclut aussi tous les profils joueurs. Jusqu'à
5 000 matchs peuvent être demandés. Chaque match utilise une seed déterministe,
ne génère aucun frame de replay et vérifie les invariants comptables.

## Niveaux de tests

1. Invariants par match : score, possession, tirs, passes, discipline et sommes
   joueurs/équipe.
2. Distributions : moyennes, écart-type, minimum, p05, médiane, p95 et maximum.
3. Symétrie : deux XI identiques ne doivent pas produire de biais de côté net.
4. Stabilité : deux familles de seeds doivent donner des ordres de grandeur
   proches.
5. Sensibilité : un XI réellement supérieur doit améliorer significativement
   le différentiel de buts avec les mêmes seeds.
6. Micro-benchmarks : un bonus sur chacune des six statistiques doit améliorer
   directement la capacité concernée.
7. Signatures par poste : les gardiens, attaquants, milieux et ailiers doivent
   produire des profils distincts et cohérents.

La suite ciblée s'exécute avec :

```bash
npm run test:calibration
```

## Statistiques individuelles

`MatchSimulationOutput.playerStats` est alimenté même avec
`recordReplay=false`. Il contient notamment :

- minutes jouées et statut titulaire ;
- distance parcourue en longueurs de terrain normalisées ;
- touches et énergie finale ;
- buts, passes décisives, tirs et tirs cadrés ;
- passes tentées/réussies et taux de réussite ;
- dribbles et appels progressifs ;
- tacles, interceptions, duels et récupérations ;
- fautes, cartons et hors-jeu ;
- arrêts des gardiens.

Les profils Monte-Carlo agrègent ces données par joueur et par poste en valeurs
par 90 minutes. La fiabilité vaut `LOW` sous 270 minutes, `MEDIUM` entre 270 et
900, puis `HIGH`. Cette information devra toujours accompagner une future
recommandation : un remplaçant performant sur quelques minutes ne doit pas être
présenté comme une certitude.

## Baseline observée

La cohorte `calibration-v09` de 200 matchs produit actuellement environ :

- 2,96 buts par match ;
- 18,2 tirs ;
- 124,9 passes tentées ;
- 2,33 fautes et 0,65 carton ;
- un différentiel domicile moyen de +0,17 but ;
- aucune violation d'intégrité.

Point de vigilance : le ST concentre encore fortement les tirs et les buts,
tandis que les ailiers dominent surtout la progression. Ce comportement est
désormais mesuré explicitement et devra être arbitré avant de transformer les
profils en conseils de recrutement.
