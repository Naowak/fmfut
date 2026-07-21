#!/usr/bin/env python3
"""
Construit une base SQLite FUT Manager depuis un CSV FIFA / EA FC.

Usage :
    python build_players_db.py players.csv players.db

Options utiles :
    --fifa-version 26
    --min-overall 60
    --limit 1000
    --replace

Le script utilise uniquement la bibliothèque standard Python.
"""

from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
from pathlib import Path
from typing import Any

try:
    # Import package (`python -m dataset.build_players_db`).
    from .positions import map_positions, parse_source_positions
    from .stat_formulas import SOURCE_STAT_COLUMNS, calculate_game_stats
except ImportError:
    # Exécution directe documentée (`python dataset/build_players_db.py`).
    from positions import map_positions, parse_source_positions
    from stat_formulas import SOURCE_STAT_COLUMNS, calculate_game_stats


REQUIRED_COLUMNS = {
    "player_id",
    "short_name",
    "long_name",
    "player_positions",
    "nationality_name",
}


def to_int(value: Any) -> int | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"nan", "none", "null", "n/a"}:
        return None
    try:
        return int(float(text))
    except ValueError:
        return None


def source_sort_key(row: dict[str, str]) -> str:
    """
    Clé lexicographique pour déterminer la ligne la plus récente d'un joueur.
    Les dates ISO YYYY-MM-DD sont naturellement triables.
    """
    date = (row.get("fifa_update_date") or "").strip()
    update = to_int(row.get("fifa_update")) or 0
    version = to_int(row.get("fifa_version")) or 0
    return f"{date}|{version:04d}|{update:08d}"


def validate_columns(fieldnames: list[str] | None) -> None:
    if not fieldnames:
        raise ValueError("Le CSV n'a pas d'en-tête.")
    missing = REQUIRED_COLUMNS - set(fieldnames)
    if missing:
        raise ValueError(
            "Colonnes obligatoires manquantes : " + ", ".join(sorted(missing))
        )


def load_schema(conn: sqlite3.Connection, schema_path: Path) -> None:
    conn.executescript(schema_path.read_text(encoding="utf-8"))


def normalize_player(row: dict[str, str]) -> dict[str, Any] | None:
    player_id = to_int(row.get("player_id"))
    if player_id is None:
        return None

    source_positions = parse_source_positions(row.get("player_positions"))
    mapped_positions = map_positions(source_positions)

    if not mapped_positions:
        return None

    primary_position = mapped_positions[0]
    alternative_positions = mapped_positions[1:]
    is_goalkeeper = primary_position == "GK"

    try:
        game_stats = calculate_game_stats(row, is_goalkeeper=is_goalkeeper)
    except ValueError:
        return None

    source_stats = {
        column: to_int(row.get(column))
        for column in SOURCE_STAT_COLUMNS
    }

    return {
        "player_id": player_id,
        "short_name": (row.get("short_name") or "").strip() or f"Player {player_id}",
        "long_name": (row.get("long_name") or "").strip() or None,
        "nationality_id": to_int(row.get("nationality_id")),
        "nationality_name": (row.get("nationality_name") or "").strip() or "Unknown",
        "age": to_int(row.get("age")),
        "dob": (row.get("dob") or "").strip() or None,
        "height_cm": to_int(row.get("height_cm")),
        "weight_kg": to_int(row.get("weight_kg")),
        "preferred_foot": (row.get("preferred_foot") or "").strip() or None,
        "overall": to_int(row.get("overall")),
        "potential": to_int(row.get("potential")),
        "primary_position": primary_position,
        "alternative_positions_json": json.dumps(
            alternative_positions, ensure_ascii=False
        ),
        "source_positions_json": json.dumps(
            source_positions, ensure_ascii=False
        ),
        "mapped_positions": mapped_positions,
        "is_goalkeeper": int(is_goalkeeper),
        **game_stats,
        "fifa_version": (row.get("fifa_version") or "").strip() or None,
        "fifa_update": (row.get("fifa_update") or "").strip() or None,
        "fifa_update_date": (row.get("fifa_update_date") or "").strip() or None,
        "source_sort_key": source_sort_key(row),
        "source_stats_json": json.dumps(source_stats, ensure_ascii=False),
    }


