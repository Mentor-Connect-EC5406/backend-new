import { SELF } from "cloudflare:test";
import { expect, it } from "vitest";

it("GET /api/health answers UP", async () => {
  const res = await SELF.fetch("https://api.test/api/health");
  expect(res.status).toBe(200);
  expect(((await res.json()) as { status: string }).status).toBe("UP");
});
