import { describe, expect, it } from "vitest";
import { POST } from "../app/api/matches/simulate/route";

function post(body: string): Request {
  return new Request("http://localhost/api/matches/simulate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/matches/simulate", () => {
  it("simulates from the complete SQLite player source", async () => {
    const response = await POST(
      post(JSON.stringify({ seed: "sqlite-route", logicalSeconds: 60 })),
    );
    const payload = (await response.json()) as {
      contractVersion: string;
      result: { homeName: string; awayName: string };
    };
    expect(response.status).toBe(200);
    expect(payload.contractVersion).toBe("1.0.0");
    expect(payload.result).toMatchObject({
      homeName: "Paris AI",
      awayName: "World XI",
    });
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await POST(post("{"));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Corps JSON invalide.",
    });
  });

  it("returns structured issues for an invalid contract", async () => {
    const response = await POST(post(JSON.stringify({ logicalSeconds: 12 })));
    const payload = (await response.json()) as {
      error: string;
      issues: Array<{ path: string; message: string }>;
    };

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Requête de simulation invalide.");
    expect(payload.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "logicalSeconds" }),
      ]),
    );
  });
});
