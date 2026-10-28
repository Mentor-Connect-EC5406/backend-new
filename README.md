# MentorConnect Edge API

Sprint 2 backend for MentorConnect: one Cloudflare Worker (Hono + TypeScript) with a Cloudflare D1 (SQLite) database, managed with Wrangler. The React frontend (Cloudflare Pages) calls this API. Login is Asgardeo only.

The long-term target is the Spring Boot microservices repo (github.com/ravinduanushka/backend). The modules here mirror those services so the code can be moved later.

## Contents

- [Tech stack](#tech-stack)
- [Scope](#scope)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Configuration and secrets](#configuration-and-secrets)
- [Database](#database)
- [Authentication](#authentication)
- [API conventions](#api-conventions)
- [Endpoints](#endpoints)
- [Business rules](#business-rules)
- [Automated tests](#automated-tests)
- [Testing with Postman](#testing-with-postman)
- [Deployment](#deployment)
- [Team and git workflow](#team-and-git-workflow)
- [Known gaps and next steps](#known-gaps-and-next-steps)

## Tech stack

| Area | Choice |
|---|---|
| Runtime | Cloudflare Workers |
| Framework | Hono 4 |
| Language | TypeScript (strict) |
| Validation | zod 4 |
| Database | Cloudflare D1 (SQLite), binding `DB`, database `mentorconnect-db` |
| Tooling | Wrangler 4 |
| Auth | Asgardeo only (OIDC, RS256 access tokens checked with the JWKS via Web Crypto) |
| Files | Cloudflare R2 (S3 API presigned URLs, SigV4 via Web Crypto) |

Worker name `mentorconnect-api`, entry `src/index.ts`.

## Scope

In Sprint 2:

- auth, user, mentor, booking, notification (including conversations and messages)
- admin user management and mentor verification review
- file uploads to Cloudflare R2 (profile images, verification documents, chat images)

Out of scope (later): payments and Lemon Squeezy, real email, analytics, mentorship programs, `/internal/*` service endpoints.

## Project structure

```
backend-new/
├── CLAUDE.md                  rules for Claude Code
├── README.md
├── package.json
├── tsconfig.json
├── wrangler.toml              D1 binding, cron trigger, [vars]
├── .dev.vars                  local secrets (git ignored)
├── migrations/
│   ├── 0001_init.sql          full schema, all tables
│   └── 0002_seed.sql          admin user (Asgardeo User ID and email)
├── scripts/
│   └── make-admin-seed.mjs    writes 0002_seed.sql (asks for the admin's Asgardeo User ID)
├── test/                      Vitest tests (npm test), helpers and setup
├── vitest.config.ts           test runtime, fake Asgardeo JWKS and fake R2
├── .github/workflows/         CI: type check and tests
├── docs/
│   ├── api/                   API specs, API-CHECKS.md, postman/edge-api/
│   └── database/              ER diagram and source schemas
└── src/
    ├── index.ts               app, CORS, health, route mounting, error handlers, cron handler
    ├── config/                Env type, Asgardeo token check, auth middleware, CurrentUser, requireRole
    ├── exception/             ApiError factories, error handler, 404 handler
    ├── util/                  time, uuid, pagination, zod parse helpers, R2 presign
    ├── user/                  register after Asgardeo login, me, admin user management, student profile
    ├── mentor/                profile, search, expertise, slots, verification
    ├── booking/               bookings, sessions, reviews, expiry cron
    ├── notification/          notifications, conversations, messages
    └── file/                  GET /api/files/{key} from R2 with access rules
```

Every module has the same layers:

| Layer | Responsibility |
|---|---|
| `controller/` | Hono routes, zod validation of body and query, calls the service |
| `service/` | business rules, role and ownership checks, throws `ApiError` |
| `repository/` | D1 SQL only, always prepared statements with `bind()` |
| `entity/` | row types (snake_case, as in the tables) |
| `dto/` | zod schemas and request/response types (camelCase) |

A module may read another module's tables with SQL. It writes to another module's tables only where a rule says so (for example booking updates `availability_slots.status`).

## Getting started

Requirements: Node.js 20 or newer and npm.

```bash
npm install
```

Create `.dev.vars` in the project root (it is git ignored):

```
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET=mentorconnect-files-dev
```

Paste the R2 values without quotes or `< >`. Values here override `wrangler.toml`, so `R2_BUCKET` sends local uploads to the dev bucket. Login uses the real Asgardeo also when the Worker runs locally.

After pulling a change to `migrations/0001_init.sql`, reset the local database (local test data only):

```bash
Remove-Item -Recurse -Force .wrangler\state
npx wrangler d1 migrations apply mentorconnect-db --local
```

Apply the migrations to the local D1 database and start the Worker:

```bash
npx wrangler d1 migrations apply mentorconnect-db --local
npm run dev
```

The API is now on `http://localhost:8787`. Check it:

```bash
curl http://localhost:8787/api/health
```

Type check:

```bash
npx tsc --noEmit
```

### The admin user

ADMIN accounts cannot be registered through the API. `migrations/0002_seed.sql` creates one ADMIN user when the migrations are applied. Its `id` and `external_auth_id` are the admin's Asgardeo User ID, so the admin logs in through Asgardeo like everyone else.

1. Create the admin user in the Asgardeo console (User Management > Users).
2. Copy its User ID, then run `node scripts/make-admin-seed.mjs` and give the email and that User ID.
3. Reset the local database (above) so the new seed is applied.

For local testing you can also promote a registered Asgardeo test user:

```bash
npx wrangler d1 execute mentorconnect-db --local --command "UPDATE users SET role='ADMIN' WHERE email='you@example.com'"
```

The role is read from the database on every request, so the next request already has the ADMIN role.

## Configuration and secrets

| Name | Where | Purpose |
|---|---|---|
| `ALLOWED_ORIGINS` | `wrangler.toml` `[vars]` | comma-separated CORS origins, for example `http://localhost:5173,https://mentorconnect.pages.dev`. Default `http://localhost:5173` |
| `ASGARDEO_ISSUER` | `wrangler.toml` `[vars]` | `https://api.asgardeo.io/t/teamcylix/oauth2/token`, must equal the token `iss` |
| `ASGARDEO_JWKS_URL` | `wrangler.toml` `[vars]` | `https://api.asgardeo.io/t/teamcylix/oauth2/jwks`, public keys for the token signature |
| `ASGARDEO_CLIENT_ID` | `wrangler.toml` `[vars]` | the MentorConnect application client id, must be in the token `aud` |
| `DB` | `wrangler.toml` `[[d1_databases]]` | D1 binding. `database_id` must be the real id from `d1 create` |
| `R2_ACCOUNT_ID` | `wrangler.toml` `[vars]` | Cloudflare account id, used for the R2 S3 endpoint |
| `R2_BUCKET` | `wrangler.toml` `[vars]` (`mentorconnect-files`), `.dev.vars` (`mentorconnect-files-dev`) | bucket for uploads |
| `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | `.dev.vars` (local), `wrangler secret put` (deploy) | R2 API token (Object Read & Write on both buckets). Never in code, docs, Postman files or git |

The cron trigger `* * * * *` (every minute) runs the booking expiry job.

### File uploads (Cloudflare R2)

1. The client asks for an upload url (`POST .../avatar-upload-url`, `.../verification-upload-url` or `.../attachment-upload-url` with `{ "contentType": "image/png" }`) and gets `{ uploadUrl, key, expiresInSeconds: 300 }`.
2. The client sends the file with `PUT uploadUrl` and the same `Content-Type`, straight to R2.
3. The client saves `key` (`PUT /api/users/me` `profileImageKey`, `POST /api/mentors/me/verifications` `documentKey`, or a message `attachmentKey`). The API checks the key belongs to the caller and that the file exists and is within the size limit (avatar 5 MB, document and attachment 10 MB).
4. Files are read through `GET /api/files/{key}`. Avatars need no token, so they work in `<img src>`. Verification documents need the admin or the owning mentor; chat attachments need a participant. Admins also get a 300 second `documentUrl` in `GET /api/verifications`.

Keys look like `avatars/{userId}/{uuid}.png`, `verifications/{mentorId}/{uuid}.pdf` and `attachments/{conversationId}/{uuid}.png`. Both buckets need a CORS policy that allows `PUT` and `GET` with the `Content-Type` header from the frontend origins.

## Database

`migrations/0001_init.sql` holds the whole schema (26 tables), merged from `docs/database/schema/*.sql`. Cross-service foreign keys are not used: ids from another service stay logical references.

Main tables used now:

| Module | Tables |
|---|---|
| user | `users` (`external_auth_id` = Asgardeo sub, no passwords are stored), `student_profiles` |
| mentor | `mentors`, `expertise_categories`, `expertises`, `mentor_expertises`, `availability_slots`, `mentor_verifications` |
| booking | `bookings`, `mentoring_sessions`, `reviews` |
| notification | `notifications`, `conversations`, `conversation_participants`, `messages` |

Other tables (payments, refunds, mentorship, analytics) exist for later sprints.

Important constraints:

- `uq_bookings_active_slot`: one live booking per slot (partial unique index, prevents double booking)
- `trg_reviews_require_completed`: a review is allowed only for a COMPLETED booking
- ids are UUID text, timestamps are UTC ISO-8601 text with milliseconds, money is in cents, enums are uppercase text

## Authentication

Login is handled only by Asgardeo (organization `teamcylix`, application MentorConnect); the API has no password login. The frontend signs the user in with the Asgardeo SDK and sends the access token as `Authorization: Bearer <token>`. Any other token (HS256, opaque, another application) gets 401.

The Worker checks the token:

- RS256 signature with the Asgardeo JWKS (keys cached for 10 minutes, refreshed for an unknown `kid`)
- `iss` equals `ASGARDEO_ISSUER`, `aud` contains `ASGARDEO_CLIENT_ID`, `exp` and `nbf` (60 seconds clock skew)
- the token `sub` is looked up in `users.external_auth_id`; the role and account status come from D1, never from the token. An account that is not `ACTIVE` gives 403, so a suspended user cannot use an old token

First login:

1. `GET /api/users/me` returns 404 `User is not registered`. Other protected routes return 403 until the user registers.
2. The frontend asks for the role and calls `POST /api/users/register` with `{ "role": "STUDENT", "firstName": "Kamal", "lastName": "Perera", "phone": "+94771234567" }` (role `STUDENT` or `MENTOR`, phone optional).
3. The user is created with `id` and `externalAuthId` = token `sub` and `email` from the token `email` claim. A STUDENT also gets an empty student profile. Answers: `201`, `400` (validation or no `email` claim), `401`, `409` already registered or email taken.

Asgardeo application settings (Applications > MentorConnect):

- Protocol: Authorized redirect URLs and Allowed origins `http://localhost:5173` and the Cloudflare Pages URL; access token type **JWT**; access token attributes include **email**
- User Attributes: Email (and first and last name) requested
- Scopes requested by the frontend: `openid profile email`

## API conventions

Full text: `docs/api/00-conventions.md`.

- JSON field names are camelCase, database columns are snake_case.
- Status codes: 200 read or update, 201 create, 204 no body, 400 invalid, 401 no or bad token, 403 wrong role or not ACTIVE, 404 not found, 409 conflict, 500 unexpected.
- Pagination: `page` from 0, `size` default 20 and max 100. Response:

```json
{ "content": [], "page": 0, "size": 20, "totalElements": 0, "totalPages": 0 }
```

- Error body (an unknown route returns the same shape with 404):

```json
{
  "timestamp": "2026-11-01T10:00:00.000Z",
  "status": 400,
  "error": "BAD_REQUEST",
  "message": "Validation failed",
  "path": "/api/users/register",
  "fieldErrors": [{ "field": "role", "message": "must be STUDENT or MENTOR" }]
}
```

`fieldErrors` appears only for 400 validation errors.

## Endpoints

Status of every endpoint is tracked in `docs/api/API-CHECKS.md`. "Any" means any logged-in user.

### Public

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ "status": "UP", "time": "..." }` |
| GET | `/api/files/avatars/...` | profile images (see Files) |

Login itself happens in Asgardeo, not in this API.

### User

| Method | Path | Access |
|---|---|---|
| POST | `/api/users/register` | valid Asgardeo token, not yet registered (role STUDENT or MENTOR) |
| GET | `/api/users/me` | Any (404 when not registered yet) |
| PUT | `/api/users/me` | Any |
| POST | `/api/users/me/avatar-upload-url` | Any (body `contentType` image/jpeg, image/png or image/webp) |
| GET | `/api/students/me/profile` | Student (creates an empty profile if missing) |
| PUT | `/api/students/me/profile` | Student (partial update, `academicYear` 1 to 10) |
| GET | `/api/users` | Admin (`role`, `accountStatus`, `q`, `page`, `size`) |
| PUT | `/api/users/{id}/status` | Admin (`ACTIVE` or `SUSPENDED`, an admin cannot suspend themselves: 409) |

### Mentor

| Method | Path | Access |
|---|---|---|
| GET | `/api/mentors/me` | Mentor |
| PUT | `/api/mentors/me` | Mentor (201 first time, 200 update) |
| GET | `/api/mentors` | Student (APPROVED only; `q`, `industry`, `expertiseId`, `minRating`, `page`, `size`) |
| GET | `/api/mentors/{id}` | Any (non APPROVED visible only to the mentor and admin) |
| GET | `/api/expertise-categories` | Any |
| POST | `/api/expertise-categories` | Admin |
| POST | `/api/expertise-categories/{id}/expertises` | Admin |
| PUT | `/api/mentors/me/expertises` | Mentor |
| POST | `/api/mentors/me/slots` | Mentor |
| GET | `/api/mentors/me/slots` | Mentor (`status`, `from`, `to`) |
| PUT | `/api/mentors/me/slots/{slotId}` | Mentor (only AVAILABLE or BLOCKED slots) |
| DELETE | `/api/mentors/me/slots/{slotId}` | Mentor (409 if HELD or BOOKED) |
| GET | `/api/mentors/{id}/slots` | Student (AVAILABLE future slots, range up to 31 days) |
| POST | `/api/mentors/me/verification-upload-url` | Mentor (body `contentType` application/pdf, image/jpeg or image/png, else 400; 404 if the mentor has no profile) |
| POST | `/api/mentors/me/verifications` | Mentor (`documentKey` must start with `verifications/{mentorId}/`) |
| GET | `/api/mentors/me/verifications` | Mentor |
| GET | `/api/verifications` | Admin (`status`, `page`, `size`) |
| PUT | `/api/verifications/{id}` | Admin (`APPROVED` or `REJECTED`, `reviewNote` required when REJECTED) |

### Booking

| Method | Path | Access |
|---|---|---|
| POST | `/api/bookings` | Student |
| GET | `/api/bookings` | Student, Mentor (`status`, `page`, `size`) |
| GET | `/api/bookings/{id}` | The student, the mentor, Admin |
| POST | `/api/bookings/{id}/confirm` | The student of the booking |
| POST | `/api/bookings/{id}/cancel` | The student or mentor (optional `reason`) |
| GET | `/api/bookings/{id}/session` | The student or mentor |
| POST | `/api/bookings/{id}/session/start` | The mentor |
| POST | `/api/bookings/{id}/session/complete` | The mentor |
| POST | `/api/bookings/{id}/review` | The student (`rating` 1 to 5, optional `comment`) |
| GET | `/api/reviews` | Any (`mentorId` required) |

### Notification and chat

| Method | Path | Access |
|---|---|---|
| GET | `/api/notifications` | Any (`status`, `page`, `size`) |
| PUT | `/api/notifications/read-all` | Any |
| PUT | `/api/notifications/{id}/read` | Any (own only) |
| POST | `/api/conversations` | Any (body `participantId`, 201 new, 200 existing) |
| GET | `/api/conversations` | Any |
| GET | `/api/conversations/{id}/messages` | Participant |
| POST | `/api/conversations/{id}/messages` | Participant |
| PUT | `/api/conversations/{id}/read` | Participant |
| POST | `/api/conversations/{id}/attachment-upload-url` | Participant (body `contentType` image/jpeg, image/png or image/webp) |

### Files

| Method | Path | Access |
|---|---|---|
| GET | `/api/files/{key}` | avatars: no token; verifications: Admin or the owning mentor; attachments: participants |

## Business rules

- Roles: `STUDENT`, `MENTOR`, `ADMIN`. A `SUSPENDED` account gets 403 on login and on every protected route.
- Only `APPROVED` mentors can be found in search, have public slots, and be booked. A new mentor profile starts as `PENDING`; an admin approving a verification sets the mentor to `APPROVED`.
- Slot status flow: `AVAILABLE` to `HELD` (booking created) to `BOOKED` (confirmed). Cancel or expiry sets it back to `AVAILABLE`. `BLOCKED` is set by the mentor.
- Booking flow:
  1. The student creates a booking: `PENDING`, the slot is `HELD`, `expiresAt` is 15 minutes ahead. The booking and the hold are written in one `db.batch()`. Price = `hourlyRateCents` x session minutes / 60.
  2. The student confirms (no real payment yet): `CONFIRMED`, slot `BOOKED`, a session is created as `SCHEDULED` with a Jitsi meeting URL. Confirming again returns 200.
  3. The mentor starts the session from 15 minutes before `scheduledStart` until `scheduledEnd`, then completes it. The booking becomes `COMPLETED`.
  4. The student can then review the booking. The mentor rating is updated.
- Double booking is blocked by the slot status and by `uq_bookings_active_slot`.
- Cron (every minute): cancels expired `PENDING` bookings and sets their slot back to `AVAILABLE`.
- Notifications are created in code (no HTTP) by the booking module when a booking is created, confirmed and cancelled.
- Names and profile data of a mentor come from the `users` table (a join), not from `mentors`.

## Automated tests

```bash
npm test
```

The tests in `test/` run with Vitest and `@cloudflare/vitest-plugin` inside the real Workers runtime (workerd) against a local D1 database. Every test file starts from a fresh database with all migrations applied, so no server, database reset or real tokens are needed.

| File | Covers |
|---|---|
| `auth.test.ts` | Asgardeo token checks (expired, wrong audience or issuer, unknown key, `alg: none`, HS256, tampered), first login and register, suspended users, role from the database |
| `user.test.ts` | `/api/users/me`, student profile, admin user list and status |
| `mentor.test.ts` | profile, approval gate, verification review, expertise and search, slots |
| `booking.test.ts` | slot HOLD and pricing, double booking, confirm, cancel, session window, review and rating, expiry cron |
| `notification.test.ts` | booking notifications, read and read-all, conversations, messages, unread counts |
| `file.test.ts` | R2 upload urls, key ownership, size limits, `GET /api/files` access rules |

How the outside services are replaced (only in `vitest.config.ts`, never in `src/`):

- **Asgardeo:** the config creates a test RSA key pair and answers the JWKS request with its public key; `test/helpers.ts` signs Asgardeo-style tokens with the private key. The Worker code is the same as in production.
- **R2:** an in-memory store answers the presigned requests and checks their SigV4 signatures, so a wrong signature or Content-Type fails with 403 like real R2. No real bucket or keys are used.

`npm run typecheck` checks both `src/` and `test/`. GitHub Actions (`.github/workflows/test.yml`) runs the type check and the tests on every pull request and push to `dev` and `main`.

## Testing with Postman

Collections are in `docs/api/postman/edge-api/`:

| File | Content |
|---|---|
| `mentorconnect-edge-api.postman_collection.json` | register, user, mentor, student profile and upload-url requests |
| `mentorconnect-edge-api-flow.postman_collection.json` | end-to-end flow: setup, booking, session, notifications, conversations (56 requests) |
| `mentorconnect-edge-api-asgardeo.postman_collection.json` | real Asgardeo login (OAuth 2.0 with PKCE): me before register, register, me after |

All requests use real Asgardeo access tokens.

Getting a token (Postman desktop app):

1. In the Asgardeo console add `https://oauth.pstmn.io/v1/callback` to the application's Authorized redirect URLs (Protocol tab).
2. Import `mentorconnect-edge-api-asgardeo.postman_collection.json`, open the collection's Authorization tab and click **Get New Access Token**. Log in with an Asgardeo user in the browser window, then **Use Token**. The token is shown in Manage Access Tokens; copy it from there.

Running the main and flow collections:

1. Create the Asgardeo test users: the admin from `0002_seed.sql`, a mentor, a student, and a fourth user (`outsiderToken` in the flow collection, `mentorNoProfileToken` in the main one).
2. Reset the local database so those users are not registered yet, then `npm run dev`.
3. Get one token per user (above) and paste them into the collection variables `adminToken`, `mentorToken`, `studentToken` and the fourth one. Tokens expire after about an hour.
4. Run the collection top to bottom with the Collection Runner. The setup requests register the users through `POST /api/users/register`, and ids are saved into collection variables, so do not run single requests out of order. Reset the database again before the next run.

With newman (not a project dependency), pass the tokens as variables:

```bash
npx newman run docs/api/postman/edge-api/mentorconnect-edge-api-flow.postman_collection.json --env-var adminToken=... --env-var mentorToken=... --env-var studentToken=... --env-var outsiderToken=...
```

The Asgardeo collection checks a single user's first login: me before register (404), register (201), me (200), register again (409).

## Deployment

Only the developer who owns the Cloudflare account runs these:

```bash
npx wrangler login
npx wrangler d1 create mentorconnect-db
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
npx wrangler d1 migrations apply mentorconnect-db --remote
npm run deploy
```

Before the first deploy:

1. Put the real `database_id` from `d1 create` into `wrangler.toml`.
2. Add the Cloudflare Pages URL of the frontend to `ALLOWED_ORIGINS` in `wrangler.toml` and to the CORS policy of the `mentorconnect-files` bucket.
3. Create the admin user in Asgardeo, then run `node scripts/make-admin-seed.mjs` with that email and its Asgardeo User ID, before `migrations apply --remote`. After that, `0001` and `0002` must not be edited; schema or seed changes go into a new `0003_*.sql`.
4. Add the Cloudflare Pages URL to the Asgardeo application's redirect URLs and allowed origins.

### Frontend on Cloudflare Pages

The React frontend is deployed by the frontend developers: Workers & Pages > Create > Pages > Connect to Git, framework preset React (Vite), build command `npm run build`, output directory `dist`, and environment variables for the API URL and the Asgardeo client id and base URL (`https://api.asgardeo.io/t/teamcylix`). Without a top-level `404.html`, Pages serves `index.html` for every route, so client-side routes work on refresh.

After deploying, `<worker url>/api/health` must return `{"status":"UP",...}`.

## Team and git workflow

| Developer | Owns |
|---|---|
| Ravindu (ravinduanushka) | `package.json`, `wrangler.toml`, `tsconfig.json`, `.gitignore`, `src/index.ts`, `src/config`, `src/exception`, `src/util`, `src/user`, `src/mentor`, `docs/api/API-CHECKS.md`, `docs/api/postman` |
| Dasuni (dasunisenanayake25) | `migrations/`, `scripts/`, `src/booking`, `src/notification`, `src/file`, `test/`, `vitest.config.ts`, `.github/workflows`, the real `database_id`, deploy |

- Branch `feature/<name>` from `dev`, pull request into `dev`, merge after review.
- Commit messages are one line: `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`.
- Do not change paths or JSON shapes without telling the frontend developers.

## Known gaps and next steps

- R2 checks the file size only when the key is saved, and files that are uploaded but never saved, or replaced later, are not deleted yet.
- Payments are not implemented: confirming a booking needs no payment.
- `/internal/*` endpoints from the service specs are not built.
- Not yet covered by Postman: `/api/health`, session start (success case), session complete, reviews. Reviews cannot be reached in the flow because a review needs a COMPLETED booking and a session can only start 15 minutes before its slot.
- The spec docs in `docs/api` still describe the Spring microservices (ports 8081 to 8086, the payment-service confirm). The Worker follows them except where this README says otherwise.
- Postman runs need fresh Asgardeo tokens (about one hour) and unregistered Asgardeo users, so the local database is reset before each run.
