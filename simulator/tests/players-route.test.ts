import { describe, expect, it } from "vitest";
import { GET } from "../app/api/players/route";

describe("GET /api/players", () => {
  it("returns a paginated search result", async () => {
    const response = await GET(
      new Request(
        "http://localhost/api/players?query=Mbapp%C3%A9&page=1&pageSize=5",
      ),
    );
    const payload = (await response.json()) as {
      total: number;
      items: Array<{ playerId: number }>;
    };
    expect(response.status).toBe(200);
    expect(payload.total).toBeGreaterThan(0);
    expect(payload.items.map((player) => player.playerId)).toContain(231747);
  });

  it("rejects invalid filters", async () => {
    const response = await GET(
      new Request("http://localhost/api/players?pageSize=500"),
    );
    expect(response.status).toBe(400);
  });
});
