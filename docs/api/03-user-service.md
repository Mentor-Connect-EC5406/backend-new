# user-service API

Base URL (dev): `http://localhost:8081`. See `00-conventions.md` for headers, errors and formats.

`email` comes from the JWT `email` claim. The new user's `id` and `externalAuthId` are both set to the JWT `sub` claim. None of them are accepted in the body.

## UserResponse

```json
{
  "id": "5f1c0b7e-2d1a-4c55-9a77-1c2f6f3a9b10",
  "email": "kamal@example.com",
  "firstName": "Kamal",
  "lastName": "Perera",
  "phone": "+94771234567",
  "profileImageKey": null,
  "role": "STUDENT",
  "accountStatus": "ACTIVE",
  "createdAt": "2026-11-01T10:00:00.000Z",
  "updatedAt": "2026-11-01T10:00:00.000Z"
}
```

## POST /api/users/register

Create the user after the first Asgardeo login. Also creates an empty student profile when the role is STUDENT. Access: Any logged-in user.

Request:

```json
{
  "role": "STUDENT",
  "firstName": "Kamal",
  "lastName": "Perera",
  "phone": "+94771234567"
}
```

| Field | Rule |
|---|---|
| `role` | required, `STUDENT` or `MENTOR` (ADMIN is rejected) |
| `firstName`, `lastName` | required, 1 to 100 characters |
| `phone` | optional, 7 to 15 digits, may start with `+` |

Responses: `201` UserResponse, `400` validation error, `401`, `409` user already registered.

## GET /api/users/me

Current user. Access: Any.

Responses: `200` UserResponse, `401`, `403` account not ACTIVE, `404` not registered yet (the frontend then calls register).

## PUT /api/users/me

Update the current user. Access: Any.

Request:

```json
{
  "firstName": "Kamal",
  "lastName": "Perera",
  "phone": "+94771234567",
  "profileImageKey": "avatars/5f1c0b7e/9d2e.png"
}
```

| Field | Rule |
|---|---|
| `firstName`, `lastName` | required, 1 to 100 characters |
| `phone`, `profileImageKey` | optional |

Responses: `200` UserResponse, `400`, `401`, `403`.

## POST /api/users/me/avatar-upload-url

Get a presigned Cloudflare R2 URL for the profile image. Access: Any.

Request:

```json
{ "contentType": "image/png" }
```

Allowed `contentType`: `image/jpeg`, `image/png`, `image/webp`.

Response `200`:

```json
{
  "uploadUrl": "https://<account>.r2.cloudflarestorage.com/...",
  "key": "avatars/5f1c0b7e/9d2e.png",
  "expiresInSeconds": 300
}
```

Flow: the client sends the file with `PUT` to `uploadUrl`, then calls `PUT /api/users/me` with `profileImageKey` set to `key`.

Responses: `200`, `400` unsupported type, `401`.

## GET /api/students/me/profile

Access: Student.

Response `200` StudentProfileResponse:

```json
{
  "id": "a3b8d1c4-7f20-4e31-8c4d-2b9f6e7a1d55",
  "userId": "5f1c0b7e-2d1a-4c55-9a77-1c2f6f3a9b10",
  "university": "University of Ruhuna",
  "faculty": "Engineering",
  "degree": "Computer Engineering",
  "academicYear": 3,
  "bio": "Interested in backend development",
  "interests": ["Software", "Cloud"],
  "skills": ["Java"],
  "headline": "Final year engineering student",
  "location": "Galle",
  "links": { "linkedin": "", "github": "https://github.com/kamal", "website": "" },
  "experience": [
    { "id": "e1", "role": "Intern", "organization": "WSO2", "startMonth": "2026-01", "endMonth": null, "description": "Backend work" }
  ],
  "education": [
    { "id": "d1", "school": "University of Ruhuna", "degree": "BSc", "field": "Computer Engineering", "startYear": "2023", "endYear": null }
  ],
  "certificates": [
    { "id": "c1", "name": "AWS Cloud Practitioner", "issuer": "AWS", "issuedMonth": "2026-03", "credentialUrl": "" }
  ],
  "projects": [
    { "id": "p1", "title": "MentorConnect", "description": "Mentoring platform", "url": "", "skills": ["TypeScript"] }
  ],
  "languages": [{ "name": "Sinhala", "level": "Native" }],
  "workPreferences": {
    "openToOpportunities": true,
    "desiredRoles": ["Backend Engineer"],
    "workTypes": ["Internship"],
    "arrangements": ["Hybrid", "Remote"]
  },
  "visibility": { "isPublic": false, "showEmail": false, "showPhone": false },
  "updatedAt": "2026-11-01T10:00:00.000Z"
}
```

Empty sections come back as `""`, `[]` or `false`. No endpoint returns a student profile to other users yet.

Responses: `200`, `401`, `403` not a STUDENT.

## PUT /api/students/me/profile

Access: Student.

Request:

```json
{
  "university": "University of Ruhuna",
  "faculty": "Engineering",
  "degree": "Computer Engineering",
  "academicYear": 3,
  "bio": "Interested in backend development",
  "interests": ["Software", "Cloud"]
}
```

Also accepts every section shown in the response above. A field that is not sent keeps its value.

| Field | Rule |
|---|---|
| `academicYear` | optional, 1 to 10 |
| `bio` | optional, up to 600 characters |
| `headline` | optional, up to 120 characters |
| `interests` | optional, up to 5 |
| `skills` | optional, up to 10 |
| `languages` | optional, up to 6, level `Basic`, `Conversational`, `Fluent` or `Native` |
| `experience`, `education`, `certificates`, `projects` | optional, up to 10 entries each, descriptions up to 400 characters |
| months, years | `YYYY-MM`, `YYYY` |
| `links`, `credentialUrl`, project `url` | empty, or start with `http://` or `https://` |
| `workPreferences.desiredRoles` | up to 5 |
| `university`, `faculty`, `degree` | optional text |

Responses: `200` StudentProfileResponse, `400`, `401`, `403`.

## GET /internal/users/{id}

Called by booking-service. Not for the frontend.

Response `200`:

```json
{
  "id": "5f1c0b7e-2d1a-4c55-9a77-1c2f6f3a9b10",
  "role": "STUDENT",
  "accountStatus": "ACTIVE"
}
```

Responses: `200`, `404`.


## GET /internal/users?ids=id1,id2

Called by mentor-service to get names for mentor lists. Not for the frontend. Maximum 100 ids.

Response `200`:

```json
[
  {
    "id": "8d2e7a10-5b3c-4d6e-9f01-2a3b4c5d6e7f",
    "firstName": "Nimal",
    "lastName": "Silva",
    "profileImageKey": "avatars/8d2e/1f3a.png"
  }
]
```

Ids that do not exist are left out. Responses: `200`, `400` more than 100 ids.