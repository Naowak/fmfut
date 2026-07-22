import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolvePlayersDatabasePath } from "../lib/data/player-repository";
import { BetterSqliteAdapter } from "../lib/data/sqlite-adapter";
import { packagePlayersDatabase } from "./package-data";

async function main() {
  const outputDirectory = await mkdtemp(
    path.join(os.tmpdir(), "fmfut-data-package-"),
  );
  try {
    const manifest = await packagePlayersDatabase({
      databasePath: resolvePlayersDatabasePath(),
      outputDirectory,
      allowUnverified: true,
    });
    const storedManifest = JSON.parse(
      await readFile(path.join(outputDirectory, "manifest.json"), "utf8"),
    ) as typeof manifest;
    if (storedManifest.databaseSha256 !== manifest.databaseSha256) {
      throw new Error("Manifest de package incohérent.");
    }
    const packaged = new BetterSqliteAdapter(
      path.join(outputDirectory, "players.db"),
    );
    try {
      const row = packaged
        .prepare("SELECT COUNT(*) AS count FROM players")
        .get() as { count: number };
      if (row.count !== manifest.playerCount) {
        throw new Error("Base packagée incomplète.");
      }
    } finally {
      packaged.close();
    }
    console.log(
      `Package data vérifié: ${manifest.playerCount} joueurs, SHA-256 ${manifest.databaseSha256}.`,
    );
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
}

void main();
