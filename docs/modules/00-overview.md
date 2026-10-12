# API Overview & Conventions

This document set is written for the frontend team integrating against this API. It's kept up
to date module-by-module as the backend is built — `docs/openapi.yaml` is the machine-readable
contract (import it into Postman/Insomnia, or browse it live at `/api-docs`); the `docs/modules/*.md`
files explain the *why* behind each module and anything the spec alone doesn't make obvious.

## Base URL

```
http://localhost:4000/api/v1
```

## Interactive docs

Run the API (`npm run dev`) and open **http://localhost:4000/api-docs** for Swagger UI — you can
try requests directly from the browser once you've logged in and pasted an access token into the
"Authorize" button.

## Response envelope

Every response has the same shape. Always check `success` before reading `data`.

**Single item:**
```json
{ "success": true, "data": { "...": "..." } }
```

**List (paginated):**
```json
{
  "success": true,
  "data": [{ "...": "..." }],
  "pagination": { "page": 1, "pageSize": 25, "totalItems": 132, "totalPages": 6 }
}
```

**Error:**
```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { } },
  "requestId": "a1b2c3..."
}
```

`requestId` is echoed in the `X-Request-Id` response header too — include it when reporting a bug,
it's what we grep the server logs for.

### Error codes you'll actually see

| HTTP | `error.code`          | Meaning                                              |
|------|------------------------|-------------------------------------------------------|
| 400  | `BAD_REQUEST`           | Validation failed — check `error.details`             |
| 401  | `UNAUTHORIZED`          | Missing/expired/invalid access token — refresh or re-login |
| 403  | `FORBIDDEN`             | Authenticated, but this role/user can't do this        |
| 404  | `NOT_FOUND`             | No such resource (or it's outside your organization — we return 404, not 403, to avoid confirming another org's data exists) |
| 409  | `CONFLICT`              | Duplicate (e.g. email/slug already taken)              |
| 422  | `UNPROCESSABLE_ENTITY`  | Well-formed but semantically invalid                   |
| 429  | `TOO_MANY_REQUESTS`     | Rate limited — back off and retry                      |
| 500  | `INTERNAL_ERROR`        | Our bug, not yours — report with the `requestId`        |

## Auth flow (frontend integration)

1. `POST /auth/login` with email/password → get `{ user, accessToken, refreshToken, expiresIn }`.
2. Store `accessToken` in memory (not localStorage — see security note below) and `refreshToken`
   in a secure, httpOnly-if-possible store.
3. Send `Authorization: Bearer <accessToken>` on every request.
4. When a request 401s, call `POST /auth/refresh` with the stored `refreshToken`. It returns a
   **new** `refreshToken` too — always overwrite the old one. The old one stops working
   immediately (rotation).
5. On logout, call `POST /auth/logout` with the current `refreshToken` so the server revokes it.

Access tokens expire in 15 minutes by default. Build refresh into your API client (an axios
interceptor / fetch wrapper that retries once after a silent refresh) rather than handling it
per-screen.

> Security note: access tokens are short-lived JWTs meant to sit in memory. If you must persist
> across a hard refresh, prefer storing only the `refreshToken`, not the `accessToken`, and calling
> `/auth/refresh` on app boot.

## Pagination

Any list endpoint accepts `?page=1&pageSize=25` (`pageSize` max 200). Both are optional and default
as shown.

## Roles at a glance

`SUPER_ADMIN` → `CAMPAIGN_ADMIN` → `WARD_MANAGER` → `TOLE_COORDINATOR` → `FIELD_WORKER`, plus
`VOLUNTEER` (same permissions as `FIELD_WORKER` — a separate role for roster/reporting reasons,
not a capability difference) and two read-only roles `ANALYST` and `VIEW_ONLY`. Full permission
matrix in
[`01-auth-rbac-geo.md`](./01-auth-rbac-geo.md).

## Modules published so far

| Module | Doc | Status |
|---|---|---|
| Auth / RBAC / Nepal Geo Structure | [01-auth-rbac-geo.md](./01-auth-rbac-geo.md) | ✅ Built |
| Households, Voters & Voter Import | [02-households-voters.md](./02-households-voters.md) | ✅ Built |
| Household GIS (spatial queries) | [03-household-gis.md](./03-household-gis.md) | ✅ Built |
| Canvassing Tasks | [04-canvassing-tasks.md](./04-canvassing-tasks.md) | ✅ Built |
| Nepal Geo Dataset Import | [05-geo-dataset-import.md](./05-geo-dataset-import.md) | ✅ Built |
| Reporting & Analytics | [07-reporting-analytics.md](./07-reporting-analytics.md) | ✅ Built |
| Household Map UI | [08-household-map-ui.md](./08-household-map-ui.md) | ✅ Built |
| Household Family Tree | [09-household-family-tree.md](./09-household-family-tree.md) | ✅ Built |
