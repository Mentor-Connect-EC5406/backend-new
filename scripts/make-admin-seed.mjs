// Writes migrations/0002_seed.sql with one ADMIN user. The password is typed hidden and never written anywhere.
// Run from the repo root: node scripts/make-admin-seed.mjs [output path]
// The Asgardeo User ID is in the Asgardeo console: User Management > Users > the admin > User ID.
import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const out = process.argv[2] ?? "migrations/0002_seed.sql";
const ITERATIONS = 100000; // same as src/util/password.ts
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// reads one line; hides typing when attached to a terminal
function ask(question, hidden = false) {
  if (!hidden) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
  }
  return new Promise((resolve) => {
    process.stdout.write(question);
    let value = "";
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    const onData = (ch) => {
      if (ch === "\u0003") { process.stdout.write("\n"); process.exit(1); }
      if (ch === "\r" || ch === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.off("data", onData);
        process.stdout.write("\n");
        resolve(value);
      } else if (ch === "\u0008" || ch === "\u007f") {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    process.stdin.on("data", onData);
  });
}

// stdin piped (tests): read all lines up front
let piped = null;
if (!process.stdin.isTTY) {
  piped = (await new Promise((resolve) => { let d = ""; process.stdin.on("data", (c) => (d += c)); process.stdin.on("end", () => resolve(d)); })).split(/\r?\n/);
}
const next = async (q, hidden) => (piped ? (process.stdout.write(q + "\n"), piped.shift() ?? "") : ask(q, hidden));

const email = (await next("Admin email (same as in Asgardeo): ")).trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { console.error("Not a valid email"); process.exit(1); }
const sub = (await next("Asgardeo User ID of the admin (Enter to skip, local login only): ")).trim();
if (sub && !UUID.test(sub)) { console.error("The Asgardeo User ID must be a UUID"); process.exit(1); }
const password = await next("Local test password (min 12 characters, hidden): ", true);
if (password.length < 12) { console.error("Password must be at least 12 characters"); process.exit(1); }
if ((await next("Repeat password: ", true)) !== password) { console.error("Passwords do not match"); process.exit(1); }

const salt = randomBytes(16);
const hash = pbkdf2Sync(password, salt, ITERATIONS, 32, "sha256").toString("hex");
// id and external_auth_id are the Asgardeo sub, like POST /api/users/register
const id = sub ? sub.toLowerCase() : randomUUID();
const esc = (s) => s.replace(/'/g, "''");

const sql = `-- ADMIN account (the only way to create one, see CLAUDE.md); the password is not stored anywhere in the repo
INSERT INTO users (id, external_auth_id, email, password_hash, first_name, last_name, role, account_status)
VALUES ('${id}', '${sub || id}', '${esc(email)}', 'pbkdf2$${ITERATIONS}$${salt.toString("hex")}$${hash}', 'Platform', 'Admin', 'ADMIN', 'ACTIVE');
`;
writeFileSync(out, sql);
console.log(`Wrote ${out} for ${email}${sub ? " (Asgardeo login enabled)" : " (local password login only)"}`);
