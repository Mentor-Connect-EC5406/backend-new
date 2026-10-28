# MentorConnect Edge API

Sprint 2 backend for MentorConnect: one Cloudflare Worker (Hono + TypeScript) with a Cloudflare D1 (SQLite) database, managed with Wrangler. The React frontend (Netlify) calls this API.

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
| Auth | Asgardeo (OIDC, RS256 access tokens checked with JWKS via Web Crypto); local-only password login with JWT HS256 and PBKDF2-SHA256 |

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
│   └── 0002_seed.sql          admin user (password hash only)
├── scripts/
│   └── make-admin-seed.mjs    writes 0002_seed.sql (asks for the admin's Asgardeo User ID)
├── docs/
│   ├── api/                   API specs, API-CHECKS.md, postman/edge-api/
│   └── database/              ER diagram and source schemas
└── src/
    ├── index.ts               app, CORS, health, route mounting, error handlers, cron handler
    ├── config/                Env type, Asgardeo and local JWT checks, auth middleware, CurrentUser, requireRole
    ├── exception/             ApiError factories, error handler, 404 handler
    ├── util/                  time, uuid, password hash, pagination, zod parse helpers, R2 presign
    ├── auth/                  local-only password register and login
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
JWT_SECRET=use-a-long-random-string-here
PASSWORD_LOGIN=true
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET=mentorconnect-files-dev
```

Paste the R2 values without quotes or `< >`. Values here override `wrangler.toml`: `PASSWORD_LOGIN=true` turns on the local password login, and `R2_BUCKET` sends local uploads to the dev bucket.

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

### Create a local admin user

ADMIN accounts cannot be registered through the API. `migrations/0002_seed.sql` creates one ADMIN user when the migrations are applied. It holds only the PBKDF2 hash of the local test password, so ask the developer who generated it for the password (never share it in git or chat). Generate it again with `node scripts/make-admin-seed.mjs`; give the admin's Asgardeo User ID so the same account can also log in through Asgardeo.

For local testing you can also promote a registered test user:

```bash
curl -X POST http://localhost:8787/api/auth/register -H "Content-Type: application/json" -d "{\"email\":\"admin@x.com\",\"password\":\"Passw0rd!\",\"role\":\"STUDENT\",\"firstName\":\"Admin\",\"lastName\":\"X\"}"
npx wrangler d1 execute mentorconnect-db --local --command "UPDATE users SET role='ADMIN' WHERE email='admin@x.com'"
```

The role is read from the database on every request, so the next request already has the ADMIN role.

## Configuration and secrets

| Name | Where | Purpose |
|---|---|---|
| `ALLOWED_ORIGINS` | `wrangler.toml` `[vars]` | comma-separated CORS origins, for example `http://localhost:5173,https://your-site.netlify.app`. Default `http://localhost:5173` |
| `ASGARDEO_ISSUER` | `wrangler.toml` `[vars]` | `https://api.asgardeo.io/t/teamcylix/oauth2/token`, must equal the token `iss` |
| `ASGARDEO_JWKS_URL` | `wrangler.toml` `[vars]` | `https://api.asgardeo.io/t/teamcylix/oauth2/jwks`, public keys for the token signature |
| `ASGARDEO_CLIENT_ID` | `wrangler.toml` `[vars]` | the MentorConnect application client id, must be in the token `aud` |
| `PASSWORD_LOGIN` | `wrangler.toml` `[vars]` (`"false"`), `.dev.vars` (`true`) | turns on `/api/auth/*` and HS256 tokens. Keep it off in production |
| `JWT_SECRET` | `.dev.vars` only | HS256 signing key for the local password login. Never put it in code, docs, Postman files or git |
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
| user | `users` (`external_auth_id` = Asgardeo sub, `password_hash` only for local password users), `student_profiles` |
| mentor | `mentors`, `expertise_categories`, `expertises`, `mentor_expertises`, `availability_slots`, `mentor_verifications` |
| booking | `bookings`, `mentoring_sessions`, `reviews` |
| notification | `notifications`, `conversations`, `conversation_participants`, `messages` |

Other tables (payments, refunds, mentorship, analytics) exist for later sprints.

Important constraints:

- `uq_bookings_active_slot`: one live booking per slot (partial unique index, prevents double booking)
- `trg_reviews_require_completed`: a review is allowed only for a COMPLETED booking
- ids are UUID text, timestamps are UTC ISO-8601 text with milliseconds, money is in cents, enums are uppercase text

## Authentication

Login is handled by Asgardeo (organization `teamcylix`, application MentorConnect). The frontend signs the user in with the Asgardeo SDK and sends the access token as `Authorization: Bearer <token>`.

The Worker checks the token:

- RS256 signature with the Asgardeo JWKS (keys cached for 10 minutes, refreshed for an unknown `kid`)
- `iss` equals `ASGARDEO_ISSUER`, `aud` contains `ASGARDEO_CLIENT_ID`, `exp` and `nbf` (60 seconds clock skew)
- the token `sub` is looked up in `users.external_auth_id`; the role and account status come from D1, never from the token. An account that is not `ACTIVE` gives 403, so a suspended user cannot use an old token

First login:

1. `GET /api/users/me` returns 404 `User is not registered`. Other protected routes return 403 until the user registers.
2. The frontend asks for the role and calls `POST /api/users/register` with `{ "role": "STUDENT", "firstName": "Kamal", "lastName": "Perera", "phone": "+94771234567" }` (role `STUDENT` or `MENTOR`, phone optional).
3. The user is created with `id` and `externalAuthId` = token `sub` and `email` from the token `email` claim (Asgardeo must send it: application > User Attributes). A STUDENT also gets an empty student profile. Answers: `201`, `400` (validation or no `email` claim), `401`, `409` already registered or email taken.

Asgardeo application settings: redirect URLs and allowed origins `http://localhost:5173` and the Netlify URL, access token type JWT, scopes `openid profile email`.

### Local password login (testing only)

With `PASSWORD_LOGIN=true` in `.dev.vars`, `POST /api/auth/register` and `POST /api/auth/login` return `{ "token": "...", "user": { ... } }` and HS256 tokens are accepted. In `wrangler.toml` it is `"false"`, so in production these routes answer 404 and HS256 tokens get 401.

- JWT HS256, claims `sub` (`external_auth_id`), `email`, `role`, `exp` (24 hours).
- Passwords: PBKDF2-SHA256, random salt per user, 100000 iterations (the Workers maximum), stored as `pbkdf2$iterations$salt$hash`. Asgardeo users have no password and cannot use this login.

Register body:

```json
{
  "email": "kamal@example.com",
  "password": "Passw0rd!",
  "role": "STUDENT",
  "firstName": "Kamal",
  "lastName": "Perera",
  "phone": "+94771234567"
}
```

Login body: `{ "email": "...", "password": "..." }`.

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
  "path": "/api/auth/register",
  "fieldErrors": [{ "field": "email", "message": "must be a valid email" }]
}
```

`fieldErrors` appears only for 400 validation errors.

## Endpoints

Status of every endpoint is tracked in `docs/api/API-CHECKS.md`. "Any" means any logged-in user.

### Public

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{ "status": "UP", "time": "..." }` |
| POST | `/api/auth/register` | local only (`PASSWORD_LOGIN=true`), STUDENT or MENTOR |
| POST | `/api/auth/login` | local only (`PASSWORD_LOGIN=true`) |

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

