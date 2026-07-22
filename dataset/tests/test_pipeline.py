from __future__ import annotations

import csv
import sqlite3
import tempfile
import unittest
from pathlib import Path

from dataset.build_players_db import build_database
from dataset.positions import map_positions
from dataset.stat_formulas import calculate_game_stats


SOURCE_COLUMNS = [
    "player_id",
    "short_name",
    "long_name",
    "player_positions",
    "nationality_name",
    "overall",
    "potential",
    "fifa_version",
    "fifa_update",
    "fifa_update_date",
    "movement_acceleration",
    "movement_sprint_speed",
    "attacking_finishing",
    "power_shot_power",
    "power_long_shots",
    "attacking_volleys",
    "mentality_penalties",
    "attacking_short_passing",
    "mentality_vision",
    "skill_long_passing",
    "attacking_crossing",
    "skill_curve",
    "power_strength",
    "power_stamina",
    "mentality_aggression",
    "power_jumping",
    "movement_balance",
    "skill_ball_control",
    "skill_dribbling",
    "movement_agility",
    "mentality_composure",
    "movement_reactions",
    "mentality_positioning",
    "defending_marking_awareness",
    "mentality_interceptions",
]


def source_row(**overrides: str) -> dict[str, str]:
    row = {column: "75" for column in SOURCE_COLUMNS}
    row.update(
        {
            "player_id": "42",
            "short_name": "Test Player",
            "long_name": "Test Player",
            "player_positions": "LCM, CAM",
            "nationality_name": "France",
            "overall": "75",
            "potential": "80",
            "fifa_version": "26",
            "fifa_update": "1",
            "fifa_update_date": "2026-07-01",
        }
    )
    row.update(overrides)
    return row


class PipelineTests(unittest.TestCase):
    def test_position_mapping_preserves_order_and_deduplicates(self) -> None:
        self.assertEqual(map_positions(["LCM", "CM", "CAM", "CF"]), ["CM", "CAM"])

    def test_missing_stat_is_renormalized(self) -> None:
        row = source_row(movement_acceleration="")
        stats = calculate_game_stats(row, is_goalkeeper=False)
        self.assertEqual(stats["speed"], 75)
        self.assertTrue(all(1 <= value <= 100 for value in stats.values()))

    def test_database_build_is_executable_and_deduplicates_latest_row(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            csv_path = root / "players.csv"
            db_path = root / "players.db"
            with csv_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=SOURCE_COLUMNS)
                writer.writeheader()
                writer.writerow(source_row(overall="70", fifa_update="1"))
                writer.writerow(source_row(overall="82", fifa_update="2"))

            build_database(csv_path, db_path, None, None, None, True)

            connection = sqlite3.connect(db_path)
            player = connection.execute(
                "SELECT overall, primary_position FROM players WHERE player_id = 42"
            ).fetchone()
            positions = connection.execute(
                "SELECT position FROM player_positions WHERE player_id = 42 ORDER BY priority"
            ).fetchall()
            journal_mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
            fts_count = connection.execute(
                "SELECT COUNT(*) FROM players_fts WHERE players_fts MATCH 'Test*'"
            ).fetchone()[0]
            metadata = dict(
                connection.execute("SELECT key, value FROM dataset_metadata")
            )
            connection.close()

            self.assertEqual(player, (82, "CM"))
            self.assertEqual(positions, [("CM",), ("CAM",)])
            self.assertEqual(journal_mode, "delete")
            self.assertEqual(fts_count, 1)
            self.assertEqual(metadata["schema_version"], "2")
            self.assertEqual(metadata["license_status"], "unverified")

    def test_verified_license_metadata_is_recorded(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            csv_path = root / "players.csv"
            db_path = root / "players.db"
            with csv_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.DictWriter(handle, fieldnames=SOURCE_COLUMNS)
                writer.writeheader()
                writer.writerow(source_row())

            build_database(
                csv_path,
                db_path,
                None,
                None,
                None,
                True,
                source_url="https://example.test/source",
                license_status="verified-redistributable",
                license_name="Example License",
                license_url="https://example.test/license",
            )
            connection = sqlite3.connect(db_path)
            metadata = dict(
                connection.execute("SELECT key, value FROM dataset_metadata")
            )
            connection.close()
            self.assertEqual(metadata["license_status"], "verified-redistributable")
            self.assertEqual(metadata["license_name"], "Example License")


if __name__ == "__main__":
    unittest.main()
