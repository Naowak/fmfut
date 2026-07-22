import { describe, expect, it } from "vitest";
import { GET } from "../app/api/players/metadata/route";

describe("GET /api/players/metadata", () => {
  it("exposes reproducibility and license status", async () => {
    const response = await GET();
    const payload = (await response.json()) as Record<string, string>;
    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      schema_version: "2",
      player_count: "18405",
      nationality_count: "160",
      license_status: "unverified",
      runtime_driver: "better-sqlite3",
    });
    expect(payload.source_sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
