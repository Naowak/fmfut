# FUT Manager — Next.js 2D Match Simulator V0.9

Prototype de moteur de match pour le projet FUT Manager.

Version moteur : **0.9.0**. Contrat public : **1.0.0**.

## Architecture

Le principe est volontairement strict :

```text
CSV joueurs
    ↓
Route Handler Next.js (serveur)
    ↓
simulateMatch(...)
    ↓
résultat + statistiques + événements + replay
    ↓
JSON
    ↓
Canvas React côté client
```

Le navigateur **ne calcule jamais le résultat du match**.

Il reçoit un replay terminé et l'interpole visuellement.

Même équipe + même configuration + même seed = même match.

Les modules applicatifs importent le moteur depuis `lib/game/index.ts`. Les
fichiers internes, notamment `engine.ts`, ne constituent pas une API publique.

Les requêtes HTTP sont validées au runtime. Une entrée invalide renvoie un
statut `400` accompagné d'une liste d'erreurs structurée.

## Stack

- Next.js 16.2
- React 19.2
- TypeScript
- Node.js 22.13 minimum (`node:sqlite`)
- App Router
- Route Handler `POST /api/matches/simulate`
- Canvas 2D natif
- `csv-parse` pour lire le CSV joueurs

## Installation

```bash
npm install
npm run dev
```

## Validation

```bash
npm run test:all
npm run build
```

La suite couvre actuellement le déterminisme, les bornes spatiales, l'absence
de valeurs non finies, la cohérence buts/score, la limite de remplacements et la
validation des compositions. Le pipeline Python dispose de ses propres tests
de reconstruction SQLite.

Puis ouvrir :

```text
http://localhost:3000
```

## Source de joueurs

Par défaut, le serveur utilise la base complète `../dataset/players.db`, soit
18 405 joueurs. Le chemin peut être remplacé par :

```bash
PLAYERS_DB_PATH=/chemin/absolu/players.db npm run dev
```

Si la base SQLite n'est pas disponible, le serveur utilise explicitement le
petit CSV de démonstration `data/players.csv`.

### Forcer une source CSV

`PLAYERS_CSV_PATH` reste disponible comme override prioritaire :

Le format attendu est exactement :

```text
player_id
short_name
long_name
nationality_name
primary_position
alternative_positions_json
overall
potential
speed
shooting
passing
physical
technique
intelligence
```

```bash
PLAYERS_CSV_PATH=/chemin/absolu/players_normalized.csv npm run dev
```

## API joueurs

`GET /api/players` expose une recherche SQLite paginée. Filtres disponibles :

- `query`
- `position`
- `nation`
- `minOverall` / `maxOverall`
- `page` / `pageSize` (100 maximum)

Exemple :

```text
/api/players?query=Mbapp%C3%A9&position=ST&page=1&pageSize=20
```

## Simulation côté serveur

Endpoint :

```text
POST /api/matches/simulate
```

Payload minimal :

```json
{
  "seed": "demo-42"
}
```

La route charge les joueurs, construit les deux équipes de démonstration puis appelle :

```ts
simulateMatch({
  home,
  away,
  players,
  seed,
})
```

Le retour contient :

```ts
{
  result,
  stats,
  notifications,
  replay
}
```

## Replay

Par défaut :

- 90 minutes affichées
- 360 secondes logiques
- pas physique : 0,2 s
- décision IA : 1 s
- snapshot replay : 0,2 s

À vitesse ×1, le replay complet dure donc environ 6 minutes réelles.

Le client interpole les snapshots pour obtenir une animation fluide.

## IA actuellement implémentée

Le prototype contient déjà :

- positions d'ancrage en 4-3-3 ;
- mouvement avec et sans ballon ;
- phases possession / défense simplifiées ;
- pressing du joueur le plus proche ;
- rôles :
  - DEFENSIVE
  - NORMAL
  - OFFENSIVE
  - CREATOR
  - PRESSING
- tactique collective :
  - bloc LOW / NORMAL / HIGH
  - construction SHORT / BALANCED / DIRECT
- passes ;
- risque d'interception ;
- ballon libre ;
- dribble ;
- tirs ;
- gardiens ;
- buts ;
- tacles ;
- fautes ;
- jaunes ;
- deux jaunes ;
- rouges ;
- blessures ;
- fatigue ;
- remplacements automatiques ;
- synergie de nationalité entre voisins tactiques ;
- malus de poste principalement appliqué à l'Intelligence.

## Intelligence et température

Le choix des actions utilise un softmax.

La température dépend de l'Intelligence effective :

```ts
T =
  T_min +
  (1 - Intelligence / 100) ** gamma *
  (T_max - T_min)
```

Un joueur intelligent sélectionne donc beaucoup plus souvent les actions ayant
la meilleure utility.

La réussite technique de l'action est ensuite calculée séparément.

Exemple :

```text
Intelligence -> quelle passe choisir ?
Passe + Technique -> est-ce que la passe réussit ?
```

## Synergie

