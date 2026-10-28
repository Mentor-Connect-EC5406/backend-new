import type { D1Migration } from "cloudflare:test";
import type { Env } from "../src/config/env";

// bindings the tests see: the Worker Env plus test-only values from vitest.config.ts
declare global {
  namespace Cloudflare {
    interface Env extends EnvBase {
      TEST_SIGNING_JWK: string;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
  type EnvBase = Env;
}

export {};
