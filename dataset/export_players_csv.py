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
    parser.add_argument("--db_path", type=Path)
    parser.add_argument("--output_csv", type=Path)
    args = parser.parse_args()

    conn = sqlite3.connect(args.db_path)
    conn.row_factory = sqlite3.Row

    rows = conn.execute(QUERY)
    first = rows.fetchone()

    with args.output_csv.open("w", encoding="utf-8", newline="") as handle:
        if first is None:
            raise SystemExit("La base ne contient aucun joueur.")

        writer = csv.DictWriter(handle, fieldnames=first.keys())
        writer.writeheader()
        writer.writerow(dict(first))

        for row in rows:
            writer.writerow(dict(row))

    conn.close()
    print(f"Export créé : {args.output_csv.resolve()}")


if __name__ == "__main__":
    main()
