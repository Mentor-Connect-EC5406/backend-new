# API checks

Built: the route exists in the Worker. Tested: passed in Postman.

Collections in `docs/api/postman/edge-api/`:
- `mentorconnect-edge-api.postman_collection.json`: auth, user and mentor endpoints
- `mentorconnect-edge-api-flow.postman_collection.json`: end-to-end flow (54 requests, 104 assertions passed) covering auth, mentor, booking, notification and conversation endpoints

Known gaps:
- Reviews (`POST /api/bookings/{id}/review`, `GET /api/reviews`) are not tested, because a review needs a COMPLETED booking and the session can only start 15 minutes before the slot, so the flow cannot reach it.
- `POST /api/bookings/{id}/session/start` is called only for the 409 "too early" case, so the success case is not tested. `session/complete` depends on it.
- `GET /api/health` is not called by any collection.

| Service | Method | Path | Built | Tested |
|---|---|---|---|---|
| health | GET | /api/health | ✅ | ⬜ |
| auth | POST | /api/auth/register | ✅ | ✅ |
| auth | POST | /api/auth/login | ✅ | ✅ |
| user | GET | /api/users/me | ✅ | ✅ |
| user | PUT | /api/users/me | ✅ | ✅ |
| user | GET | /api/users | ✅ | ✅ |
| user | PUT | /api/users/{id}/status | ✅ | ✅ |
| user | POST | /api/users/me/avatar-upload-url | ✅ | ✅ |
| user | GET | /api/students/me/profile | ✅ | ✅ |
| user | PUT | /api/students/me/profile | ✅ | ✅ |
| mentor | GET | /api/mentors/me | ✅ | ✅ |
| mentor | PUT | /api/mentors/me | ✅ | ✅ |
| mentor | GET | /api/mentors | ✅ | ✅ |
| mentor | GET | /api/mentors/{id} | ✅ | ✅ |
| mentor | GET | /api/expertise-categories | ✅ | ✅ |
| mentor | POST | /api/expertise-categories | ✅ | ✅ |
| mentor | POST | /api/expertise-categories/{id}/expertises | ✅ | ✅ |
| mentor | PUT | /api/mentors/me/expertises | ✅ | ✅ |
| mentor | POST | /api/mentors/me/slots | ✅ | ✅ |
| mentor | GET | /api/mentors/me/slots | ✅ | ✅ |
| mentor | PUT | /api/mentors/me/slots/{slotId} | ✅ | ✅ |
| mentor | DELETE | /api/mentors/me/slots/{slotId} | ✅ | ✅ |
| mentor | GET | /api/mentors/{id}/slots | ✅ | ✅ |
| mentor | POST | /api/mentors/me/verifications | ✅ | ✅ |
| mentor | GET | /api/mentors/me/verifications | ✅ | ✅ |
| mentor | GET | /api/verifications | ✅ | ✅ |
| mentor | PUT | /api/verifications/{id} | ✅ | ✅ |
| mentor | POST | /api/mentors/me/verification-upload-url | ✅ | ✅ |
| booking | POST | /api/bookings | ✅ | ✅ |
| booking | GET | /api/bookings | ✅ | ✅ |
| booking | GET | /api/bookings/{id} | ✅ | ✅ |
| booking | POST | /api/bookings/{id}/confirm | ✅ | ✅ |
| booking | POST | /api/bookings/{id}/cancel | ✅ | ✅ |
| booking | GET | /api/bookings/{id}/session | ✅ | ✅ |
| booking | POST | /api/bookings/{id}/session/start | ✅ | ⬜ |
| booking | POST | /api/bookings/{id}/session/complete | ✅ | ⬜ |
| booking | POST | /api/bookings/{id}/review | ✅ | ⬜ |
| booking | GET | /api/reviews | ✅ | ⬜ |
| notification | GET | /api/notifications | ✅ | ✅ |
| notification | PUT | /api/notifications/read-all | ✅ | ✅ |
| notification | PUT | /api/notifications/{id}/read | ✅ | ✅ |
| notification | POST | /api/conversations | ✅ | ✅ |
| notification | GET | /api/conversations | ✅ | ✅ |
| notification | GET | /api/conversations/{id}/messages | ✅ | ✅ |
| notification | POST | /api/conversations/{id}/messages | ✅ | ✅ |
| notification | PUT | /api/conversations/{id}/read | ✅ | ✅ |
| notification | POST | /api/conversations/{id}/attachment-upload-url | ✅ | ✅ |