Une formation est un graphe de slots.

Exemple :

```text
LCM est voisin de :
LB
CDM
RCM
LW
ST
```

Chaque voisin actif de même nationalité donne actuellement :

```text
+2 Intelligence
```

avec un cap à :

```text
+6
```

## Hors poste

Le joueur conserve sa Vitesse.

Le malus principal touche l'Intelligence.

Les stats Passe et Technique reçoivent seulement un petit malus.

La matrice est dans :

```text
lib/game/compatibility.ts
```

## Équipes

Les deux équipes de démonstration sont définies dans :

```text
lib/game/sample-teams.ts
```

Le format est déjà pensé pour être remplacé par le futur écran de composition :

```ts
{
  name,
  formationId,
  starters: {
    GK: playerId,
    LB: playerId,
    ...
  },
  bench: [playerId, ...],
  roles: {
    ST: "OFFENSIVE",
    CDM: "DEFENSIVE"
  },
  tactics: {
    blockHeight: "NORMAL",
    buildUp: "BALANCED"
  }
}
```

Tu peux également envoyer `home` et `away` directement dans le POST de
simulation.

## Fichiers importants

### `lib/game/engine.ts`

Le moteur complet.

Aucune dépendance React ou Canvas.

C'est cette fonction qui devra devenir le coeur stable du jeu.

Les types runtime, primitives géométriques et analytics spatiales sont
désormais isolés dans `runtime.ts`, `geometry.ts` et
`spatial-analytics.ts`. La gestion des remplacements et le recalcul de
synergie vivent dans `substitutions.ts`. Les consommateurs utilisent
uniquement `index.ts`.

### `lib/data/player-repository.ts`

Repository SQLite en lecture seule : chargement canonique complet, recherche,
filtres et pagination.

### `lib/game/config.ts`

Tous les paramètres généraux de simulation.

### `lib/game/compatibility.ts`

Matrice hors poste et calcul des stats effectives.

### `lib/game/formations.ts`

Formation 4-3-3, coordonnées et graphe de synergie.

### `lib/game/rng.ts`

PRNG déterministe.

### `app/api/matches/simulate/route.ts`

Frontière serveur.

### `components/PitchCanvas.tsx`

Viewer uniquement.

Il ne décide de rien concernant le match.

## Important pour la suite

Ce moteur est une **V0 jouable et architecturale**, pas encore un modèle de
football équilibré.

La prochaine étape recommandée est de construire un script Monte-Carlo qui
simule 1 000 à 100 000 matchs sans replay et mesure :

- buts par match ;
- tirs ;
- tirs cadrés ;
- passes ;
- possession ;
- influence réelle de chaque stat ;
- avantage d'une formation ;
- impact de l'Intelligence ;
- impact des rôles ;
- fatigue ;
- fréquence des cartons et blessures.

Le moteur est volontairement séparé de Next.js pour rendre cette étape facile.


---

## Version 0.2 — mouvement, tirs et duels

Cette version corrige quatre limites observées sur la première V0.

### 1. Appels et liberté sans ballon

Les joueurs offensifs ne restent plus simplement collés à leur ancre de formation.

Le moteur crée maintenant des **intentions d'appel persistantes** :

```text
runTarget
runUntil
```

Un appel dure plusieurs secondes logiques. Pendant cet intervalle, la cible de
déplacement du joueur n'est plus son ancre mais une zone plus profonde.

Le nombre d'appels simultanés est limité afin de conserver une structure
collective.

Les probabilités dépendent notamment :

- du poste ;
- du rôle ;
- de l'Intelligence effective.

Un joueur en appel reçoit également un bonus d'utility lorsqu'un porteur évalue
une passe progressive vers lui.

### 2. Davantage de conduite de balle

L'utility du dribble/progression a été renforcée et une courte pénalité est
appliquée aux passes immédiatement après la prise de contrôle du ballon.

Le but est d'éviter :

```text
réception -> passe instantanée -> réception -> passe instantanée
```

et d'obtenir davantage de séquences :

```text
réception
-> contrôle
-> progression
-> appel d'un partenaire
-> passe ou tir
```

### 3. Tirs visibles

Les tirs utilisent toujours l'état `TRANSIT`, comme les passes, mais :

- leur durée minimale a été augmentée ;
- le replay enregistre maintenant un frame toutes les 0,2 secondes ;
- le gardien se déplace vers la trajectoire estimée ;
- un arrêt peut être capté ou repoussé.

États possibles :

```text
GOAL
SAVE_CATCH
SAVE_REBOUND
MISS
```

Un `SAVE_REBOUND` crée un ballon libre autour du gardien.

### 4. Déséquilibre après duel

Un joueur qui perd un duel reçoit maintenant un court état :

```text
stunnedUntil
```

Pendant ce temps :

- sa vitesse est fortement réduite ;
- il ne peut pas immédiatement reprendre le ballon ;
- le vainqueur peut créer quelques mètres de séparation.

