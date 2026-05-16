# Unicorn Recipes

Expo + Fastify + Prisma app for creating and managing recipes.

## Repository Layout

- `src/`: Expo app (Clerk auth UI, recipe screens, tabs)
- `api/src/`: Fastify API (auth, routes, Clerk webhook sync)
- `api/prisma/`: Prisma schema and database configuration

## Auth and User Sync Architecture

Authentication and user data are split between Clerk and the local database:

1. The app signs users in with Clerk.
2. API requests include a Clerk session token.
3. The API verifies that token and resolves the local user by `clerkId`.
4. Local users are created/updated/deleted by Clerk webhook events.

Important behavior:

- The API does not auto-create users during normal requests.
- If a Clerk user has not been synced yet, authenticated endpoints return an error like:
  - `Authenticated user is not synced yet. Wait for Clerk webhook delivery and retry.`

## Environment Variables

### App (`.env` at repo root)

Required:

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `EXPO_PUBLIC_API_BASE_URL` (for simulator this is usually `http://localhost:3000`)

### API (`api/.env`)

Copy `api/.env.example` and fill in:

- `DATABASE_URL`
- `PORT` (default `3000`)
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SIGNING_SECRET`
- `GEMINI_API_KEY` (required for recipe scan endpoint)

The webhook signing secret must match the secret shown in Clerk for your webhook endpoint.

## Local Development Workflow

### 1. Install dependencies

From repo root:

```bash
npm install
cd api && npm install
```

### 2. Prepare database

```bash
cd api
npm run db:generate
npm run db:push
```

### 3. Start API

```bash
cd api
npm run dev
```

API runs on `http://localhost:3000` by default.

### 4. Start app

From repo root:

```bash
npm run ios
```

(or `npm run android` / `npm run web`)

### 5. Expose local API for Clerk webhooks

Use ngrok to expose port 3000:

```bash
ngrok http 3000
```

Copy the HTTPS forwarding URL (example: `https://your-subdomain.ngrok-free.app`).

### 6. Configure Clerk webhook endpoint

In Clerk Dashboard:

- Add endpoint URL:
  - `https://<your-ngrok-domain>/webhooks/clerk`
- Enable events:
  - `user.created`
  - `user.updated`
  - `user.deleted`
- Copy the endpoint signing secret (`whsec_...`) into `api/.env` as `CLERK_WEBHOOK_SIGNING_SECRET`.

If you update `api/.env`, restart API server.

### 7. Validate delivery

In Clerk webhook delivery logs:

- Replay a `user.created` or `user.updated` event
- Confirm HTTP `200` response from your local endpoint
- Retry the app action (for example, loading recipes)

## Troubleshooting

### Symptom: auth works, but API says user is not synced

Likely cause: webhook event has not been delivered or accepted.

Check:

1. ngrok tunnel is active and points to local port 3000.
2. Clerk webhook URL matches your current ngrok URL exactly.
3. `CLERK_WEBHOOK_SIGNING_SECRET` matches the Clerk endpoint secret.
4. You are using the same Clerk environment/instance for:
   - app publishable key
   - API secret key
   - webhook endpoint
5. Clerk delivery logs show successful `2xx` response.

### Symptom: webhook returns 400

Likely cause: signature verification failed.

Check:

- Request includes `svix-id`, `svix-timestamp`, `svix-signature` headers.
- Signing secret is correct and not from a different endpoint/environment.

## Testing

API tests:

```bash
cd api
npm test
```

## Additional Docs

- Webhook implementation details: `api/WEBHOOKS.md`

## Notes

- Webhook sync is the source of truth for local user records.
- If you created users before adding webhooks, trigger `user.updated` in Clerk (or create a new user) to backfill local records.
