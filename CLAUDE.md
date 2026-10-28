# MentorConnect Edge API

## Project
- Sprint 2 backend: one Cloudflare Worker (Hono + TypeScript) with Cloudflare D1 (SQLite), managed with Wrangler
- Worker name `mentorconnect-api`, entry `src/index.ts`, D1 binding `DB` for database `mentorconnect-db`
- The long-term target is the Spring Boot microservices repo (github.com/ravinduanushka/backend). Modules here mirror those services so the code can be moved later
- The React frontend (Cloudflare Pages) is built by two other teammates and calls this API. Do not change paths or JSON shapes without telling them
- Developers: Ravindu (ravinduanushka), Dasuni (dasunisenanayake25). Branch `dev`

## Sprint 2 scope
- In: auth, user, mentor, booking, notification (incl. conversations and messages), admin user management and verification review
- Out (later): payments and Lemon Squeezy, R2 uploads (upload-url endpoints return `{ "uploadUrl": null, "key": null }`), real email, analytics, mentorship programs

## Folder structure
src/
- index.ts: app, CORS, error handlers, route mounting, scheduled (cron) handler
- config/: Env type, Asgardeo token verification, auth middleware, CurrentUser, requireRole
- exception/: ApiError factories, global error handler, 404 handler
- util/: time, uuid, pagination, validation helpers, R2 presign
- user/, mentor/, booking/, notification/: each has controller/, service/, repository/, entity/, dto/; file/ serves R2 files
migrations/: 0001_init.sql (schema), 0002_seed.sql (admin user)
scripts/: make-admin-seed.mjs (writes 0002_seed.sql)
docs/api/: API specs, API-CHECKS.md, postman/edge-api/
docs/database/schema/: source schemas from the Spring repo

## Layers
- controller: Hono routes, zod validation of body and query, calls service, returns response
- service: business rules, role and ownership checks, throws ApiError
- repository: D1 SQL only. Always prepared statements with bind(), never string concatenation
- entity: row types (snake_case, as in the table). dto: request and response types (camelCase)
- A module may read another module's tables with SQL. Writes to another module's tables are allowed only where a rule below says so

## Owners
- Ravindu: package.json, wrangler.toml, tsconfig.json, .gitignore, src/index.ts, src/config, src/exception, src/util, src/user, src/mentor, docs/api/API-CHECKS.md, docs/api/postman
- Dasuni: migrations/, scripts/, src/booking, src/notification, src/file, the real D1 database_id in wrangler.toml, deploy
- Never edit another owner's files unless the developer asks

## API rules
- Follow docs/api/*.md (paths, JSON, status codes) and docs/database/schema/*.sql exactly. If a task conflicts with them, ask first. Never edit docs/api or docs/database unless asked
- Error JSON: { timestamp, status, error, message, path } plus fieldErrors [{ field, message }] for 400 validation. Unknown route gives 404 in the same shape
- Status codes: 200 read or update, 201 create, 204 no body, 400 invalid, 401 no or bad token, 403 wrong role or not ACTIVE, 404 not found, 409 conflict
- Pagination: page from 0, size default 20 max 100. Response { content, page, size, totalElements, totalPages }
- Ids UUID TEXT. Timestamps UTC ISO-8601 TEXT with milliseconds (2026-11-01T10:00:00.000Z). Money in cents. Enums uppercase TEXT

## Auth
- Login is Asgardeo only (org teamcylix); there is no password login in the API. The Worker verifies the RS256 access token with the Asgardeo JWKS and checks iss, aud (client id), exp and nbf. Header: Authorization: Bearer <token>
- The token sub is matched to users.external_auth_id. Role and account status always come from the users table, never from the token
- First login: POST /api/users/register (role STUDENT or MENTOR) creates the users row; id and external_auth_id = sub, email from the token email claim (Asgardeo must put email in the access token)
- Unregistered token: GET /api/users/me gives 404 (frontend then calls register), other protected routes give 403
- A SUSPENDED account gets 403 on every protected route
- ADMIN accounts come only from migrations/0002_seed.sql, written by scripts/make-admin-seed.mjs with the admin's email and Asgardeo User ID

## Business rules
- Roles: STUDENT, MENTOR, ADMIN
- Double booking: unique index uq_bookings_active_slot and slot status. Create the booking and set the slot to HELD in one db.batch()
- The booking module may update availability_slots.status (HELD, BOOKED, AVAILABLE)
- POST /api/bookings/{id}/confirm: only the student of the booking, no real payment. Booking CONFIRMED, slot BOOKED
- Cron (every minute): cancel expired PENDING bookings and set their slot back to AVAILABLE
- Reviews only for COMPLETED bookings (trigger trg_reviews_require_completed). Update the mentor rating after a review
- Notifications: other modules call the notification service function (no HTTP). Create one on booking created, confirmed and cancelled
- Admin cannot suspend their own account (409)

## Config and secrets
- Non-secret settings in wrangler.toml [vars]: ALLOWED_ORIGINS (comma-separated, Cloudflare Pages URL and http://localhost:5173), ASGARDEO_ISSUER, ASGARDEO_JWKS_URL, ASGARDEO_CLIENT_ID, R2_ACCOUNT_ID, R2_BUCKET
- Secrets: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY only, through .dev.vars (local) and wrangler secret put (deploy). Never in code, docs, Postman files or git

## Workflow for Claude Code
- One task at a time. After each task: npx tsc --noEmit, npm run dev, test with curl, then stop and list the Postman requests (method, URL, headers, body, expected status for success, 400, 401/403, 404/409)
- After building an endpoint, set Built to ✅ in docs/api/API-CHECKS.md. Never mark the test columns. The developer does that after Postman
- Postman collection: docs/api/postman/edge-api/mentorconnect-edge-api.postman_collection.json (v2.1, variables baseUrl and token)
- Never run git, wrangler login, wrangler deploy, wrangler d1 create or any command with --remote. Tell the developer the exact command instead
- Do not add features, endpoints or libraries the task did not ask for
- Comments: short, single line, only where needed. No banner comments
- Explain to the developer in Sinhala. Keep code, commands and identifiers in English

## Commands
- npm run dev (local Worker on http://localhost:8787)
- npx wrangler d1 migrations apply mentorconnect-db --local
- npx tsc --noEmit
- Developer only: npx wrangler login, npx wrangler d1 create mentorconnect-db, npx wrangler secret put R2_ACCESS_KEY_ID, npx wrangler secret put R2_SECRET_ACCESS_KEY, npx wrangler d1 migrations apply mentorconnect-db --remote, npm run deploy

## Git (developers, by hand)
- Branch feature/<name> from dev, PR into dev, merge after review
- Commit messages: one line, "feat: ...", "fix: ...", "chore: ...", "docs: ...". No AI co-author lines
- Backlog tickets describe features, not Worker or D1 workarounds