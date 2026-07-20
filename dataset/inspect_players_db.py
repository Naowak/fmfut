#!/usr/bin/env python3
"""
Petite CLI de contrôle de la base joueurs.
"""

from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("db_path", type=Path)
    parser.add_argument("--position", default=None)
    parser.add_argument("--nation", default=None)
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()

    conn = sqlite3.connect(args.db_path)
    conn.row_factory = sqlite3.Row

    sql = """
    SELECT
        p.short_name,
        p.nationality_name,
        p.primary_position,
        p.overall,
        p.speed,
        p.shooting,
        p.passing,
        p.physical,
        p.technique,
        p.intelligence
    FROM players p
    WHERE 1 = 1
    """
    params = []

    if args.position:
        sql += """
        AND EXISTS (
            SELECT 1
            FROM player_positions pp
            WHERE pp.player_id = p.player_id
              AND pp.position = ?
        )
        """
        params.append(args.position.upper())

    if args.nation:
        sql += " AND p.nationality_name LIKE ?"
        params.append(f"%{args.nation}%")

    sql += " ORDER BY p.overall DESC, p.short_name ASC LIMIT ?"
    params.append(args.limit)

    rows = conn.execute(sql, params).fetchall()

    if not rows:
        print("Aucun joueur trouvé.")
        return

    headers = list(rows[0].keys())
    widths = {
        h: max(len(h), max(len(str(row[h])) for row in rows))
        for h in headers
    }

    print(" | ".join(h.ljust(widths[h]) for h in headers))
    print("-+-".join("-" * widths[h] for h in headers))

    for row in rows:
        print(" | ".join(str(row[h]).ljust(widths[h]) for h in headers))

    conn.close()


if __name__ == "__main__":
    main()
