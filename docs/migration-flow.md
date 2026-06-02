# Database Migration Flow

This document describes how to work with Prisma migrations in Unicorn Recipes for both development and production.

## Where migrations live

- Prisma schema: `api/prisma/schema.prisma`
- Migration files: `api/prisma/migrations/*/migration.sql`

## Scripts used in this repo

From `api/package.json`:

- `npm run db:generate` -> `prisma generate`
- `npm run db:migrate` -> `prisma migrate dev`
- `npm run db:status` -> `prisma migrate status`
- `npm run db:deploy` -> `prisma migrate deploy`

From repo root:

- `npm run db:status` -> forwards to API script
- `npm run db:deploy` -> forwards to API script

## Development flow

Use this flow when changing database structure locally.

1. Update schema

- Edit `api/prisma/schema.prisma`.

2. Create and apply migration locally

```bash
cd api
npm run db:migrate
```

- This creates a new folder under `api/prisma/migrations/`.
- It also applies the migration to your local database (the database in your current `DATABASE_URL`).

3. Regenerate Prisma client/types

```bash
cd api
npm run db:generate
```

- This does not apply migrations. It only regenerates Prisma client/types (and Prisma Zod output in this repo).

4. Verify

```bash
cd api
npm run db:status
npm test
```

And optionally from repo root:

```bash
npx tsc --noEmit
```

5. Commit

- Commit all of the following together:
- `api/prisma/schema.prisma`
- new migration folder in `api/prisma/migrations/`
- any generated code required by the repo (for example Prisma/Zod outputs, if changed)
- code changes depending on the new schema

## Production flow

Use this flow when deploying to shared/staging/production databases.

1. Merge migration files first

- Ensure migration files are committed and merged to the deploy branch.

2. Run migration deploy on target environment
   From repo root:

```bash
npm run db:deploy
```

Or directly in API folder:

```bash
cd api
npm run db:deploy
```

3. Confirm status

```bash
npm run db:status
```

4. Deploy application code

- Deploy API/app code that depends on the migrated schema.

## Recommended release order

For schema changes that can break old code:

1. Deploy backward-compatible migration.
2. Deploy new application code.
3. (Optional) Run cleanup migration later if needed.

This minimizes downtime and runtime errors during rollout.

## Important notes

- Do not use `prisma migrate dev` against production databases.
- Use `prisma migrate deploy` in production/staging.
- Always back up production database before high-risk migrations (drops/renames/data rewrites).
- If you manually edit SQL in a migration, test it in a staging database before production.

## Quick command reference

Local schema change:

```bash
cd api && npm run db:migrate && npm run db:generate
```

Production apply:

```bash
npm run db:deploy && npm run db:status
```
