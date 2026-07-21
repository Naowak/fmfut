#!/usr/bin/env python3
"""
Exporte la base SQLite normalisée vers un CSV simple.
"""

from __future__ import annotations

import argparse
import csv
import sqlite3
from pathlib import Path


QUERY = """
SELECT
    player_id,
    short_name,
    long_name,
    nationality_name,
    primary_position,
    alternative_positions_json,
    overall,
    potential,
    speed,
    shooting,
    passing,
    physical,
    technique,
    intelligence
FROM players
ORDER BY overall DESC, short_name ASC
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("db_path", nargs="?", type=Path)
    parser.add_argument("output_csv", nargs="?", type=Path)
    parser.add_argument("--db-path", "--db_path", dest="db_path_option", type=Path)
    parser.add_argument(
        "--output-csv",
        "--output_csv",
        dest="output_csv_option",
        type=Path,
    )
    args = parser.parse_args()

    db_path = args.db_path_option or args.db_path
    output_csv = args.output_csv_option or args.output_csv
    if db_path is None or output_csv is None:
        parser.error("db_path et output_csv sont obligatoires")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(QUERY)
    first = rows.fetchone()

    with output_csv.open("w", encoding="utf-8", newline="") as handle:
        if first is None:
            raise SystemExit("La base ne contient aucun joueur.")

        writer = csv.DictWriter(handle, fieldnames=first.keys())
        writer.writeheader()
        writer.writerow(dict(first))

        for row in rows:
            writer.writerow(dict(row))

    conn.close()
    print(f"Export créé : {output_csv.resolve()}")


if __name__ == "__main__":
    main()