## Testing with Postman

Collections are in `docs/api/postman/edge-api/`:

| File | Content |
|---|---|
| `mentorconnect-edge-api.postman_collection.json` | auth, user, mentor, student profile and upload-url requests |
| `mentorconnect-edge-api-flow.postman_collection.json` | end-to-end flow: setup, booking, session, notifications, conversations (56 requests) |
| `mentorconnect-edge-api-asgardeo.postman_collection.json` | real Asgardeo login (OAuth 2.0 with PKCE): me before register, register, me after |

The first two use the local password login (`PASSWORD_LOGIN=true`). Steps:

1. Apply migrations and run `npm run dev`.
2. Create the admin user (see [Create a local admin user](#create-a-local-admin-user)).
3. Import a collection, keep `baseUrl` as `http://127.0.0.1:8787` (or `http://localhost:8787`).
4. Run the collection top to bottom with the Collection Runner. The requests save ids and tokens into collection variables, so do not run single requests out of order.

With newman (not a project dependency):

```bash
npx newman run docs/api/postman/edge-api/mentorconnect-edge-api-flow.postman_collection.json
```

Asgardeo collection (run by hand in Postman, newman cannot open the login page):

1. In the Asgardeo console add `https://oauth.pstmn.io/v1/callback` to the application's Authorized redirect URLs (Protocol tab).
2. Import the collection, open the collection's Authorization tab and click **Get New Access Token**. Log in with an Asgardeo test user in the browser window, then **Use Token**.
3. Send the requests in order. Use a test user that is not registered yet.

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
2. Add the Netlify URL to `ALLOWED_ORIGINS` in `wrangler.toml` and to the CORS policy of the `mentorconnect-files` bucket.
3. Create the admin user in Asgardeo, then run `node scripts/make-admin-seed.mjs` with that email and its Asgardeo User ID, before `migrations apply --remote`. After that, `0001` and `0002` must not be edited; schema or seed changes go into a new `0003_*.sql`.
4. Keep `PASSWORD_LOGIN = "false"` in `wrangler.toml`. Production needs no `JWT_SECRET`.
5. Add the Netlify URL to the Asgardeo application's redirect URLs and allowed origins.

After deploying, `<worker url>/api/health` must return `{"status":"UP",...}`.

## Team and git workflow

| Developer | Owns |
|---|---|
| Ravindu (ravinduanushka) | `package.json`, `wrangler.toml`, `tsconfig.json`, `.gitignore`, `src/index.ts`, `src/config`, `src/exception`, `src/util`, `src/auth`, `src/user`, `src/mentor`, `docs/api/API-CHECKS.md`, `docs/api/postman` |
| Dasuni (dasunisenanayake25) | `migrations/`, `src/booking`, `src/notification`, the real `database_id`, deploy |

- Branch `feature/<name>` from `dev`, pull request into `dev`, merge after review.
- Commit messages are one line: `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...`.
- Do not change paths or JSON shapes without telling the frontend developers.

## Known gaps and next steps

- R2 checks the file size only when the key is saved, and files that are uploaded but never saved, or replaced later, are not deleted yet.
- Payments are not implemented: confirming a booking needs no payment.
- `/internal/*` endpoints from the service specs are not built.
- Not yet covered by Postman: `/api/health`, session start (success case), session complete, reviews. Reviews cannot be reached in the flow because a review needs a COMPLETED booking and a session can only start 15 minutes before its slot.
- The spec docs in `docs/api` still describe the Spring microservices (ports 8081 to 8086, the payment-service confirm). The Worker follows them except where this README says otherwise.
- Postman covers Asgardeo only through the manual Asgardeo collection; automated runs use the local password login.
