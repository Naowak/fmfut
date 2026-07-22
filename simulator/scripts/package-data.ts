import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BetterSqliteAdapter } from "../lib/data/sqlite-adapter";
import { resolvePlayersDatabasePath } from "../lib/data/player-repository";

export interface PackageDataOptions {
  databasePath: string;
  outputDirectory: string;
  allowUnverified?: boolean;
}

export async function packagePlayersDatabase(options: PackageDataOptions) {
  const sourcePath = path.resolve(options.databasePath);
  const outputDirectory = path.resolve(options.outputDirectory);
  const adapter = new BetterSqliteAdapter(sourcePath);
  try {
    const integrity = adapter.prepare("PRAGMA integrity_check").get() as
      | { integrity_check?: string }
      | undefined;
    if (integrity?.integrity_check !== "ok") {
      throw new Error(`Intégrité SQLite invalide: ${integrity?.integrity_check}`);
    }

    const metadataRows = adapter
      .prepare("SELECT key, value FROM dataset_metadata")
      .all() as Array<{ key: string; value: string }>;
    const metadata = Object.fromEntries(
      metadataRows.map(({ key, value }) => [key, value]),
    );
    assertReleaseMetadata(metadata, options.allowUnverified ?? false);

    const playerCount = Number(
      (adapter.prepare("SELECT COUNT(*) AS count FROM players").get() as { count: number }).count,
    );
    const ftsCount = Number(
      (adapter.prepare("SELECT COUNT(*) AS count FROM players_fts").get() as { count: number }).count,
    );
    if (playerCount !== Number(metadata.player_count) || ftsCount !== playerCount) {
      throw new Error(
        `Volumes incohérents: metadata=${metadata.player_count}, players=${playerCount}, fts=${ftsCount}.`,
      );
    }

    const databaseSha256 = await sha256(sourcePath);
    await mkdir(outputDirectory, { recursive: true });
    const packagedDatabase = path.join(outputDirectory, "players.db");
    await copyFile(sourcePath, packagedDatabase);
    if ((await sha256(packagedDatabase)) !== databaseSha256) {
      throw new Error("La copie packagée de players.db ne correspond pas à la source.");
    }

    const manifest = {
      format: "fmfut-player-dataset-package/v1",
      database: "players.db",
      databaseSha256,
      playerCount,
      ftsCount,
      metadata,
    };
    await writeFile(
      path.join(outputDirectory, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    return manifest;
  } finally {
    adapter.close();
  }
}

export function assertReleaseMetadata(
  metadata: Record<string, string>,
  allowUnverified: boolean,
): void {
  for (const key of ["schema_version", "source_filename", "source_sha256", "player_count", "license_status"]) {
    if (!metadata[key]) throw new Error(`Métadonnée obligatoire absente: ${key}.`);
  }
  if (metadata.license_status === "verified-redistributable") {
    for (const key of ["source_url", "license_name", "license_url"]) {
      if (!metadata[key]) {
        throw new Error(`Une release redistribuable exige la métadonnée ${key}.`);
      }
    }
    return;
  }
  if (!allowUnverified) {
    throw new Error(
      "Dataset non redistribuable: renseigne une licence vérifiée lors de la reconstruction, " +
        "ou utilise --allow-unverified uniquement pour un test local.",
    );
  }
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function main() {
  const args = process.argv.slice(2);
  const outputIndex = args.indexOf("--output");
  const databaseIndex = args.indexOf("--database");
  if (outputIndex === -1 || !args[outputIndex + 1]) {
    throw new Error("Usage: npm run package:data -- --output <dossier> [--database <db>] [--allow-unverified]");
  }
  const manifest = await packagePlayersDatabase({
    databasePath:
      databaseIndex >= 0 && args[databaseIndex + 1]
        ? args[databaseIndex + 1]
        : resolvePlayersDatabasePath(),
    outputDirectory: args[outputIndex + 1],
    allowUnverified: args.includes("--allow-unverified"),
  });
  console.log(JSON.stringify(manifest, null, 2));
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  void main();
}
