# Clerk Webhooks in API

This document describes how user sync works between Clerk and the local database.

## Endpoint

- Path: `/webhooks/clerk`
- Method: `POST`
- Registered in: `api/src/routes/webhooks.ts`

## Events handled

- `user.created`
- `user.updated`
- `user.deleted`

## Verification

Incoming webhook requests are verified with Clerk/Svix signatures before processing.

Required headers:

- `svix-id`
- `svix-timestamp`
- `svix-signature`

Required env var:

- `CLERK_WEBHOOK_SIGNING_SECRET`

If signature verification fails, endpoint returns `400`.

## Database sync behavior

### user.created / user.updated

- Upserts user in local DB by `clerkId`
- Updates profile fields (email, username, first/last name)

### user.deleted

- Deletes dependent recipes first
- Deletes user by `clerkId`

## Why request-time sync is not used

The API intentionally does not create local users while serving normal authenticated requests.

Reason:

- User lifecycle is centralized in Clerk events.
- API auth remains deterministic: if webhook sync did not happen yet, request fails fast.

Auth helper behavior:

- Clerk token is verified.
- Local user is looked up by `clerkId`.
- If missing, API returns an error indicating user is not synced yet.

## Local development setup

1. Start API:

```bash
cd api
npm run dev
```

2. Expose API with ngrok:

```bash
ngrok http 3000
```

3. Configure Clerk webhook endpoint URL:

- `https://<ngrok-domain>/webhooks/clerk`

4. Copy Clerk endpoint secret into `api/.env`:

- `CLERK_WEBHOOK_SIGNING_SECRET=whsec_...`

5. Restart API after env changes.

## Operational checklist

When users authenticate but API says they are not synced:

1. Confirm ngrok is running and forwarding to local port `3000`.
2. Confirm Clerk endpoint URL matches current ngrok URL.
3. Confirm endpoint secret in Clerk equals `api/.env` value.
4. Confirm webhook delivery logs show real requests with `2xx` responses.
5. Replay `user.created` or `user.updated` from Clerk dashboard.

## Manual test notes

A locally signed test event can validate route logic and DB upsert behavior. If that passes but real users still do not sync, the issue is almost always Clerk endpoint configuration or environment mismatch.
