// Writes migrations/0002_seed.sql with one ADMIN user who logs in through Asgardeo.
// Run from the repo root: node scripts/make-admin-seed.mjs [output path]
// Create the admin in Asgardeo first; the User ID is in User Management > Users > the admin > User ID.
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const out = process.argv[2] ?? "migrations/0002_seed.sql";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// piped stdin (tests) or an interactive terminal
const lines = process.stdin.isTTY
  ? null
  : (await new Promise((resolve) => { let d = ""; process.stdin.on("data", (c) => (d += c)); process.stdin.on("end", () => resolve(d)); })).split(/\r?\n/);
const ask = (q) => {
  if (lines) return process.stdout.write(q + "\n"), Promise.resolve(lines.shift() ?? "");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(q, (a) => { rl.close(); resolve(a); }));
};

const email = (await ask("Admin email (same as in Asgardeo): ")).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("Not a valid email"); process.exit(1); }
const sub = (await ask("Asgardeo User ID of the admin: ")).trim();
if (!UUID.test(sub)) { console.error("The Asgardeo User ID must be a UUID"); process.exit(1); }
const firstName = (await ask("First name [Platform]: ")).trim() || "Platform";
const lastName = (await ask("Last name [Admin]: ")).trim() || "Admin";

const esc = (s) => s.replace(/'/g, "''");
// id and external_auth_id are the Asgardeo sub, like POST /api/users/register
const sql = `-- ADMIN account (the only way to create one, see CLAUDE.md); the admin logs in through Asgardeo
INSERT INTO users (id, external_auth_id, email, first_name, last_name, role, account_status)
VALUES ('${sub.toLowerCase()}', '${sub}', '${esc(email)}', '${esc(firstName)}', '${esc(lastName)}', 'ADMIN', 'ACTIVE');
`;
writeFileSync(out, sql);
console.log(`Wrote ${out} for ${email}`);