Cela évite les échanges de possession instantanés entre deux joueurs collés,
notamment entre un attaquant et un gardien.

### 5. Joueurs plus rapides

Les vitesses de déplacement normalisées ont été augmentées dans :

```text
lib/game/config.ts
```

Les nouvelles valeurs de départ sont :

```text
minSpeedPerLogicalSecond: 0.022
maxSpeedPerLogicalSecond: 0.055
```

Elles restent entièrement configurables.

---

## Balance Lab — Monte-Carlo headless

Une nouvelle page est disponible :

```text
http://localhost:3000/analytics
```

Elle appelle :

```text
POST /api/analytics/monte-carlo
```

Les matchs analytiques utilisent :

```ts
recordReplay: false
```

Le moteur ne génère donc ni snapshots Canvas ni journal d'événements complet.

Le dashboard mesure actuellement :

- buts par match ;
- win rate / draw rate ;
- tirs ;
- passes ;
- dribbles ;
- appels progressifs ;
- duels gagnés ;
- possession.

### Sensibilité des six stats

Le dashboard peut lancer six expériences appariées.

Pour chaque statistique :

```text
Vitesse
Tir
Passe
Physique
Technique
Intelligence
```

le moteur :

1. reprend exactement la même série de seeds ;
2. applique `+10` à cette stat sur le onze domicile ;
3. rejoue la série ;
4. mesure le delta de différentiel de buts ;
5. mesure le delta de taux de victoire.

Les joueurs boostés reçoivent des IDs runtime synthétiques dans l'expérience,
afin qu'un joueur présent dans les deux équipes ne soit pas boosté des deux côtés.

### Expérience sur les rôles

Le Balance Lab compare également :

```text
rôles configurés
vs
tous les rôles domicile = NORMAL
```

avec les mêmes seeds.

### Formations

La comparaison automatique de formations n'est pas encore active car le moteur
V0.2 ne contient qu'un 4-3-3. Le runner est prévu pour accueillir cette
expérience dès que plusieurs formations sont disponibles.

---

## V0.3 — balle physique et nouvelle présentation

La V0.3 remplace la résolution instantanée des passes par une balle physique simplifiée.

Une passe possède maintenant une vitesse et une décélération. Le moteur calcule une erreur de direction et de dosage dépendant principalement de `passing`, puis les joueurs doivent réellement rejoindre la trajectoire de balle pour en prendre le contrôle.

Le viewer pivote le repère du moteur sans modifier la simulation : l'équipe `HOME` apparaît en bas de l'écran et attaque vers le haut. Les commentaires sont placés à droite, et les statistiques sous le terrain.

Les couleurs des équipes sont configurables dans le viewer parmi huit choix. Le réglage par défaut est bleu pour l'équipe du joueur et rouge pour l'adversaire.

Le Balance Lab expose maintenant l'énergie moyenne finale des titulaires pour suivre le calibrage de la fatigue.

## V0.6

La V0.6 corrige la construction basse et le viewer :

- réduction des passes arrière sans intérêt ;
- back-pass au gardien sécurisée et contrôlée au pied ;
- métriques Monte-Carlo dédiées aux passes arrière/remises au gardien/CSC ;
- lecture ×2 par défaut ;
- gardiens visuellement distincts ;
- overlays d'événements responsives ;
- affichage du but volontairement plus iconique ;
- timing des overlays décalé après l'action visuelle correspondante.


## Nouveautés V0.7

- Boutons de saut `+1s / +2s / +5s / +10s` dans le replay.
- Joueurs 20 % plus rapides.
- Correction complète du placement des gardiens sur penalty.
- Interface du simulateur retravaillée pour servir de viewer principal.
- Balance Lab : erreur standard sur la sensibilité globale et micro-benchmarks isolés des six statistiques.

Voir `CHANGELOG_V0.7.md` pour le détail.


## V0.8 — replay et stabilité

La V0.8 ajoute :

- navigation temporelle avant/arrière par pas de 1, 2, 5 et 10 secondes ;
- commentaires cliquables pour seek directement vers un événement ;
- vitesses d'affichage `×0.5`, `×1`, `×2`, `×4` ;
- joueurs environ 20 % plus rapides que la V0.7 ;
- changements automatiques uniquement lors des arrêts de jeu ;
- rayon de duel réduit ;
- correction du deadlock d'une balle libre immobilisée extrêmement près d'une ligne ;
- badge de confiance dans le Balance Lab pour distinguer signal global et bruit Monte-Carlo.


## V0.9 — règles spatiales et sorties visibles

- sorties de balle visibles avant déclaration du corner, de la touche ou du six mètres ;
- scène conservée pendant l'arrêt, puis repositionnement juste avant la remise ;
- anti-enfermement des ailiers près du drapeau de corner ;
- coups d'envoi conformes : chaque équipe dans sa moitié et adversaires hors du rond central ;
- gardiens plus conservateurs et sorties conditionnées à un avantage réel sur les défenseurs ;
- léger resserrement de l'impact global d'Intelligence et Technique.
