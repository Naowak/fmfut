# Provenance et licence du dataset

La base `players.db` est construite depuis `fut_players.csv`, un export de
données de joueurs de type EA FC/FIFA. Le fichier source contient 18 405
joueurs et les attributs nécessaires au calcul des six statistiques FUT
Manager.

## Statut actuel

- Provenance technique : fichier source local `dataset/fut_players.csv`.
- Empreinte SHA-256 : enregistrée dans la table `dataset_metadata` lors de
  chaque reconstruction.
- Licence d'exploitation : **non vérifiée**.
- Usage recommandé : prototype, recherche et développement local uniquement.

La présence du fichier dans le dépôt ne constitue pas une preuve de droit de
redistribution ou d'exploitation commerciale. Avant une publication publique,
il faudra identifier la source exacte, conserver sa notice de licence et
vérifier les droits relatifs aux noms, notes et autres données.

Le script de packaging refuse par défaut toute base dont le statut n'est pas
`verified-redistributable`. Ce verrou ne remplace pas une validation juridique :
il empêche simplement une publication accidentelle du dataset actuel.

Lorsqu'une source et ses droits auront été confirmés, reconstruire la base avec :

```bash
python dataset/build_players_db.py source.csv dataset/players.db --replace \
  --source-url https://exemple/source \
  --license-status verified-redistributable \
  --license-name "Nom de la licence" \
  --license-url https://exemple/licence
```

## Reproductibilité

La table `dataset_metadata` conserve :

- `schema_version` ;
- `source_filename` ;
- `source_sha256` ;
- `player_count` ;
- `nationality_count` ;
- `license_status`.

Une base déclarée redistribuable doit également contenir `source_url`,
`license_name` et `license_url`.

La recherche textuelle repose sur l'index FTS5 `players_fts`, reconstruit à la
fin de chaque import.
