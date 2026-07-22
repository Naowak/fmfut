PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS players (
    player_id INTEGER PRIMARY KEY,

    short_name TEXT NOT NULL,
    long_name TEXT,

    nationality_id INTEGER,
    nationality_name TEXT NOT NULL,

    age INTEGER,
    dob TEXT,
    height_cm INTEGER,
    weight_kg INTEGER,
    preferred_foot TEXT,

    overall INTEGER,
    potential INTEGER,

    primary_position TEXT NOT NULL,
    alternative_positions_json TEXT NOT NULL,
    source_positions_json TEXT NOT NULL,
    is_goalkeeper INTEGER NOT NULL DEFAULT 0,

    speed INTEGER NOT NULL CHECK(speed BETWEEN 1 AND 100),
    shooting INTEGER NOT NULL CHECK(shooting BETWEEN 1 AND 100),
    passing INTEGER NOT NULL CHECK(passing BETWEEN 1 AND 100),
    physical INTEGER NOT NULL CHECK(physical BETWEEN 1 AND 100),
    technique INTEGER NOT NULL CHECK(technique BETWEEN 1 AND 100),
    intelligence INTEGER NOT NULL CHECK(intelligence BETWEEN 1 AND 100),

    fifa_version TEXT,
    fifa_update TEXT,
    fifa_update_date TEXT,
    source_sort_key TEXT NOT NULL,

    source_stats_json TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_positions (
    player_id INTEGER NOT NULL,
    position TEXT NOT NULL,
    priority INTEGER NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (player_id, position),
    FOREIGN KEY (player_id) REFERENCES players(player_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_players_nationality
    ON players(nationality_name);

CREATE INDEX IF NOT EXISTS idx_players_primary_position
    ON players(primary_position);

CREATE INDEX IF NOT EXISTS idx_players_overall
    ON players(overall);

CREATE INDEX IF NOT EXISTS idx_player_positions_position
    ON player_positions(position);

CREATE TABLE IF NOT EXISTS dataset_metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS players_fts USING fts5(
    short_name,
    long_name,
    nationality_name,
    content='players',
    content_rowid='player_id',
    tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS players_fts_insert AFTER INSERT ON players BEGIN
    INSERT INTO players_fts(rowid, short_name, long_name, nationality_name)
    VALUES (new.player_id, new.short_name, new.long_name, new.nationality_name);
END;

CREATE TRIGGER IF NOT EXISTS players_fts_delete AFTER DELETE ON players BEGIN
    INSERT INTO players_fts(players_fts, rowid, short_name, long_name, nationality_name)
    VALUES ('delete', old.player_id, old.short_name, old.long_name, old.nationality_name);
END;

CREATE TRIGGER IF NOT EXISTS players_fts_update AFTER UPDATE ON players BEGIN
    INSERT INTO players_fts(players_fts, rowid, short_name, long_name, nationality_name)
    VALUES ('delete', old.player_id, old.short_name, old.long_name, old.nationality_name);
    INSERT INTO players_fts(rowid, short_name, long_name, nationality_name)
    VALUES (new.player_id, new.short_name, new.long_name, new.nationality_name);
END;