UPSERT_PLAYER_SQL = """
INSERT INTO players (
    player_id,
    short_name,
    long_name,
    nationality_id,
    nationality_name,
    age,
    dob,
    height_cm,
    weight_kg,
    preferred_foot,
    overall,
    potential,
    primary_position,
    alternative_positions_json,
    source_positions_json,
    is_goalkeeper,
    speed,
    shooting,
    passing,
    physical,
    technique,
    intelligence,
    fifa_version,
    fifa_update,
    fifa_update_date,
    source_sort_key,
    source_stats_json,
    updated_at
)
VALUES (
    :player_id,
    :short_name,
    :long_name,
    :nationality_id,
    :nationality_name,
    :age,
    :dob,
    :height_cm,
    :weight_kg,
    :preferred_foot,
    :overall,
    :potential,
    :primary_position,
    :alternative_positions_json,
    :source_positions_json,
    :is_goalkeeper,
    :speed,
    :shooting,
    :passing,
    :physical,
    :technique,
    :intelligence,
    :fifa_version,
    :fifa_update,
    :fifa_update_date,
    :source_sort_key,
    :source_stats_json,
    CURRENT_TIMESTAMP
)
ON CONFLICT(player_id) DO UPDATE SET
    short_name = excluded.short_name,
    long_name = excluded.long_name,
    nationality_id = excluded.nationality_id,
    nationality_name = excluded.nationality_name,
    age = excluded.age,
    dob = excluded.dob,
    height_cm = excluded.height_cm,
    weight_kg = excluded.weight_kg,
    preferred_foot = excluded.preferred_foot,
    overall = excluded.overall,
    potential = excluded.potential,
    primary_position = excluded.primary_position,
    alternative_positions_json = excluded.alternative_positions_json,
    source_positions_json = excluded.source_positions_json,
    is_goalkeeper = excluded.is_goalkeeper,
    speed = excluded.speed,
    shooting = excluded.shooting,
    passing = excluded.passing,
    physical = excluded.physical,
    technique = excluded.technique,
    intelligence = excluded.intelligence,
    fifa_version = excluded.fifa_version,
    fifa_update = excluded.fifa_update,
    fifa_update_date = excluded.fifa_update_date,
    source_sort_key = excluded.source_sort_key,
    source_stats_json = excluded.source_stats_json,
    updated_at = CURRENT_TIMESTAMP
WHERE excluded.source_sort_key >= players.source_sort_key
"""


def replace_positions(
    conn: sqlite3.Connection,
    player_id: int,
    positions: list[str],
    source_sort_key_value: str,
) -> None:
    """
    Les positions ne sont remplacées que si la ligne courante correspond à la
    version effectivement conservée dans players.
    """
    row = conn.execute(
        "SELECT source_sort_key FROM players WHERE player_id = ?",
        (player_id,),
    ).fetchone()

    if not row or row[0] != source_sort_key_value:
        return

    conn.execute(
        "DELETE FROM player_positions WHERE player_id = ?",
        (player_id,),
    )
    conn.executemany(
        """
        INSERT INTO player_positions(player_id, position, priority, is_primary)
        VALUES (?, ?, ?, ?)
        """,
        [
            (player_id, position, priority, int(priority == 0))
            for priority, position in enumerate(positions)
        ],
    )


def build_database(
    csv_path: Path,
    db_path: Path,
    fifa_version: str | None,
    min_overall: int | None,
    limit: int | None,
    replace: bool,
) -> None:
    if replace and db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA foreign_keys = ON")

    schema_path = Path(__file__).with_name("schema.sql")
    load_schema(conn, schema_path)

    processed = 0
    inserted_or_seen = 0
    skipped = 0
    errors = 0

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        validate_columns(reader.fieldnames)

        for row_number, row in enumerate(reader, start=2):
            processed += 1

            if fifa_version is not None:
                if str(row.get("fifa_version", "")).strip() != str(fifa_version):
                    skipped += 1
                    continue

            overall = to_int(row.get("overall"))
            if min_overall is not None and (
                overall is None or overall < min_overall
            ):
                skipped += 1
                continue

            try:
                player = normalize_player(row)
                if player is None:
                    skipped += 1
                    continue

                conn.execute(UPSERT_PLAYER_SQL, player)
                replace_positions(
                    conn,
                    player["player_id"],
                    player["mapped_positions"],
                    player["source_sort_key"],
                )
                inserted_or_seen += 1

            except Exception as exc:
                errors += 1
                print(
                    f"[WARN] Ligne {row_number} ignorée : {exc}",
                    file=sys.stderr,
                )

            if inserted_or_seen % 1000 == 0 and inserted_or_seen > 0:
                conn.commit()

            if limit is not None and inserted_or_seen >= limit:
                break

    conn.commit()

    final_count = conn.execute("SELECT COUNT(*) FROM players").fetchone()[0]
    nations = conn.execute(
        "SELECT COUNT(DISTINCT nationality_name) FROM players"
    ).fetchone()[0]

    print(f"CSV lu             : {processed:,} lignes")
    print(f"Lignes candidates  : {inserted_or_seen:,}")
    print(f"Lignes ignorées    : {skipped:,}")
    print(f"Erreurs             : {errors:,}")
    print(f"Joueurs en base     : {final_count:,}")
    print(f"Nationalités        : {nations:,}")
    print(f"Base créée          : {db_path.resolve()}")

    conn.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Construit la base joueurs FUT Manager depuis un CSV FIFA/EA FC."
    )
    parser.add_argument("csv_path", type=Path, help="Chemin vers le CSV Kaggle")
    parser.add_argument("db_path", type=Path, help="Chemin de sortie SQLite")
    parser.add_argument(
        "--fifa-version",
        default=None,
        help="Filtrer une version FIFA précise, ex: 26",
    )
    parser.add_argument(
        "--min-overall",
        type=int,
        default=None,
        help="Ignorer les joueurs sous cet overall source.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Limiter le nombre de lignes candidates, utile pour tester.",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Supprimer la base existante avant reconstruction.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()

    if not args.csv_path.exists():
        raise SystemExit(f"CSV introuvable : {args.csv_path}")

    build_database(
        csv_path=args.csv_path,
        db_path=args.db_path,
        fifa_version=args.fifa_version,
        min_overall=args.min_overall,
        limit=args.limit,
        replace=args.replace,
    )
