import { applyD1Migrations, env } from "cloudflare:test";

// fresh schema and seed before every test file
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
