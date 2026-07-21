# FUT Manager

Prototype de jeu navigateur de management/collection football, centré sur la
composition d'équipe, la tactique pré-match et un moteur 2D déterministe.

## Structure

- `dataset/` : import du CSV source, calcul des six statistiques et base SQLite ;
- `simulator/` : moteur de match, viewer 2D et Balance Lab ;
- `fut_manager_game_design_v1.pdf` : spécification produit et technique ;
- `fut_manager_simulator_v0.9_handoff_report.pdf` : état de la baseline V0.9.

## Validation complète

```bash
cd simulator
npm run test:all
npm run build
```

Le moteur public est exposé par `simulator/lib/game/index.ts`. Les composants,
API et futurs modules produit ne doivent pas importer directement
`engine.ts`.

La base complète est consultable via `GET /api/players`. En local, le
simulateur détecte automatiquement `dataset/players.db`; `PLAYERS_DB_PATH`
permet de fournir un autre emplacement en production.

## Petite note de travail, patch à faire plus tard

- La fin d'une mi-temps ne doit pas intervenir pile lorsque le chrono atteint le temps. Il doit attendre la fin de l'action. On peut simplement vérifié où le ballon se situe, en donnant des position limit sur l'axe longueur.
- Une README adapté qui s'update à chaque nouvelle version à la racine du projet
