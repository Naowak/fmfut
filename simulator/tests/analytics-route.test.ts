import { describe, expect, it } from "vitest";
import { POST } from "../app/api/analytics/monte-carlo/route";

describe("POST /api/analytics/monte-carlo", () => {
  it("returns individual and positional decision profiles", async () => {
    const request = new Request("http://localhost/api/analytics/monte-carlo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        runs: 10,
        seedPrefix: "analytics-contract",
        sensitivity: false,
      }),
    });
    const response = await POST(request);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.baseline.matches).toBe(10);
    expect(payload.individual.length).toBeGreaterThanOrEqual(22);
    expect(payload.positions).toEqual(
      expect.arrayContaining([expect.objectContaining({ position: "GK" }), expect.objectContaining({ position: "ST" })]),
    );
    expect(payload.individual[0].per90).toHaveProperty("defensiveActions");
  });
});
