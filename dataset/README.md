# FUT Manager — Player Database Builder

Pipeline minimal pour transformer un CSV FIFA / EA FC en base SQLite exploitable par le moteur de jeu.

## Résultat

La base contient notamment :

- identité du joueur ;
- nationalité ;
- poste principal ;
- postes alternatifs simplifiés ;
- 6 statistiques FUT Manager :
  - `speed`
  - `shooting`
  - `passing`
  - `physical`
  - `technique`
  - `intelligence`
- sous-statistiques sources utiles au recalcul, stockées en JSON ;
- métadonnées FIFA de version/update.

Les clubs sont volontairement ignorés dans la base de gameplay.

## Prérequis

Python 3.10+.

Aucune dépendance externe.

## Construire la base

```bash
python dataset/build_players_db.py chemin/vers/players.csv dataset/players.db --replace
```

Le statut de licence reste `unverified` par défaut. Les options de provenance
et de licence sont documentées dans `SOURCE_AND_LICENSE.md`; ne pas utiliser le
statut `verified-redistributable` sans vérification réelle des droits.

Si le CSV contient plusieurs versions FIFA :

```bash
python dataset/build_players_db.py players.csv dataset/players.db --fifa-version 26 --replace
```

Pour tester sur un petit sous-ensemble :

```bash
python dataset/build_players_db.py players.csv test.db --limit 1000 --replace
```

Pour ne conserver que les joueurs avec un overall source >= 60 :

```bash
python dataset/build_players_db.py players.csv dataset/players.db --min-overall 60 --replace
```

## Inspecter la base

Top 20 :

```bash
python dataset/inspect_players_db.py dataset/players.db
```

Uniquement les ST :

```bash
python dataset/inspect_players_db.py dataset/players.db --position ST
```

Joueurs français :

```bash
python dataset/inspect_players_db.py dataset/players.db --nation France
```

## Réexporter en CSV

```bash
python dataset/export_players_csv.py dataset/players.db players_normalized.csv
```

Les variantes explicites `--db-path` et `--output-csv` sont également acceptées.

## Tests

Depuis la racine du projet :

```bash
python3 -m unittest discover -s dataset/tests -p 'test_*.py'
```

## Modifier les formules

Toutes les formules se trouvent dans :

```text
stat_formulas.py
```

Il suffit de modifier les poids puis de reconstruire la base.

Les poids sont automatiquement renormalisés lorsqu'une sous-stat manque.

## Mapping des postes

Le mapping FIFA -> FUT Manager se trouve dans :

```text
positions.py
```

Exemples :

- `LWB -> LB`
- `RWB -> RB`
- `LCM / RCM -> CM`
- `LDM / RDM -> CDM`
- `LAM / RAM / CF -> CAM`
- `LF -> LW`
- `RF -> RW`
- `LS / RS -> ST`

Le premier poste mappé devient le poste principal.
Les suivants deviennent les postes naturels alternatifs.

## Déduplication

Si plusieurs lignes ont le même `player_id`, le script conserve automatiquement
celle ayant la clé de mise à jour la plus récente construite à partir de :

1. `fifa_update_date`
2. `fifa_version`
3. `fifa_update`

## Schéma SQLite

Tables principales :

### `players`

Une ligne par joueur, avec les 6 stats de gameplay.

### `player_positions`

Une ligne par poste naturel simplifié du joueur.

Cela permet par exemple :

```sql
SELECT p.*
FROM players p
JOIN player_positions pp ON pp.player_id = p.player_id
WHERE pp.position = 'ST';
```

### `players_fts`

Index FTS5 des noms et nationalités, avec normalisation des diacritiques.

### `dataset_metadata`

Version de schéma, nom et SHA-256 de la source, volumes et statut de licence.
Voir `SOURCE_AND_LICENSE.md` avant toute utilisation publique.

## Philosophie des stats

### Joueurs de champ

- **Vitesse** : accélération + vitesse de pointe
- **Tir** : finition, puissance, tirs de loin, volées, penalties
- **Passe** : passe courte, vision, passe longue, centres, effet
- **Physique** : force, endurance, agressivité, détente, équilibre
- **Technique** : contrôle, dribble, agilité, équilibre, sang-froid
- **Intelligence** : réactions, sang-froid, vision, intelligence de placement, interceptions

Pour la composante de placement de l'Intelligence, on utilise :

```text
max(mentality_positioning, defending_marking_awareness)
```

Cela évite de pénaliser artificiellement un excellent attaquant parce que sa
conscience défensive est faible, ou un défenseur pour son placement offensif.

### Gardiens

Les gardiens ont les mêmes six stats publiques mais utilisent une formule dédiée
basée principalement sur leurs attributs `goalkeeping_*`.

## Évolution recommandée

Pour le moteur, ne jamais lire directement le CSV Kaggle.

Le flux recommandé est :

```text
CSV Kaggle
    ↓
build_players_db.py
    ↓
players.db
    ↓
repository SQLite en lecture seule
    ↓
API joueurs / moteur de match
```

Le CSV devient donc une source d'import, pas une dépendance runtime.
