import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const FRONTEND = "https://mentorconnect.mentorconnect.workers.dev";

describe("CORS", () => {
  it("preflight from the deployed frontend is allowed", async () => {
    const res = await SELF.fetch("https://api.test/api/users/me", {
      method: "OPTIONS",
      headers: {
        Origin: FRONTEND,
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(FRONTEND);
    expect(res.headers.get("Access-Control-Allow-Headers")?.toLowerCase()).toContain("authorization");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("PATCH");
  });

  it("localhost dev origin is allowed", async () => {
    const res = await SELF.fetch("https://api.test/api/health", { headers: { Origin: "http://localhost:5173" } });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });

  it("error responses carry the CORS header so the frontend can read them", async () => {
    const res = await SELF.fetch("https://api.test/api/users/me", { headers: { Origin: FRONTEND } });
    expect(res.status).toBe(401);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(FRONTEND);
  });

  it("unknown origin gets no CORS header", async () => {
    const res = await SELF.fetch("https://api.test/api/health", { headers: { Origin: "https://evil.example" } });
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
